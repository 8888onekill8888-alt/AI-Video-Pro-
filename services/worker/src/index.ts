import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker, type ConnectionOptions } from 'bullmq';
import { createProviders } from '@storyflix/providers';
import type { StoryProject } from '@storyflix/shared';
import { renderProjectToMp4 } from './render.js';
import { runDubbingPipeline, type DubbingOutput } from './dubbing.js';
import { WorkerAssetStore } from './asset-store.js';

config();
config({ path: '../../.env' });

interface WorkerTask {
  id: string;
  projectId: string;
  ownerId: string;
  type: string;
  payload: Record<string, unknown>;
  cancelRequested?: boolean;
}

const env = process.env;
if (!env.REDIS_URL) throw new Error('REDIS_URL is required to start the background worker');
const redisUrl = new URL(env.REDIS_URL);
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
  db: Number(redisUrl.pathname.slice(1) || 0),
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};
const providers = createProviders(env);
const assetStore = new WorkerAssetStore(env);
const queueName = 'cineforge-generation';

async function persistRender(task: WorkerTask, project: StoryProject, resolution: '720p' | '1080p' | '4k') {
  const rendered = await renderProjectToMp4(project, env.FFMPEG_PATH, resolution);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
    const bucket = env.SUPABASE_STORAGE_BUCKET ?? 'cineforge-assets';
    const path = `${task.ownerId}/${project.id}/${randomUUID()}-${rendered.filename}`;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const upload = await fetch(`${endpoint}/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': rendered.mimeType, 'x-upsert': 'false' }, body: new Uint8Array(rendered.bytes), signal: AbortSignal.timeout(120_000),
    });
    if (!upload.ok) throw new Error(`Rendered file storage failed (${upload.status})`);
    const signed = await fetch(`${endpoint}/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 86_400 }), signal: AbortSignal.timeout(15_000),
    });
    if (!signed.ok) throw new Error(`Rendered file signing failed (${signed.status})`);
    const signedBody = await signed.json() as { signedURL?: string };
    return { url: signedBody.signedURL?.startsWith('http') ? signedBody.signedURL : `${endpoint}${signedBody.signedURL}`, filename: rendered.filename, mimeType: rendered.mimeType, size: rendered.bytes.length, resolution: rendered.resolution, durationSeconds: rendered.durationSeconds, demo: false };
  }
  const outputDirectory = resolve(env.OUTPUT_DIR ?? './exports');
  await mkdir(outputDirectory, { recursive: true });
  const filePath = resolve(outputDirectory, `${project.id}-${Date.now()}-${rendered.filename}`);
  await writeFile(filePath, rendered.bytes, { flag: 'wx' });
  return { url: `file://${filePath}`, filename: rendered.filename, mimeType: rendered.mimeType, size: rendered.bytes.length, resolution: rendered.resolution, durationSeconds: rendered.durationSeconds, demo: true, mode: 'DEMO_RENDER' };
}

async function persistDubbing(task: WorkerTask, result: DubbingOutput) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase Storage is required to persist dubbed media');
  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
  const bucket = env.SUPABASE_STORAGE_BUCKET ?? 'cineforge-assets';
  const storageKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const basePath = `${task.ownerId}/${task.projectId}`;
  const outputs = [
    { category: 'renders', filename: result.filename, mimeType: 'video/mp4', bytes: result.video },
    { category: 'subtitles', filename: `${result.filename.replace(/\.mp4$/, '')}.srt`, mimeType: 'application/x-subrip', bytes: Buffer.from(result.subtitles) },
  ];
  const assets = [];
  for (const output of outputs) {
    const path = `${basePath}/${output.category}/${randomUUID()}-${output.filename}`;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const uploaded = await fetch(`${endpoint}/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${storageKey}`, apikey: storageKey, 'Content-Type': output.mimeType, 'x-upsert': 'false' },
      body: new Uint8Array(output.bytes),
      signal: AbortSignal.timeout(120_000),
    });
    if (!uploaded.ok) throw new Error(`Dubbing asset upload failed (${uploaded.status})`);
    const signed = await fetch(`${endpoint}/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${storageKey}`, apikey: storageKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 86_400 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!signed.ok) throw new Error(`Dubbing asset signing failed (${signed.status})`);
    const signedBody = await signed.json() as { signedURL?: string };
    if (!signedBody.signedURL) throw new Error('Storage did not return a dubbing asset URL');
    assets.push({ path, filename: output.filename, mimeType: output.mimeType, size: output.bytes.length, url: signedBody.signedURL.startsWith('http') ? signedBody.signedURL : `${endpoint}${signedBody.signedURL}` });
  }
  return { video: assets[0], subtitles: assets[1], durationSeconds: result.durationSeconds, sourceLanguage: result.sourceLanguage, targetLanguage: result.targetLanguage, cues: result.cues };
}

const worker = new Worker<WorkerTask>(queueName, async (job) => {
  const task = job.data;
  const update = async (percent: number, message: string) => job.updateProgress({ percent, message });
  if (task.cancelRequested) throw new Error('Job cancelled before processing');
  await update(8, 'Preparing project context');
  const payload = task.payload;
  switch (task.type) {
    case 'VIDEO_GENERATION': {
      await update(22, 'Submitting video generation');
      const generationOptions = { durationSeconds: Number(payload.durationSeconds ?? 5), onProgress: (message: string) => { void update(50, message); } };
      const generated = payload.imageUrl
        ? await providers.video.generateFromImage(String(payload.imageUrl), String(payload.prompt ?? ''), generationOptions)
        : await providers.video.generateFromText(String(payload.prompt ?? ''), { ...generationOptions, aspectRatio: String(payload.aspectRatio ?? '16:9') });
      const result = await assetStore.persist(task, generated);
      await update(96, 'Video is ready');
      return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
    }
    case 'IMAGE_GENERATION': {
      const scene = payload.scene as StoryProject['scenes'][number] | undefined;
      const characters = Array.isArray(payload.characters) ? payload.characters as StoryProject['characters'] : [];
      const generated = scene
        ? await providers.image.generateStoryboard(scene, String(payload.shotPrompt ?? payload.prompt ?? scene.imagePrompt), characters)
        : await providers.image.generatePoster(String(payload.title ?? 'Cineforge'), String(payload.prompt ?? 'Cinematic frame'));
      const result = await assetStore.persist(task, generated);
      return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
    }
    case 'CHARACTER_GENERATION': {
      const generated = await providers.image.generateCharacter(payload.character as Parameters<typeof providers.image.generateCharacter>[0], String(payload.variant ?? 'portrait'));
      const result = await assetStore.persist(task, generated);
      return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
    }
    case 'LOCATION_GENERATION': {
      const generated = await providers.image.generateLocation(payload.location as Parameters<typeof providers.image.generateLocation>[0], String(payload.variant ?? 'exterior'));
      const result = await assetStore.persist(task, generated);
      return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
    }
    case 'TTS_GENERATION': {
      const options = { language: String(payload.language ?? 'English'), accent: String(payload.accent ?? ''), emotion: String(payload.emotion ?? 'neutral'), speed: Number(payload.speed ?? 1) };
      const generated = payload.kind === 'dialogue'
        ? await providers.tts.generateDialogue(String(payload.text ?? ''), String(payload.voice ?? ''), options)
        : await providers.tts.generateNarration(String(payload.text ?? ''), String(payload.voice ?? ''), options);
      const result = await assetStore.persist(task, generated);
      return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
    }
    case 'VIDEO_RENDER':
    case 'EXPORT': {
      const project = payload.project as StoryProject | undefined;
      if (!project?.id || !Array.isArray(project.scenes)) throw new Error('A valid project timeline is required to render');
      await update(28, 'Rendering timeline with FFmpeg');
      const result = await persistRender(task, project, payload.resolution === '1080p' || payload.resolution === '4k' ? payload.resolution : '720p');
      await update(98, 'Saving finished MP4');
      return result;
    }
    case 'STORY_ANALYSIS': {
      const result = await providers.text.analyzeStory({ title: String(payload.title ?? 'Untitled'), story: String(payload.story ?? ''), genre: String(payload.genre ?? 'Drama') });
      return { result, demo: providers.text.demo };
    }
    case 'SCRIPT_GENERATION': {
      const result = await providers.text.generateScript({ title: String(payload.title ?? 'Untitled'), story: String(payload.story ?? ''), genre: String(payload.genre ?? 'Drama') });
      return { result, demo: providers.text.demo };
    }
    case 'TRANSLATION':
      return { translation: await providers.translation.translate(String(payload.text ?? ''), String(payload.language ?? 'English'), Array.isArray(payload.names) ? payload.names.map(String) : []), demo: providers.translation.demo };
    case 'DUBBING_GENERATION': {
      const project = payload.project as StoryProject | undefined;
      if (!project?.id || project.id !== task.projectId) throw new Error('Dubbing project context is invalid');
      const output = await runDubbingPipeline({
        sourceUrl: String(payload.sourceUrl ?? ''), filename: String(payload.filename ?? 'source.mp4'), mimeType: String(payload.mimeType ?? 'video/mp4'),
        sourceLanguage: String(payload.sourceLanguage ?? ''), targetLanguage: String(payload.targetLanguage ?? ''), voice: String(payload.voice ?? ''),
        speed: Number(payload.speed ?? 1), subtitles: payload.subtitles !== false, project,
      }, providers, update, env);
      await update(98, 'Saving dubbed video and subtitles');
      return persistDubbing(task, output);
    }
    case 'SUBTITLE_GENERATION':
      return { format: 'vtt', content: 'WEBVTT\n\n', demo: true };
    default:
      throw new Error(`Unsupported job type: ${task.type}`);
  }
}, { connection, concurrency: Number(env.WORKER_CONCURRENCY ?? 2), limiter: { max: Number(env.WORKER_RATE_LIMIT ?? 20), duration: 60_000 } });

worker.on('completed', (job) => console.info(JSON.stringify({ event: 'job_completed', jobId: job.id, type: job.data.type })));
worker.on('failed', (job, error) => console.error(JSON.stringify({ event: 'job_failed', jobId: job?.id, type: job?.data.type, message: error.message })));
worker.on('error', (error) => console.error(JSON.stringify({ event: 'worker_error', message: error.message })));

const shutdown = async () => { await worker.close(); await assetStore.close(); process.exit(0); };
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
console.info(JSON.stringify({ event: 'worker_ready', queue: queueName, providers: providers.status, ffmpeg: env.FFMPEG_PATH ?? 'ffmpeg' }));