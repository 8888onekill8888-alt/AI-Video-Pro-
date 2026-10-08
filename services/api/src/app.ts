import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CREDIT_COSTS, SUPPORTED_LANGUAGES, planLimits,
  type Character, type CreditOperation, type GenerationJob, type JobType,
  type StoryProject, type StoryScene,
} from '@storyflix/shared';
import { createProviders } from '@storyflix/providers';
import type { ProviderSet, GeneratedAsset } from '@storyflix/providers';
import { authenticate, createSupabaseOAuthUrl, forwardSupabaseAuth, type AuthenticatedUser, assertProductionAuthConfigured } from './auth.js';
import { CreditLedger, InsufficientCreditsError } from './credits.js';
import { documentUploadLimit, parseDocument } from './documents.js';
import { createJobQueue, type GenerationTask, type JobQueue } from './jobs.js';
import { createProjectRepository, type ProjectRepository } from './repository.js';
import { buildCharacters, buildLocations, buildScenes, buildShots, normalizeProjectSettings, storyInput } from './story-model.js';
import { createStorageProvider, type StorageProvider } from './storage.js';

declare module 'fastify' {
  interface FastifyRequest { user: AuthenticatedUser | null; }
}

export interface AppOptions {
  env?: Record<string, string | undefined>;
  repository?: ProjectRepository;
  providers?: ProviderSet;
  credits?: CreditLedger;
  jobs?: JobQueue;
  storage?: StorageProvider;
}

const settingsSchema = z.object({
  genre: z.string().trim().min(1).max(80).optional(),
  language: z.string().trim().min(1).max(60).optional(),
  audience: z.string().trim().min(1).max(100).optional(),
  tone: z.string().trim().min(1).max(300).optional(),
  visualStyle: z.string().trim().min(1).max(300).optional(),
  format: z.enum(['9:16', '16:9', '1:1', '4:5']).optional(),
  durationSeconds: z.number().int().min(30).max(1800).optional(),
  resolution: z.enum(['720p', '1080p', '4k']).optional(),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
});
const createProjectSchema = z.object({ title: z.string().trim().min(1).max(100), story: z.string().trim().min(1).max(500_000), settings: settingsSchema.optional() });
const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(), story: z.string().max(500_000).optional(), settings: settingsSchema.optional(),
  analysis: z.unknown().optional(), script: z.array(z.unknown()).optional(), characters: z.array(z.unknown()).optional(),
  locations: z.array(z.unknown()).optional(), scenes: z.array(z.unknown()).optional(), shots: z.array(z.unknown()).optional(),
}).strict();
const jobSchema = z.object({ type: z.enum(['CHARACTER_GENERATION', 'LOCATION_GENERATION', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'DUBBING_GENERATION', 'TTS_GENERATION', 'VIDEO_RENDER', 'EXPORT']), payload: z.record(z.unknown()).default({}) });
const paginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) });
const publicAuthPaths = new Set(['/v1/config', '/v1/auth/register', '/v1/auth/login', '/v1/auth/refresh', '/v1/auth/forgot-password', '/v1/auth/reset-password']);
const MAX_MEDIA_UPLOAD_BYTES = 250 * 1024 * 1024;

function requestUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.user;
}

function getProjectId(request: FastifyRequest): string {
  const value = (request.params as { id?: string }).id;
  if (!value || value.length > 64) throw Object.assign(new Error('Invalid project ID'), { statusCode: 400 });
  return value;
}

async function findProject(request: FastifyRequest, repository: ProjectRepository): Promise<StoryProject> {
  const project = await repository.get(requestUser(request).id, getProjectId(request));
  if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  return project;
}

function operationForJob(type: JobType): CreditOperation {
  if (type === 'VIDEO_GENERATION') return 'VIDEO';
  if (type === 'DUBBING_GENERATION') return 'TTS';
  if (type === 'TTS_GENERATION') return 'TTS';
  if (type === 'VIDEO_RENDER' || type === 'EXPORT') return 'RENDER';
  if (type === 'TRANSLATION') return 'TRANSLATION';
  if (type === 'IMAGE_GENERATION' || type === 'CHARACTER_GENERATION' || type === 'LOCATION_GENERATION') return 'IMAGE';
  return 'TEXT';
}

function createJobExecutor(providers: ProviderSet): (task: GenerationTask, progress: (percent: number, message: string) => void) => Promise<unknown> {
  return async (task, progress) => {
    if (task.cancelRequested) throw new Error('Generation cancelled');
    progress(90, 'Saving generated asset');
    const payload = task.payload;
    let result: GeneratedAsset | { demo: true; available?: boolean; message: string; format?: string };
    switch (task.type) {
      case 'VIDEO_GENERATION':
        result = payload.imageUrl
          ? await providers.video.generateFromImage(String(payload.imageUrl), String(payload.prompt ?? 'Cinematic establishing shot'), { durationSeconds: Number(payload.durationSeconds ?? 5), onProgress: (message) => progress(50, message) })
          : await providers.video.generateFromText(String(payload.prompt ?? 'Cinematic establishing shot'), { durationSeconds: Number(payload.durationSeconds ?? 5), aspectRatio: String(payload.aspectRatio ?? '16:9'), onProgress: (message) => progress(50, message) });
        break;
      case 'IMAGE_GENERATION': {
        const scene = payload.scene as StoryScene | undefined;
        const shotPrompt = String(payload.shotPrompt ?? payload.prompt ?? 'Cinematic film frame');
        const characters = Array.isArray(payload.characters) ? payload.characters as Character[] : [];
        result = scene
          ? await providers.image.generateStoryboard(scene, shotPrompt, characters)
          : await providers.image.generatePoster(String(payload.title ?? 'Cineforge'), shotPrompt);
        break;
      }
      case 'DUBBING_GENERATION':
        result = { demo: true, available: false, message: 'Dubbing requires a Redis worker, persistent media storage, OpenAI transcription and an ElevenLabs voice. No transcript or dubbed media was generated.' };
        break;
      case 'TTS_GENERATION':
        result = payload.kind === 'dialogue'
          ? await providers.tts.generateDialogue(String(payload.text ?? ''), String(payload.voice ?? ''), { language: String(payload.language ?? 'English'), accent: String(payload.accent ?? ''), emotion: String(payload.emotion ?? 'neutral'), speed: Number(payload.speed ?? 1) })
          : await providers.tts.generateNarration(String(payload.text ?? ''), String(payload.voice ?? ''), { language: String(payload.language ?? 'English'), accent: String(payload.accent ?? ''), emotion: String(payload.emotion ?? 'neutral'), speed: Number(payload.speed ?? 1) });
        break;
      case 'VIDEO_RENDER':
      case 'EXPORT':
        result = { demo: true, message: 'Demo render job completed. Configure FFmpeg worker and storage for MP4 output.', format: 'mp4' };
        break;
      case 'CHARACTER_GENERATION': {
        const character = payload.character as Character | undefined;
        if (!character?.canonicalPrompt) throw Object.assign(new Error('Character canonical description is required'), { statusCode: 400 });
        result = await providers.image.generateCharacter(character, String(payload.variant ?? 'portrait'));
        break;
      }
      case 'LOCATION_GENERATION': {
        const location = payload.location as StoryProject['locations'][number] | undefined;
        if (!location?.canonicalPrompt) throw Object.assign(new Error('Location canonical description is required'), { statusCode: 400 });
        result = await providers.image.generateLocation(location, String(payload.variant ?? 'exterior'));
        break;
      }
      default:
        result = await providers.image.generatePoster(String(payload.title ?? 'Cineforge'), String(payload.prompt ?? 'Cinematic film poster'));
    }
    progress(98, 'Result ready');
    return { ...result, mode: result.demo ? 'DEMO' : 'LIVE_PROVIDER' };
  };
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? process.env;
  assertProductionAuthConfigured(env);
  const providers = options.providers ?? createProviders(env);
  const repository = options.repository ?? createProjectRepository(env);
  const credits = options.credits ?? new CreditLedger(env);
  const jobs = options.jobs ?? createJobQueue(env, createJobExecutor(providers));
  const storage = options.storage ?? createStorageProvider(env);
  const app = Fastify({ logger: env.LOG_LEVEL === 'debug', bodyLimit: 1_000_000, trustProxy: env.TRUST_PROXY === 'true' });
  app.decorateRequest('user', null);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((value) => value.trim()) : true });
  await app.register(rateLimit, { max: Number(env.API_RATE_LIMIT ?? 120), timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES, files: 1, fields: 8 } });

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/health' || publicAuthPaths.has(path) || /^\/v1\/auth\/oauth\/(google|github|facebook|apple|tiktok)$/.test(path)) return;
    try {
      request.user = await authenticate(request.headers.authorization, env);
      await repository.ensureUser?.(request.user);
    }
    catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 401;
      return reply.code(statusCode).send({ message: error instanceof Error ? error.message : 'Authentication required' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const candidate = error instanceof Error ? error as Error & { statusCode?: number } : undefined;
    const statusCode = error instanceof InsufficientCreditsError ? 402 : candidate?.statusCode && candidate.statusCode >= 400 ? candidate.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: error, requestId: request.id }, 'Request failed');
    const message = statusCode >= 500 ? 'Internal server error' : candidate?.message ?? 'Request failed';
    return reply.code(statusCode).send({ message, ...(error instanceof InsufficientCreditsError ? { balance: error.balance, required: error.required } : {}) });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'cineforge-api', time: new Date().toISOString() }));
  app.get('/v1/config', async () => ({
    demoMode: providers.demoMode,
    providers: providers.status,
    storage: { name: storage.name, demo: storage.demo },
    queue: env.REDIS_URL ? 'redis' : 'memory-demo',
    plans: { FREE: planLimits('FREE', env), PRO: planLimits('PRO', env) },
    creditCosts: CREDIT_COSTS,
    languages: SUPPORTED_LANGUAGES,
    integrations: {
      google: Boolean(env.GOOGLE_OAUTH_CLIENT_ID), github: Boolean(env.GITHUB_OAUTH_CLIENT_ID),
      apple: Boolean(env.APPLE_SERVICE_ID), meta: Boolean(env.META_APP_ID && env.META_APP_SECRET),
      tiktok: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
    },
  }));
  app.get('/v1/voices', async () => {
    let catalog: Array<{ id: string; name: string; language?: string }> = [];
    try {
      const parsed = JSON.parse(env.ELEVENLABS_VOICES ?? '[]') as unknown;
      catalog = z.array(z.object({ id: z.string().min(1).max(120), name: z.string().min(1).max(120), language: z.string().max(60).optional() })).max(100).parse(parsed);
    } catch {
      catalog = [];
    }
    return { configured: !providers.tts.demo, defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID ?? '', voices: catalog };
  });

  app.post('/v1/documents/parse', { bodyLimit: documentUploadLimit + 1_000_000 }, async (request) => {
    const part = await request.file({ limits: { fileSize: documentUploadLimit } });
    if (!part) throw Object.assign(new Error('Select a TXT, PDF or DOCX document'), { statusCode: 400 });
    return parseDocument(part.filename, part.mimetype, await part.toBuffer());
  });

  app.post('/v1/storage/upload', { bodyLimit: MAX_MEDIA_UPLOAD_BYTES + 1_000_000 }, async (request) => {
    const part = await request.file({ limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES } });
    if (!part) throw Object.assign(new Error('Select a file to upload'), { statusCode: 400 });
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'audio/mpeg', 'audio/wav', 'video/mp4', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']);
    if (!allowed.has(part.mimetype)) throw Object.assign(new Error('Unsupported upload content type'), { statusCode: 415 });
    const object = await storage.upload(requestUser(request).id, part.filename, part.mimetype, await part.toBuffer());
    return { asset: object, signedUrl: await storage.signedUrl(object.path) };
  });

  app.post('/v1/auth/register', async (request) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(8).max(128) }).parse(request.body);
    return forwardSupabaseAuth('signup', { email: body.email, password: body.password }, env);
  });
  app.get('/v1/auth/oauth/:provider', async (request) => {
    const provider = z.enum(['google', 'github', 'facebook', 'apple', 'tiktok']).parse((request.params as { provider: string }).provider);
    return { provider, authorizationUrl: createSupabaseOAuthUrl(provider, env), configured: true };
  });
  app.post('/v1/auth/login', async (request) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1).max(128) }).parse(request.body);
    return forwardSupabaseAuth('token?grant_type=password', { email: body.email, password: body.password }, env);
  });
  app.post('/v1/auth/refresh', async (request) => {
    const body = z.object({ refreshToken: z.string().min(20).max(4_096) }).parse(request.body);
    return forwardSupabaseAuth('token?grant_type=refresh_token', { refresh_token: body.refreshToken }, env);
  });
  app.post('/v1/auth/forgot-password', async (request) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);
    return forwardSupabaseAuth('recover', { email: body.email }, env);
  });
  app.post('/v1/auth/reset-password', async (request) => {
    const body = z.object({ accessToken: z.string().min(20), password: z.string().min(8).max(128) }).parse(request.body);
    return forwardSupabaseAuth('user', { password: body.password }, env, body.accessToken);
  });
  app.post('/v1/auth/logout', async (request) => {
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return forwardSupabaseAuth('logout', {}, env, token);
  });
  app.get('/v1/auth/me', async (request) => ({ user: requestUser(request) }));
  app.delete('/v1/auth/account', async (request, reply) => {
    const user = requestUser(request);
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!env.SUPABASE_URL || !serviceKey) return reply.code(501).send({ message: 'Account deletion requires server-side Supabase admin credentials' });
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Object.assign(new Error('Account deletion failed'), { statusCode: response.status });
    return { deleted: true };
  });

  app.get('/v1/projects', async (request) => {
    const user = requestUser(request);
    const { limit, offset } = paginationSchema.parse(request.query);
    return { projects: await repository.list(user.id, limit, offset), limit, offset };
  });
  app.post('/v1/projects', async (request, reply) => {
    const user = requestUser(request);
    const body = createProjectSchema.parse(request.body);
    const account = await credits.balance(user.id);
    const current = await repository.list(user.id, account.limits.projects + 1, 0);
    if (current.length >= account.limits.projects) return reply.code(403).send({ message: `Your ${account.plan} plan allows ${account.limits.projects} projects.`, upgradeAvailable: true });
    const project = await repository.create(user.id, { title: body.title, story: body.story, settings: normalizeProjectSettings(body.settings) });
    return reply.code(201).send({ project });
  });
  app.post('/v1/genres/suggest', async (request) => {
    const body = z.object({ title: z.string().max(100).default('Untitled'), story: z.string().min(1).max(100_000) }).parse(request.body);
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TEXT', { action: 'genre-suggestion' });
    try { return { ...await providers.text.suggestGenre(body), demo: providers.text.demo }; }
    catch (error) { await credits.refund(ownerId, receipt, 'genre-suggestion-failed'); throw error; }
  });
  app.post('/v1/dubbing/jobs', { bodyLimit: MAX_MEDIA_UPLOAD_BYTES + 1_000_000 }, async (request, reply) => {
    const user = requestUser(request);
    const dubbingProvidersConfigured = !providers.dubbing.demo && !providers.translation.demo && !providers.tts.demo;
    if (dubbingProvidersConfigured && !env.REDIS_URL) return reply.code(503).send({ message: 'A Redis worker is required for live dubbing jobs.' });
    if (dubbingProvidersConfigured && storage.demo) return reply.code(503).send({ message: 'Persistent Supabase Storage is required for dubbing source and output media.' });
    if (env.NODE_ENV === 'production' && (!env.REDIS_URL || storage.demo || !dubbingProvidersConfigured)) return reply.code(503).send({ message: 'Dubbing requires Redis, Supabase Storage, OpenAI transcription/translation and ElevenLabs TTS.' });
    const fields: Record<string, string> = {};
    let upload: { filename: string; mimetype: string; bytes: Buffer } | undefined;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (upload) throw Object.assign(new Error('Only one source video can be uploaded'), { statusCode: 400 });
        upload = { filename: part.filename, mimetype: part.mimetype, bytes: await part.toBuffer() };
      } else fields[part.fieldname] = String(part.value);
    }
    if (!upload) throw Object.assign(new Error('Choose a video file to dub'), { statusCode: 400 });
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(upload.mimetype)) throw Object.assign(new Error('Supported video formats are MP4, MOV and WebM'), { statusCode: 415 });
    if (upload.mimetype === 'video/mp4' || upload.mimetype === 'video/quicktime') {
      if (upload.bytes.toString('ascii', 4, 8) !== 'ftyp') throw Object.assign(new Error('The uploaded file does not have a valid MP4/MOV signature'), { statusCode: 415 });
    } else if (!upload.bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      throw Object.assign(new Error('The uploaded file does not have a valid WebM signature'), { statusCode: 415 });
    }
    const input = z.object({ projectId: z.string().min(1).max(64), sourceLanguage: z.string().min(2).max(40), targetLanguage: z.enum(SUPPORTED_LANGUAGES), voice: z.string().max(120).default(''), speed: z.coerce.number().min(0.5).max(2).default(1), subtitles: z.enum(['true', 'false']).default('true') }).parse(fields);
    const project = await repository.get(user.id, input.projectId);
    if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    if (env.REDIS_URL && storage.demo) throw Object.assign(new Error('Persistent Supabase Storage is required when the Redis worker is enabled'), { statusCode: 503 });
    const object = await storage.upload(user.id, upload.filename, upload.mimetype, upload.bytes, { projectId: project.id, category: 'assets' });
    const sourceUrl = storage.demo ? '' : await storage.signedUrl(object.path, 7_200);
    let receipt;
    try {
      receipt = await credits.charge(user.id, 'TTS', { projectId: project.id, action: 'dubbing', sourcePath: object.path });
    } catch (error) {
      await storage.remove(object.path);
      throw error;
    }
    try {
      const job = await jobs.enqueue({ projectId: project.id, ownerId: user.id, type: 'DUBBING_GENERATION', payload: { sourceUrl, sourcePath: object.path, filename: upload.filename, mimeType: upload.mimetype, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, voice: input.voice, speed: input.speed, subtitles: input.subtitles === 'true', project } });
      return reply.code(202).send({ job, asset: { path: object.path, size: object.size, demo: object.demo }, estimatedCredits: receipt.amount, balance: receipt.balance, providerConfigured: dubbingProvidersConfigured });
    } catch (error) {
      await credits.refund(user.id, receipt, 'dubbing-enqueue-failed');
      await storage.remove(object.path);
      throw error;
    }
  });
  app.get('/v1/projects/:id', async (request) => ({ project: await findProject(request, repository) }));
  app.patch('/v1/projects/:id', async (request, reply) => {
    const project = await findProject(request, repository);
    const body = updateProjectSchema.parse(request.body);
    const update = { ...body, settings: body.settings ? { ...project.settings, ...body.settings } : project.settings } as Partial<StoryProject>;
    const updated = await repository.update(requestUser(request).id, project.id, update);
    return reply.send({ project: updated });
  });
  app.delete('/v1/projects/:id', async (request, reply) => {
    const project = await findProject(request, repository);
    await repository.remove(requestUser(request).id, project.id);
    return reply.code(204).send();
  });
  app.post('/v1/projects/:id/duplicate', async (request, reply) => {
    const project = await findProject(request, repository);
    const copy = await repository.create(requestUser(request).id, { title: `${project.title} Copy`, story: project.story, settings: project.settings });
    return reply.code(201).send({ project: copy });
  });

  app.post('/v1/projects/:id/analyze', async (request) => {
    const project = await findProject(request, repository);
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TEXT', { projectId: project.id, action: 'analysis' });
    try {
      const analysis = await providers.text.analyzeStory(storyInput(project));
      const updated = await repository.update(ownerId, project.id, {
        analysis, characters: buildCharacters(analysis, project.characters), locations: buildLocations(analysis, project.locations), status: 'ANALYZED',
      });
      return { analysis, project: updated, demo: providers.text.demo };
    } catch (error) { await credits.refund(ownerId, receipt, 'story-analysis-failed'); throw error; }
  });

  app.post('/v1/projects/:id/script', async (request) => {
    const project = await findProject(request, repository);
    const ownerId = requestUser(request).id;
    const body = z.object({ action: z.enum(['generate', 'rewrite', 'shorten', 'expand', 'change-tone', 'change-genre', 'add-dialogue', 'add-narration', 'regenerate']).default('generate'), tone: z.string().max(300).optional(), genre: z.string().max(80).optional(), script: z.array(z.unknown()).optional() }).parse(request.body ?? {});
    const receipt = await credits.charge(ownerId, 'TEXT', { projectId: project.id, action: 'script' });
    try {
      const baseInput = storyInput(project);
      const input = { ...baseInput, tone: body.tone ?? baseInput.tone, genre: body.genre ?? baseInput.genre };
      let script = await providers.text.generateScript(input, project.analysis);
      if (body.action === 'shorten' || body.action === 'expand' || body.action === 'rewrite' || body.action === 'add-dialogue' || body.action === 'add-narration') {
        const current = (body.script ?? project.script) as typeof script | undefined;
        if (current?.length) script = current.map((scene) => {
          if (body.action === 'shorten') return { ...scene, action: scene.action.slice(0, 160), dialogue: scene.dialogue.slice(0, 1) };
          if (body.action === 'expand') return { ...scene, action: `${scene.action} The moment unfolds through a specific physical choice, revealing what the character cannot yet say.` };
          if (body.action === 'add-dialogue' && scene.dialogue.length === 0) return { ...scene, dialogue: [{ character: project.characters[0]?.name ?? 'PROTAGONIST', line: 'I know what I have to do.' }] };
          if (body.action === 'add-narration' && !scene.voiceover) return { ...scene, voiceover: scene.action };
          if (body.action === 'rewrite') return { ...scene, action: `${scene.action} Reframed with a ${body.tone ?? input.tone ?? 'cinematic'} point of view.` };
          return scene;
        });
      }
      const scenes = buildScenes(script, { ...project, settings: { ...project.settings, genre: input.genre ?? project.settings.genre, tone: input.tone ?? project.settings.tone } }, project.characters, project.locations);
      const updated = await repository.update(ownerId, project.id, { script, scenes, shots: buildShots(scenes), status: 'IN_PRODUCTION' });
      return { script, scenes, project: updated, demo: providers.text.demo };
    } catch (error) { await credits.refund(ownerId, receipt, 'script-generation-failed'); throw error; }
  });

  app.get('/v1/projects/:id/characters', async (request) => ({ characters: (await findProject(request, repository)).characters }));
  app.patch('/v1/projects/:id/characters/:characterId', async (request) => {
    const project = await findProject(request, repository);
    const params = request.params as { characterId: string };
    const schema = z.object({ name: z.string().min(1).max(100).optional(), aliases: z.array(z.string().max(100)).max(20).optional(), age: z.string().max(80).optional(), gender: z.string().max(80).optional(), personality: z.string().max(2_000).optional(), role: z.string().max(100).optional(), relationships: z.array(z.string().max(500)).max(50).optional(), appearance: z.string().max(2_000).optional(), hair: z.string().max(500).optional(), face: z.string().max(500).optional(), body: z.string().max(500).optional(), clothing: z.string().max(1_000).optional(), voice: z.string().max(500).optional(), accent: z.string().max(120).optional(), canonicalPrompt: z.string().max(4_000).optional() }).strict();
    const body = schema.parse(request.body);
    const index = project.characters.findIndex((character) => character.id === params.characterId);
    if (index < 0) throw Object.assign(new Error('Character not found'), { statusCode: 404 });
    const characters = [...project.characters];
    const prior = characters[index];
    if (!prior) throw Object.assign(new Error('Character not found'), { statusCode: 404 });
    const next: Character = { ...prior, ...body };
    if (!body.canonicalPrompt && ['name', 'age', 'appearance', 'hair', 'face', 'body', 'clothing'].some((key) => key in body)) {
      next.canonicalPrompt = `${next.name}, ${next.age}; ${next.appearance}; hair: ${next.hair}; face: ${next.face}; body: ${next.body}; clothing: ${next.clothing}. Preserve the same identity across every scene.`;
    }
    characters[index] = next;
    const updated = await repository.update(requestUser(request).id, project.id, { characters });
    return { character: next, project: updated };
  });
  app.get('/v1/projects/:id/locations', async (request) => ({ locations: (await findProject(request, repository)).locations }));
  app.patch('/v1/projects/:id/locations/:locationId', async (request) => {
    const project = await findProject(request, repository);
    const { locationId } = request.params as { locationId: string };
    const body = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(4_000).optional(), era: z.string().max(120).optional(), architecture: z.string().max(1_000).optional(), weather: z.string().max(500).optional(), lighting: z.string().max(500).optional(), mood: z.string().max(500).optional(), props: z.array(z.string().max(200)).max(100).optional(), timeOfDay: z.string().max(120).optional(), canonicalPrompt: z.string().max(4_000).optional() }).strict().parse(request.body);
    const index = project.locations.findIndex((location) => location.id === locationId);
    if (index < 0) throw Object.assign(new Error('Location not found'), { statusCode: 404 });
    const locations = [...project.locations];
    const location = { ...locations[index]!, ...body };
    if (!body.canonicalPrompt) location.canonicalPrompt = `${location.name}; ${location.description}; ${location.era}; ${location.architecture}; ${location.weather}; ${location.lighting}; ${location.mood}. Keep the same layout, palette and props across all scenes.`;
    locations[index] = location;
    return { location, project: await repository.update(requestUser(request).id, project.id, { locations }) };
  });
  app.get('/v1/projects/:id/scenes', async (request) => {
    const project = await findProject(request, repository);
    return { scenes: project.scenes, shots: project.shots ?? [] };
  });
  app.patch('/v1/projects/:id/scenes/:sceneId', async (request) => {
    const project = await findProject(request, repository);
    const { sceneId } = request.params as { sceneId: string };
    const body = z.object({ sceneNumber: z.number().int().min(1).optional(), durationSeconds: z.number().int().min(1).max(1800).optional(), characters: z.array(z.string().max(120)).max(50).optional(), location: z.string().max(300).optional(), time: z.string().max(100).optional(), weather: z.string().max(300).optional(), action: z.string().max(8_000).optional(), dialogue: z.string().max(8_000).optional(), narration: z.string().max(8_000).optional(), camera: z.string().max(2_000).optional(), shotType: z.string().max(120).optional(), lens: z.string().max(120).optional(), movement: z.string().max(500).optional(), lighting: z.string().max(500).optional(), mood: z.string().max(500).optional(), music: z.string().max(1_000).optional(), sfx: z.string().max(1_000).optional(), imagePrompt: z.string().max(4_000).optional(), videoPrompt: z.string().max(4_000).optional() }).strict().parse(request.body);
    const index = project.scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) throw Object.assign(new Error('Scene not found'), { statusCode: 404 });
    const scenes = [...project.scenes];
    const scene = { ...scenes[index]!, ...body };
    scenes[index] = scene;
    return { scene, project: await repository.update(requestUser(request).id, project.id, { scenes, shots: buildShots(scenes) }) };
  });
  app.patch('/v1/projects/:id/shots/:shotId', async (request) => {
    const project = await findProject(request, repository);
    const { shotId } = request.params as { shotId: string };
    const body = z.object({ shotNumber: z.number().int().min(1).optional(), durationSeconds: z.number().int().min(1).max(600).optional(), camera: z.string().max(500).optional(), movement: z.string().max(500).optional(), dialogue: z.string().max(4_000).optional(), voiceover: z.string().max(4_000).optional(), sfx: z.string().max(1_000).optional(), music: z.string().max(1_000).optional(), prompt: z.string().max(4_000).optional(), imageUrl: z.string().url().max(2_000).optional(), imageDemo: z.boolean().optional(), videoUrl: z.string().url().max(2_000).optional(), videoDemo: z.boolean().optional() }).strict().parse(request.body);
    const shots = [...(project.shots ?? [])];
    const index = shots.findIndex((shot) => shot.id === shotId);
    if (index < 0) throw Object.assign(new Error('Shot not found'), { statusCode: 404 });
    const updatedShot = { ...shots[index]!, ...body };
    shots[index] = updatedShot;
    const scenes = project.scenes.map((scene) => scene.id !== updatedShot.sceneId ? scene : {
      ...scene,
      ...(body.imageUrl ? { imageUrl: body.imageUrl, imageDemo: body.imageDemo } : {}),
      ...(body.videoUrl ? { videoUrl: body.videoUrl, videoDemo: body.videoDemo } : {}),
    });
    return { shots, scene: scenes.find((scene) => scene.id === updatedShot.sceneId), project: await repository.update(requestUser(request).id, project.id, { shots, scenes }) };
  });
  app.post('/v1/projects/:id/characters', async (request) => {
    const project = await findProject(request, repository);
    if (project.characters.length) return { characters: project.characters, project, demo: providers.text.demo };
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TEXT', { projectId: project.id, action: 'character-detection' });
    try {
      const analysis = project.analysis ?? await providers.text.analyzeStory(storyInput(project));
      const characters = buildCharacters(analysis, project.characters);
      const updated = await repository.update(ownerId, project.id, { analysis, characters, status: 'ANALYZED' });
      return { characters, project: updated, demo: providers.text.demo };
    } catch (error) { await credits.refund(ownerId, receipt, 'character-detection-failed'); throw error; }
  });
  app.post('/v1/projects/:id/locations', async (request) => {
    const project = await findProject(request, repository);
    if (project.locations.length) return { locations: project.locations, project, demo: providers.text.demo };
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TEXT', { projectId: project.id, action: 'location-detection' });
    try {
      const analysis = project.analysis ?? await providers.text.analyzeStory(storyInput(project));
      const locations = buildLocations(analysis, project.locations);
      const updated = await repository.update(ownerId, project.id, { analysis, locations, status: 'ANALYZED' });
      return { locations, project: updated, demo: providers.text.demo };
    } catch (error) { await credits.refund(ownerId, receipt, 'location-detection-failed'); throw error; }
  });
  app.post('/v1/projects/:id/scenes', async (request) => {
    const project = await findProject(request, repository);
    if (project.scenes.length) return { scenes: project.scenes, shots: project.shots ?? [], project, demo: providers.text.demo };
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TEXT', { projectId: project.id, action: 'scene-generation' });
    try {
      const script = project.script ?? await providers.text.generateScript(storyInput(project), project.analysis);
      const scenes = buildScenes(script, project, project.characters, project.locations);
      const shots = buildShots(scenes);
      const updated = await repository.update(ownerId, project.id, { script, scenes, shots, status: 'IN_PRODUCTION' });
      return { scenes, shots, project: updated, demo: providers.text.demo };
    } catch (error) { await credits.refund(ownerId, receipt, 'scene-generation-failed'); throw error; }
  });
  app.post('/v1/projects/:id/storyboard', async (request) => {
    const project = await findProject(request, repository);
    const scenes = project.scenes.length ? project.scenes : buildScenes(project.script ?? [], project, project.characters, project.locations);
    const shots = buildShots(scenes);
    const updated = await repository.update(requestUser(request).id, project.id, { scenes, shots });
    return { shots, project: updated };
  });
  app.post('/v1/projects/:id/voice', async (request, reply) => {
    const project = await findProject(request, repository);
    const body = z.object({ kind: z.enum(['dialogue', 'narration']).default('narration'), text: z.string().max(100_000).optional(), voice: z.string().max(200).default('demo-narrator'), language: z.enum(SUPPORTED_LANGUAGES).default('English'), accent: z.string().max(100).optional(), emotion: z.string().max(80).default('neutral'), speed: z.number().min(0.5).max(2).default(1) }).parse(request.body ?? {});
    const text = project.scenes.map((scene) => [scene.narration, scene.dialogue].filter(Boolean).join('\n')).filter(Boolean).join('\n\n') || project.story;
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TTS', { projectId: project.id, action: 'voice' }, Math.max(1, Math.ceil(text.length / 1_000)));
    try {
      const job = await jobs.enqueue({ projectId: project.id, ownerId, type: 'TTS_GENERATION', payload: { ...body, text: body.text ?? text } });
      return reply.code(202).send({ job, estimatedCredits: receipt.amount, balance: receipt.balance, demo: providers.tts.demo });
    } catch (error) { await credits.refund(ownerId, receipt, 'voice-job-enqueue-failed'); throw error; }
  });

  app.post('/v1/projects/:id/subtitles', async (request) => {
    const project = await findProject(request, repository);
    const body = z.object({ language: z.enum(SUPPORTED_LANGUAGES).default(project.settings.language as typeof SUPPORTED_LANGUAGES[number]), style: z.enum(['Cinema', 'Minimal', 'Bold', 'TikTok', 'YouTube', 'Classic']).default('Cinema') }).parse(request.body ?? {});
    let startMs = 0;
    const subtitles = project.scenes.flatMap((scene) => {
      const content = scene.dialogue.split('\n').filter(Boolean).map((line) => ({ speaker: line.includes(':') ? line.split(':', 1)[0] : undefined, text: line.replace(/^[^:]{1,80}:\s*/, '') }));
      const lines: Array<{ speaker?: string; text: string }> = content.length ? content : scene.narration ? [{ text: scene.narration }] : [];
      return lines.map((line) => {
        const cue = { id: randomUUID(), startMs, endMs: startMs + Math.max(1_500, Math.min(6_000, line.text.length * 55)), text: line.text, speaker: line.speaker };
        startMs = cue.endMs + 200;
        return cue;
      });
    });
    const updated = await repository.update(requestUser(request).id, project.id, { subtitles });
    return { subtitles, language: body.language, style: body.style, formats: ['SRT', 'VTT', 'BURNED_IN'], project: updated };
  });
  app.patch('/v1/projects/:id/subtitles', async (request) => {
    const project = await findProject(request, repository);
    const subtitles = z.array(z.object({ id: z.string().min(1).max(64), startMs: z.number().int().min(0), endMs: z.number().int().positive(), text: z.string().max(2_000), speaker: z.string().max(120).optional() }).refine((cue) => cue.endMs > cue.startMs, 'Subtitle end must follow start')).max(5_000).parse(request.body);
    await repository.update(requestUser(request).id, project.id, { subtitles });
    return { subtitles };
  });
  app.get('/v1/projects/:id/subtitles', async (request) => {
    const project = await findProject(request, repository);
    const { format = 'VTT' } = z.object({ format: z.enum(['SRT', 'VTT']).default('VTT') }).parse(request.query);
    const stamp = (ms: number, separator: ',' | '.') => {
      const hours = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      const seconds = Math.floor((ms % 60_000) / 1_000);
      const millis = ms % 1_000;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
    };
    const cues = project.subtitles ?? [];
    const content = format === 'SRT'
      ? cues.map((cue, index) => `${index + 1}\n${stamp(cue.startMs, ',')} --> ${stamp(cue.endMs, ',')}\n${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text}`).join('\n\n')
      : `WEBVTT\n\n${cues.map((cue) => `${stamp(cue.startMs, '.')} --> ${stamp(cue.endMs, '.')}\n${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text}`).join('\n\n')}`;
    return { format, content, subtitles: cues };
  });
  app.get('/v1/projects/:id/timeline', async (request) => {
    const project = await findProject(request, repository);
    if (project.timeline) return { timeline: project.timeline };
    let cursor = 0;
    const videoClips = project.scenes.map((scene) => {
      const clip = { id: scene.id, sceneId: scene.id, startSeconds: cursor, endSeconds: cursor + scene.durationSeconds, trimInSeconds: 0, trimOutSeconds: 0, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, speed: 1 };
      cursor = clip.endSeconds;
      return clip;
    });
    const timeline = [
      { id: randomUUID(), type: 'VIDEO' as const, muted: false, volume: 1, clips: videoClips },
      ...(['VOICE', 'MUSIC', 'SFX', 'SUBTITLES'] as const).map((type) => ({ id: randomUUID(), type, muted: false, volume: 1, clips: [] })),
    ];
    await repository.update(requestUser(request).id, project.id, { timeline });
    return { timeline };
  });
  app.put('/v1/projects/:id/timeline', async (request) => {
    const project = await findProject(request, repository);
    const clipSchema = z.object({ id: z.string().max(64), assetId: z.string().max(200).optional(), sceneId: z.string().max(64).optional(), startSeconds: z.number().min(0), endSeconds: z.number().min(0), trimInSeconds: z.number().min(0), trimOutSeconds: z.number().min(0), volume: z.number().min(0).max(2), fadeInSeconds: z.number().min(0).max(600), fadeOutSeconds: z.number().min(0).max(600), speed: z.number().min(0.25).max(4), transition: z.string().max(80).optional(), text: z.string().max(2_000).optional() }).refine((clip) => clip.endSeconds > clip.startSeconds, 'Clip end must follow start');
    const timeline = z.array(z.object({ id: z.string().max(64), type: z.enum(['VIDEO', 'VOICE', 'MUSIC', 'SFX', 'SUBTITLES']), muted: z.boolean(), volume: z.number().min(0).max(2), clips: z.array(clipSchema).max(1_000) })).max(20).parse(request.body);
    await repository.update(requestUser(request).id, project.id, { timeline });
    return { timeline, savedAt: new Date().toISOString() };
  });

  app.post('/v1/projects/:id/jobs', async (request, reply) => {
    const project = await findProject(request, repository);
    const body = jobSchema.parse(request.body);
    const ownerId = requestUser(request).id;
    const operation = operationForJob(body.type);
    const liveProvider = body.type === 'VIDEO_GENERATION' ? !providers.video.demo
      : body.type === 'TTS_GENERATION' ? !providers.tts.demo
        : ['IMAGE_GENERATION', 'CHARACTER_GENERATION', 'LOCATION_GENERATION'].includes(body.type) ? !providers.image.demo
          : false;
    const backgroundMediaJob = ['VIDEO_GENERATION', 'TTS_GENERATION', 'IMAGE_GENERATION', 'CHARACTER_GENERATION', 'LOCATION_GENERATION'].includes(body.type);
    if (backgroundMediaJob && env.NODE_ENV === 'production' && !env.REDIS_URL) return reply.code(503).send({ message: 'Configure REDIS_URL and start the background worker for media generation.' });
    if (liveProvider && !env.REDIS_URL) return reply.code(503).send({ message: 'A Redis worker is required for live provider jobs.' });
    if (liveProvider && storage.demo) return reply.code(503).send({ message: 'Persistent Supabase Storage is required for live media generations.' });
    const receipt = await credits.charge(ownerId, operation, { projectId: project.id, type: body.type });
    try {
      const payload = { ...body.payload };
      if (body.type === 'VIDEO_GENERATION') {
        const sceneId = z.string().max(64).optional().parse(payload.sceneId);
        const scene = sceneId ? project.scenes.find((item) => item.id === sceneId) : undefined;
        if (sceneId && !scene) throw Object.assign(new Error('Scene not found'), { statusCode: 404 });
        const requestedIds = Array.isArray(payload.characterIds) ? payload.characterIds.map((id) => z.string().max(64).parse(id)) : scene?.characterIds ?? [];
        if (requestedIds.some((id) => !project.characters.some((character) => character.id === id))) {
          throw Object.assign(new Error('Video generation references a character outside this project'), { statusCode: 400 });
        }
        const characterIds = [...new Set(requestedIds.length ? requestedIds : project.characters.map((character) => character.id))];
        const characters = project.characters.filter((character) => characterIds.includes(character.id));
        const basePrompt = String(payload.prompt ?? scene?.videoPrompt ?? 'Cinematic film shot');
        const continuity = characters.map((character) => `${character.name} [${character.id}]: ${character.canonicalPrompt}`).join('\n');
        payload.scene = scene;
        payload.characterIds = characterIds;
        payload.characters = characters;
        payload.prompt = `${basePrompt}\nCanonical character profiles (preserve identity, hair, face and wardrobe):\n${continuity}`;
        payload.durationSeconds = Number(payload.durationSeconds ?? scene?.durationSeconds ?? 5);
        payload.aspectRatio = String(payload.aspectRatio ?? project.settings.format);
        if (scene?.imageUrl) payload.imageUrl = scene.imageUrl;
      }
      if (body.type === 'IMAGE_GENERATION' && typeof payload.sceneId === 'string') {
        const scene = project.scenes.find((item) => item.id === payload.sceneId);
        if (!scene) throw Object.assign(new Error('Scene not found'), { statusCode: 404 });
        const shotId = z.string().max(64).optional().parse(payload.shotId);
        const shot = shotId ? project.shots?.find((item) => item.id === shotId && item.sceneId === scene.id) : undefined;
        if (shotId && !shot) throw Object.assign(new Error('Storyboard shot not found in this scene'), { statusCode: 404 });
        const characterIds = scene.characterIds ?? [];
        payload.scene = scene;
        payload.shotPrompt = String(payload.prompt ?? shot?.prompt ?? scene.imagePrompt);
        payload.characters = project.characters.filter((character) => characterIds.includes(character.id));
        if (shot) payload.shot = shot;
      }
      const job = await jobs.enqueue({ projectId: project.id, ownerId, type: body.type, payload });
      return reply.code(202).send({ job, estimatedCredits: receipt.amount, balance: receipt.balance, demo: providers.status[operation === 'VIDEO' ? 'video' : operation === 'TTS' ? 'tts' : 'image']?.mode === 'demo' });
    } catch (error) { await credits.refund(ownerId, receipt, 'job-enqueue-failed'); throw error; }
  });
  app.get('/v1/jobs', async (request) => {
    const query = z.object({ projectId: z.string().max(64).optional() }).parse(request.query);
    if (query.projectId) await repository.get(requestUser(request).id, query.projectId).then((project) => { if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 }); });
    return { jobs: await jobs.list(requestUser(request).id, query.projectId) };
  });
  app.get('/v1/jobs/:jobId', async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await jobs.get(requestUser(request).id, jobId);
    if (!job) throw Object.assign(new Error('Generation job not found'), { statusCode: 404 });
    return { job };
  });
  app.post('/v1/jobs/:jobId/cancel', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const cancelled = await jobs.cancel(requestUser(request).id, jobId);
    return cancelled ? { cancelled: true } : reply.code(409).send({ message: 'Job cannot be cancelled in its current state' });
  });
  app.post('/v1/jobs/:jobId/retry', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await jobs.retry(requestUser(request).id, jobId);
    return job ? reply.code(202).send({ job }) : reply.code(409).send({ message: 'Only failed or cancelled jobs can be retried' });
  });
  app.post('/v1/projects/:id/export', async (request, reply) => {
    const project = await findProject(request, repository);
    const body = z.object({ resolution: z.enum(['720p', '1080p', '4k']).default('720p'), preset: z.enum(['tiktok', 'shorts', 'reels', 'facebook', 'youtube', 'cinema', 'square']).default('youtube'), format: z.literal('mp4').default('mp4') }).parse(request.body ?? {});
    const ownerId = requestUser(request).id;
    if (!project.scenes.length) return reply.code(409).send({ message: 'Generate at least one scene before exporting.' });
    if (env.REDIS_URL && storage.demo) return reply.code(503).send({ message: 'Persistent Supabase Storage is required for production render jobs.' });
    if (body.resolution === '4k' && env.FFMPEG_4K_SUPPORTED !== 'true') return reply.code(422).send({ message: '4K rendering is not enabled on this worker.' });
    const account = await credits.balance(ownerId);
    const resolutionRank = { '720p': 1, '1080p': 2, '4k': 3 };
    if (resolutionRank[body.resolution] > resolutionRank[account.limits.maxResolution]) return reply.code(403).send({ message: `${account.plan} plan supports up to ${account.limits.maxResolution}.`, upgradeAvailable: true });
    const receipt = await credits.charge(ownerId, 'RENDER', { projectId: project.id, ...body });
    try {
      const job = await jobs.enqueue({ projectId: project.id, ownerId, type: 'EXPORT', payload: { ...body, project } });
      return reply.code(202).send({ job, estimatedCredits: receipt.amount, balance: receipt.balance, demo: providers.demoMode || !env.REDIS_URL });
    } catch (error) { await credits.refund(ownerId, receipt, 'export-enqueue-failed'); throw error; }
  });

  app.get('/v1/credits', async (request) => {
    const account = await credits.balance(requestUser(request).id);
    return { ...account, costs: Object.fromEntries(Object.entries(CREDIT_COSTS).map(([operation, cost]) => [operation, Number(env[`CREDIT_COST_${operation}`] ?? cost)])), history: await credits.history(requestUser(request).id) };
  });
  app.post('/v1/credits/estimate', async (request) => {
    const body = z.object({ operation: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'TTS', 'TRANSLATION', 'UPSCALE', 'RENDER']), units: z.number().int().min(1).max(10_000).default(1) }).parse(request.body);
    return { operation: body.operation, units: body.units, estimatedCredits: credits.estimate(body.operation as CreditOperation, body.units), balance: (await credits.balance(requestUser(request).id)).balance };
  });
  app.post('/v1/translate', async (request) => {
    const body = z.object({ text: z.string().min(1).max(100_000), targetLanguage: z.enum(SUPPORTED_LANGUAGES), names: z.array(z.string().max(120)).max(100).default([]), sceneIds: z.array(z.string().max(64)).max(500).optional() }).parse(request.body);
    const ownerId = requestUser(request).id;
    const receipt = await credits.charge(ownerId, 'TRANSLATION', { targetLanguage: body.targetLanguage });
    try { return { translation: await providers.translation.translate(body.text, body.targetLanguage, body.names), targetLanguage: body.targetLanguage, sceneIds: body.sceneIds, demo: providers.translation.demo }; }
    catch (error) { await credits.refund(ownerId, receipt, 'translation-failed'); throw error; }
  });

  app.get('/v1/integrations', async () => ({ accounts: {
    google: { connected: false, configured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET), publishing: false, message: 'Requires OAuth consent and official publishing API approval.' },
    github: { connected: false, configured: Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET), publishing: false, message: 'OAuth identity provider only; not a video publishing target.' },
    meta: { connected: false, configured: Boolean(env.META_APP_ID && env.META_APP_SECRET), publishing: false, message: 'Requires Meta app review and publishing permissions.' },
    tiktok: { connected: false, configured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET), publishing: false, message: 'Requires TikTok developer approval and Content Posting API access.' },
    apple: { connected: false, configured: Boolean(env.APPLE_SERVICE_ID && env.APPLE_TEAM_ID), publishing: false, message: 'Sign in with Apple requires an approved Apple developer configuration.' },
  } }));
  app.post('/v1/publishing/:platform', async (request, reply) => {
    const platform = (request.params as { platform: string }).platform;
    const approved = env[`${platform.toUpperCase()}_PUBLISHING_APPROVED`] === 'true';
    if (!approved) return reply.code(501).send({ configured: false, published: false, message: 'Publishing is disabled until official API access and app approval are configured.' });
    return reply.code(501).send({ configured: true, published: false, message: 'Configure the platform publishing adapter and OAuth account before publishing.' });
  });

  app.get('/v1/admin/overview', async (request) => {
    if (requestUser(request).role !== 'admin') throw Object.assign(new Error('Administrator access required'), { statusCode: 403 });
    const user = requestUser(request);
    const [projects, queue] = await Promise.all([repository.list(user.id, 100), jobs.list(user.id)]);
    return { users: 'requires service-role analytics', projects: projects.length, jobs: queue.length, failedJobs: queue.filter((job: GenerationJob) => job.status === 'FAILED').length, providers: providers.status, plans: { FREE: planLimits('FREE', env), PRO: planLimits('PRO', env) } };
  });
  app.get('/v1/admin/jobs', async (request) => {
    if (requestUser(request).role !== 'admin') throw Object.assign(new Error('Administrator access required'), { statusCode: 403 });
    return { jobs: await jobs.list(requestUser(request).id) };
  });

  app.addHook('onClose', async () => {
    await jobs.close();
    await credits.close();
    const closable = repository as ProjectRepository & { close?: () => Promise<void> };
    await closable.close?.();
  });

  return app;
}