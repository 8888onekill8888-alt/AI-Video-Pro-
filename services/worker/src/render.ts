import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import type { StoryProject } from '@storyflix/shared';

const execFile = promisify(execFileCallback);

async function readLimitedResponse(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error('Media provider returned an empty response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Scene media exceeds the 500 MB render limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

export async function renderProjectToMp4(project: StoryProject, ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg', resolution: '720p' | '1080p' | '4k' = '720p') {
  if (!project.scenes.length) throw new Error('Add at least one scene before rendering');
  if (project.scenes.length > 100) throw new Error('A single render supports up to 100 scenes');
  const availableScenes = project.scenes.filter((scene) => (scene.videoUrl && !scene.videoDemo) || (scene.imageUrl && !scene.imageDemo));
  if (availableScenes.length !== project.scenes.length) throw new Error('Every scene needs a real provider-generated image or video before rendering. Demo placeholders are not rendered as film footage.');
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'cineforge-render-'));
  try {
  const outputPath = join(temporaryDirectory, `${randomUUID()}.mp4`);
  const presetSize = resolution === '4k' ? 2160 : resolution === '1080p' ? 1080 : 720;
  const format = project.settings.format;
  const [width, height] = format === '9:16' ? [Math.round(presetSize * 9 / 16), presetSize]
    : format === '1:1' ? [presetSize, presetSize]
      : format === '4:5' ? [Math.round(presetSize * 4 / 5), presetSize]
        : [Math.round(presetSize * 16 / 9), presetSize];
  const fps = project.settings.fps ?? 24;
  const scenes = project.scenes;
  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y'];
  const filters: string[] = [];
  const storageHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : '';
  for (const [index, scene] of scenes.entries()) {
    const duration = Math.max(1, Math.min(1_800, scene.durationSeconds));
    const isVideo = Boolean(scene.videoUrl && !scene.videoDemo);
    const mediaUrl = isVideo ? scene.videoUrl : scene.imageUrl;
    if (!mediaUrl) throw new Error(`Scene ${scene.sceneNumber} is missing its generated media URL`);
    const source = new URL(mediaUrl);
    const approvedHost = source.hostname === storageHost || source.hostname === 'fal.media' || source.hostname.endsWith('.fal.media') || source.hostname.endsWith('.replicate.delivery') || source.hostname.endsWith('.runwayml.com');
    if (source.protocol !== 'https:' || !approvedHost) throw new Error(`Scene ${scene.sceneNumber} media URL is not from an approved HTTPS provider or storage host`);
    const response = await fetch(source, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Could not download scene ${scene.sceneNumber} media (${response.status})`);
    const bytes = await readLimitedResponse(response, 500 * 1024 * 1024);
    if (!bytes.length) throw new Error(`Scene ${scene.sceneNumber} media is empty`);
    const mediaPath = join(temporaryDirectory, `scene-${String(index).padStart(3, '0')}.${isVideo ? 'mp4' : 'image'}`);
    await writeFile(mediaPath, bytes, { flag: 'wx' });
    if (isVideo) args.push('-stream_loop', '-1', '-i', mediaPath);
    else args.push('-loop', '1', '-framerate', String(fps), '-t', String(duration), '-i', mediaPath);
    const scaleCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps}`;
    const motion = isVideo ? `trim=duration=${duration},setpts=PTS-STARTPTS,${scaleCrop}` : `${scaleCrop},zoompan=z='min(zoom+0.00035,1.06)':d=1:s=${width}x${height}:fps=${fps}`;
    filters.push(`[${index}:v]${motion},format=yuv420p[v${index}]`);
  }
  const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
  filters.push(`${concatInputs}concat=n=${scenes.length}:v=1:a=0[outv]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[outv]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', resolution === '4k' ? '20' : '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', outputPath);
  try {
    await execFile(ffmpegPath, args, { timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024 });
    const bytes = await readFile(outputPath);
    return { bytes, filename: `${project.title.replace(/[^\w-]+/g, '-').slice(0, 48) || 'cineforge-film'}.mp4`, mimeType: 'video/mp4', resolution, durationSeconds: scenes.reduce((total, scene) => total + scene.durationSeconds, 0) };
  } catch (error) {
    const detail = error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'FFmpeg is not installed or FFMPEG_PATH is incorrect' : 'FFmpeg could not render this project';
    throw new Error(detail, { cause: error });
  }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}