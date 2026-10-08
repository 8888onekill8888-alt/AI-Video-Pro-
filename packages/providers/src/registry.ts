import type { ProviderSet } from './index.js';
import { DemoDubbingProvider, DemoImageProvider, DemoMusicProvider, DemoTextProvider, DemoTTSProvider, DemoVideoProvider } from './demo.js';
import { ElevenLabsTTSProvider } from './elevenlabs.js';
import { FalImageProvider } from './fal.js';
import { OpenAIDubbingProvider } from './openai-dubbing.js';
import { OpenAITextProvider } from './openai.js';
import { ReplicateVideoProvider } from './replicate.js';
import { RunwayVideoProvider } from './runway.js';

export function createProviders(env: Record<string, string | undefined> = process.env): ProviderSet {
  const text = env.OPENAI_API_KEY && env.OPENAI_MODEL ? new OpenAITextProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL) : new DemoTextProvider();
  const image = env.FAL_API_KEY ? new FalImageProvider(env.FAL_API_KEY, env.FAL_IMAGE_MODEL) : new DemoImageProvider();
  const runwayConfigured = Boolean(env.RUNWAYML_API_SECRET && env.RUNWAY_MODEL);
  const replicateConfigured = Boolean(env.REPLICATE_API_TOKEN && env.REPLICATE_VIDEO_MODEL);
  const video = runwayConfigured
    ? new RunwayVideoProvider(env.RUNWAYML_API_SECRET!, env.RUNWAY_MODEL!)
    : replicateConfigured
      ? new ReplicateVideoProvider(env.REPLICATE_API_TOKEN!, env.REPLICATE_VIDEO_MODEL!)
      : new DemoVideoProvider();
  const tts = env.ELEVENLABS_API_KEY ? new ElevenLabsTTSProvider(env.ELEVENLABS_API_KEY, env.ELEVENLABS_DEFAULT_VOICE_ID) : new DemoTTSProvider();
  const dubbing = env.OPENAI_API_KEY && env.OPENAI_TRANSCRIPTION_MODEL
    ? new OpenAIDubbingProvider(env.OPENAI_API_KEY, env.OPENAI_TRANSCRIPTION_MODEL)
    : new DemoDubbingProvider();
  const music = new DemoMusicProvider();
  const translation = text;
  const status: ProviderSet['status'] = {
    text: { configured: !text.demo, mode: text.demo ? 'demo' : 'live' },
    image: { configured: !image.demo, mode: image.demo ? 'demo' : 'live' },
    video: { configured: !video.demo, mode: video.demo ? 'demo' : 'live' },
    tts: { configured: !tts.demo, mode: tts.demo ? 'demo' : 'live' },
    dubbing: { configured: !dubbing.demo, mode: dubbing.demo ? 'demo' : 'live' },
    runway: { configured: runwayConfigured, mode: runwayConfigured && video.name === 'Runway' ? 'live' : 'demo' },
    translation: { configured: !translation.demo, mode: translation.demo ? 'demo' : 'live' },
    music: { configured: false, mode: 'demo' },
  };
  return { text, image, video, tts, dubbing, translation, music, status, demoMode: Object.values(status).every((provider) => provider.mode === 'demo') };
}