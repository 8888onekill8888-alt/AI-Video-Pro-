import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import type { Character, StoryProject } from '@storyflix/shared';
import type { ProviderSet, TranscriptionSegment } from '@storyflix/providers';

const execFile = promisify(execFileCallback);
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;
const AUDIO_CHUNK_SECONDS = 300;

export interface DubbingTaskInput {
  sourceUrl: string;
  filename: string;
  mimeType: string;
  sourceLanguage: string;
  targetLanguage: string;
  voice: string;
  speed: number;
  subtitles: boolean;
  project: StoryProject;
}

export interface DubbingOutput {
  video: Buffer;
  subtitles: string;
  cues: Array<{ start: number; end: number; source: string; translated: string }>;
  filename: string;
  durationSeconds: number;
  sourceLanguage: string;
  targetLanguage: string;
}

function formatSrtTime(seconds: number): string {
  const milliseconds = Math.round(Math.max(0, seconds) * 1_000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`;
}

function escapeSubtitle(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/-->/g, '→').trim();
}

async function downloadSource(url: string, expectedBaseUrl: string | undefined): Promise<Buffer> {
  const source = new URL(url);
  if (!['https:', 'http:'].includes(source.protocol)) throw new Error('Dubbing source URL must use HTTP or HTTPS');
  if (expectedBaseUrl && source.hostname !== new URL(expectedBaseUrl).hostname) throw new Error('Dubbing source host does not match configured storage');
  const response = await fetch(source, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error(`Could not fetch the uploaded source video (${response.status})`);
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_SOURCE_BYTES) throw new Error('Dubbing source exceeds the 250 MB limit');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('Dubbing source is empty or exceeds the 250 MB limit');
  return bytes;
}

async function splitAudio(ffmpegPath: string, sourcePath: string, directory: string): Promise<string[]> {
  const pattern = join(directory, 'audio-%03d.mp3');
  await execFile(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'segment', '-segment_time', String(AUDIO_CHUNK_SECONDS),
    '-reset_timestamps', '1', pattern,
  ], { timeout: 15 * 60_000, maxBuffer: 2 * 1024 * 1024 });
  const { stdout } = await execFile('sh', ['-c', `for file in "$1"/audio-*.mp3; do printf '%s\\n' "$file"; done`, 'sh', directory], { maxBuffer: 64 * 1024 });
  const files = stdout.trim().split('\n').filter(Boolean);
  if (!files.length) throw new Error('FFmpeg did not extract an audio track from the source video');
  return files;
}

async function probeDuration(ffprobePath: string, sourcePath: string): Promise<number> {
  const { stdout } = await execFile(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', sourcePath], { timeout: 30_000, maxBuffer: 64 * 1024 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read source video duration');
  return duration;
}

function matchCharacterNames(project: StoryProject): string[] {
  return project.characters.flatMap((character: Character) => [character.name, ...character.aliases]).filter(Boolean);
}

export async function runDubbingPipeline(
  input: DubbingTaskInput,
  providers: ProviderSet,
  progress: (percent: number, message: string) => Promise<void>,
  env: Record<string, string | undefined> = process.env,
): Promise<DubbingOutput> {
  if (providers.dubbing.demo) throw new Error('Dubbing is not configured: set OPENAI_API_KEY and OPENAI_TRANSCRIPTION_MODEL');
  if (providers.translation.demo) throw new Error('Dubbing translation is not configured: set OPENAI_API_KEY and OPENAI_MODEL');
  if (providers.tts.demo) throw new Error('Dubbing voices are not configured: set ELEVENLABS_API_KEY');
  if (!input.project.id) throw new Error('Dubbing requires an authorized project context');

  const directory = await mkdtemp(join(tmpdir(), 'cineforge-dub-'));
  const ffmpegPath = env.FFMPEG_PATH ?? 'ffmpeg';
  const ffprobePath = env.FFPROBE_PATH ?? 'ffprobe';
  const extension = input.mimeType === 'video/quicktime' ? 'mov' : input.mimeType === 'video/webm' ? 'webm' : 'mp4';
  const sourcePath = join(directory, `source.${extension}`);
  const subtitlePath = join(directory, 'dubbed.srt');
  const outputPath = join(directory, 'dubbed.mp4');
  try {
    await progress(5, 'Downloading private source video');
    const sourceBytes = await downloadSource(input.sourceUrl, env.SUPABASE_URL);
    await writeFile(sourcePath, sourceBytes, { flag: 'wx' });
    const durationSeconds = await probeDuration(ffprobePath, sourcePath);
    await progress(12, 'Extracting source audio with FFmpeg');
    const audioFiles = await splitAudio(ffmpegPath, sourcePath, directory);
    if (audioFiles.length > 60) throw new Error('Source duration exceeds the supported 5-hour dubbing limit');

    const transcript: TranscriptionSegment[] = [];
    for (const [index, audioPath] of audioFiles.entries()) {
      await progress(15 + Math.round((index / audioFiles.length) * 25), `Transcribing audio segment ${index + 1} of ${audioFiles.length}`);
      const audioBytes = await readFile(audioPath);
      const chunks = await providers.dubbing.transcribe(audioBytes, `audio-${index + 1}.mp3`, 'audio/mpeg', input.sourceLanguage);
      transcript.push(...chunks.map((segment) => ({ ...segment, start: segment.start + index * AUDIO_CHUNK_SECONDS, end: segment.end + index * AUDIO_CHUNK_SECONDS })));
    }
    if (!transcript.length) throw new Error('No speech was detected in the source video');
    if (transcript.length > 500) throw new Error('The video contains too many speech segments for one dubbing job');

    const names = matchCharacterNames(input.project);
    const translated: DubbingOutput['cues'] = [];
    for (const [index, segment] of transcript.entries()) {
      await progress(40 + Math.round((index / transcript.length) * 20), `Translating dialogue ${index + 1} of ${transcript.length}`);
      const translation = await providers.translation.translate(segment.text, input.targetLanguage, names);
      translated.push({ start: segment.start, end: segment.end, source: segment.text, translated: translation.trim() });
    }

    const voicePaths: string[] = [];
    for (const [index, segment] of translated.entries()) {
      await progress(60 + Math.round((index / translated.length) * 25), `Generating voice segment ${index + 1} of ${translated.length}`);
      const voice = await providers.tts.generateDialogue(segment.translated, input.voice, { language: input.targetLanguage, speed: input.speed, emotion: 'neutral' });
      if (voice.demo || !voice.url.startsWith('data:')) throw new Error('The configured TTS provider did not return a server-side audio asset');
      const audioData = voice.url.split(',')[1];
      if (!audioData) throw new Error('TTS provider returned an invalid audio payload');
      const audioPath = join(directory, `voice-${index.toString().padStart(3, '0')}.mp3`);
      await writeFile(audioPath, Buffer.from(audioData, 'base64'), { flag: 'wx' });
      voicePaths.push(audioPath);
    }

    const filters = translated.map((segment, index) => `[${index + 1}:a]aresample=48000,adelay=${Math.round(segment.start * 1_000)}|${Math.round(segment.start * 1_000)}[voice${index}]`);
    const voiceInputs = translated.map((_, index) => `[voice${index}]`).join('');
    filters.push(`${voiceInputs}amix=inputs=${voicePaths.length}:duration=longest:normalize=0,apad,atrim=duration=${durationSeconds.toFixed(3)}[dubbed]`);
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath];
    for (const voicePath of voicePaths) args.push('-i', voicePath);
    args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[dubbed]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', durationSeconds.toFixed(3), '-movflags', '+faststart', outputPath);
    await progress(88, 'Assembling dubbed audio and source video');
    await execFile(ffmpegPath, args, { timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024 });

    const subtitles = input.subtitles ? translated.map((segment, index) => `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${escapeSubtitle(segment.translated)}\n`).join('\n') : '';
    await writeFile(subtitlePath, subtitles, { encoding: 'utf8', flag: 'wx' });
    await progress(98, 'Finalizing dubbed video and subtitle track');
    const video = await readFile(outputPath);
    return { video, subtitles, cues: translated, filename: `cineforge-dub-${randomUUID()}.mp4`, durationSeconds, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}