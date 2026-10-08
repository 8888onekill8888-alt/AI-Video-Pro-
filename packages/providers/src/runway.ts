import { randomUUID } from 'node:crypto';
import type { Character, StoryScene } from '@storyflix/shared';
import type { GeneratedAsset, VideoProvider } from './index.js';

interface RunwayTask {
  id: string;
  status: string;
  output?: string[];
  failure?: string;
}

export class RunwayVideoProvider implements VideoProvider {
  readonly name = 'Runway';
  readonly demo = false;
  private readonly endpoint = 'https://api.dev.runwayml.com/v1';

  constructor(private readonly apiSecret: string, private readonly model: string) {}

  private async generate(prompt: string, options: { durationSeconds?: number; aspectRatio?: string; imageUrl?: string; onProgress?: (message: string) => void } = {}): Promise<GeneratedAsset> {
    const duration = Number(options.durationSeconds ?? 5) >= 8 ? 10 : 5;
    const ratio = options.aspectRatio ?? '16:9';
    const ratioMap: Record<string, string> = { '16:9': '1280:720', '9:16': '720:1280', '1:1': '960:960', '4:5': '864:1080' };
    const path = options.imageUrl ? 'image_to_video' : 'text_to_video';
    const body = options.imageUrl
      ? { model: this.model, promptText: prompt, promptImage: options.imageUrl, ratio: ratioMap[ratio] ?? ratioMap['16:9'], duration }
      : { model: this.model, promptText: prompt, ratio: ratioMap[ratio] ?? ratioMap['16:9'], duration };
    const response = await fetch(`${this.endpoint}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiSecret}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Runway request failed (${response.status})`);
    const task = await response.json() as RunwayTask;
    const deadline = Date.now() + 15 * 60_000;
    let result = task;
    while (['PENDING', 'THROTTLED', 'RUNNING'].includes(result.status) && Date.now() < deadline) {
      options.onProgress?.(`Runway task ${result.status.toLowerCase()}`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const status = await fetch(`${this.endpoint}/tasks/${encodeURIComponent(task.id)}`, {
        headers: { Authorization: `Bearer ${this.apiSecret}`, 'X-Runway-Version': '2024-11-06' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!status.ok) throw new Error(`Runway task polling failed (${status.status})`);
      result = await status.json() as RunwayTask;
    }
    if (result.status !== 'SUCCEEDED' || !result.output?.[0]) {
      throw new Error(result.failure || `Runway task ended in ${result.status}`);
    }
    return { id: randomUUID(), url: result.output[0], mimeType: 'video/mp4', provider: this.name, demo: false, prompt, metadata: { taskId: task.id, durationSeconds: duration, aspectRatio: ratio } };
  }

  generateFromText(prompt: string, options?: { durationSeconds?: number; aspectRatio?: string; onProgress?: (message: string) => void }) {
    return this.generate(prompt, options);
  }

  generateFromImage(imageUrl: string, prompt: string, options?: { durationSeconds?: number; onProgress?: (message: string) => void }) {
    return this.generate(prompt, { ...options, imageUrl });
  }

  generateScene(scene: StoryScene, characters: Character[], options?: { aspectRatio?: string; onProgress?: (message: string) => void }) {
    const characterProfiles = characters.filter((character) => !scene.characterIds?.length || scene.characterIds.includes(character.id)).map((character) => character.canonicalPrompt);
    const prompt = `${scene.videoPrompt}; canonical character profiles: ${characterProfiles.join('; ')}`;
    return this.generate(prompt, { durationSeconds: scene.durationSeconds, aspectRatio: options?.aspectRatio ?? '16:9', imageUrl: scene.imageUrl, onProgress: options?.onProgress });
  }
}