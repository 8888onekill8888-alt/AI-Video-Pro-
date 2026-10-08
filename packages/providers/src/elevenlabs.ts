import { randomUUID } from 'node:crypto';
import type { GeneratedAsset, TTSProvider, VoiceOptions } from './index.js';

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = 'ElevenLabs';
  readonly demo = false;
  constructor(private readonly apiKey: string, private readonly defaultVoiceId = '') {}

  private async generate(text: string, voice: string, options: VoiceOptions = {}): Promise<GeneratedAsset> {
    const voiceId = voice || this.defaultVoiceId;
    if (!voiceId) throw new Error('Choose a configured ElevenLabs voice or set ELEVENLABS_DEFAULT_VOICE_ID');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: options.emotion === 'excited' ? 0.35 : 0.55, similarity_boost: 0.75, speed: options.speed ?? 1, style: options.emotion === 'sad' ? 0.5 : 0.2 } }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`Voice provider failed (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return { id: randomUUID(), url: `data:audio/mpeg;base64,${bytes.toString('base64')}`, mimeType: 'audio/mpeg', provider: this.name, demo: false, prompt: text, metadata: { voiceId, language: options.language ?? 'en' } };
  }

  generateDialogue(text: string, voice: string, options?: VoiceOptions) { return this.generate(text, voice, options); }
  generateNarration(text: string, voice: string, options?: VoiceOptions) { return this.generate(text, voice, options); }
}