import { randomUUID } from 'node:crypto';
import type { Character, StoryScene } from '@storyflix/shared';
import type { GeneratedAsset, VideoProvider } from './index.js';

export class ReplicateVideoProvider implements VideoProvider {
  readonly name = 'Replicate';
  readonly demo = false;
  constructor(private readonly apiToken: string, private readonly model = 'minimax/video-01') {}

  private async generate(prompt: string, image?: string, durationSeconds = 5): Promise<GeneratedAsset> {
    const endpoint = this.model.includes(':') ? 'https://api.replicate.com/v1/predictions' : `https://api.replicate.com/v1/models/${this.model}/predictions`;
    const input: Record<string, unknown> = { prompt, duration: Math.max(1, Math.min(10, durationSeconds)) };
    if (image) input.first_frame_image = image;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json', Prefer: 'wait=5' },
      body: JSON.stringify(this.model.includes(':') ? { version: this.model.split(':').at(-1), input } : { input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Video provider failed (${response.status})`);
    let prediction = await response.json() as { id: string; status: string; output?: string | string[]; urls?: { get?: string } };
    const deadline = Date.now() + 600_000;
    while (['starting', 'processing'].includes(prediction.status) && prediction.urls?.get && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      const next = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${this.apiToken}` } });
      if (!next.ok) throw new Error(`Video provider polling failed (${next.status})`);
      prediction = await next.json() as typeof prediction;
    }
    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (prediction.status !== 'succeeded' || !url) throw new Error(`Video generation ${prediction.status}`);
    return { id: randomUUID(), url, mimeType: 'video/mp4', provider: this.name, demo: false, prompt, metadata: { predictionId: prediction.id } };
  }

  generateFromText(prompt: string, options?: { durationSeconds?: number }) { return this.generate(prompt, undefined, options?.durationSeconds); }
  generateFromImage(imageUrl: string, prompt: string, options?: { durationSeconds?: number }) { return this.generate(prompt, imageUrl, options?.durationSeconds); }
  generateScene(scene: StoryScene, characters: Character[]) { return this.generate(`${scene.videoPrompt}; consistent characters: ${characters.map((item) => item.canonicalPrompt).join('; ')}`, scene.imageUrl, scene.durationSeconds); }
}