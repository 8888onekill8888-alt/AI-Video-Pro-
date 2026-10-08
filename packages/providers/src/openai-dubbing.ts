import type { DubbingProvider, TranscriptionSegment } from './index.js';

interface TranscriptionResponse {
  segments?: Array<{ start?: number; end?: number; text?: string }>;
  text?: string;
}

export class OpenAIDubbingProvider implements DubbingProvider {
  readonly name = 'OpenAI transcription';
  readonly demo = false;

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async transcribe(audio: Uint8Array, filename: string, mimeType: string, language?: string): Promise<TranscriptionSegment[]> {
    const form = new FormData();
    const bytes = Uint8Array.from(audio).buffer;
    form.append('file', new Blob([bytes], { type: mimeType }), filename);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (language) form.append('language', language);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Transcription provider failed (${response.status})`);
    const result = await response.json() as TranscriptionResponse;
    if (result.segments?.length) {
      return result.segments.map((segment) => ({ start: Math.max(0, segment.start ?? 0), end: Math.max(segment.start ?? 0, segment.end ?? 0), text: segment.text?.trim() ?? '' })).filter((segment) => segment.text);
    }
    if (result.text?.trim()) return [{ start: 0, end: 0, text: result.text.trim() }];
    throw new Error('Transcription provider returned no speech segments');
  }
}