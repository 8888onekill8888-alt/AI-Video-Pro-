import { randomUUID } from 'node:crypto';
import type { Character, StoryLocation, StoryScene } from '@storyflix/shared';
import type { GeneratedAsset, ImageProvider } from './index.js';

export class FalImageProvider implements ImageProvider {
  readonly name = 'fal.ai';
  readonly demo = false;
  constructor(private readonly apiKey: string, private readonly model = 'fal-ai/flux/schnell') {}

  private async generate(prompt: string): Promise<GeneratedAsset> {
    const response = await fetch(`https://queue.fal.run/${this.model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Image provider failed (${response.status})`);
    let data = await response.json() as { images?: Array<{ url: string }>; response_url?: string };
    const responseUrl = data.response_url;
    if (responseUrl) {
      const deadline = Date.now() + 180_000;
      while (!data.images?.[0]?.url && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const statusResponse = await fetch(responseUrl, { headers: { Authorization: `Key ${this.apiKey}` } });
        if (!statusResponse.ok) throw new Error(`Image provider polling failed (${statusResponse.status})`);
        data = await statusResponse.json() as typeof data;
      }
    }
    const url = data.images?.[0]?.url;
    if (!url) throw new Error('Image provider completed without an image');
    return { id: randomUUID(), url, mimeType: 'image/jpeg', provider: this.name, demo: false, prompt };
  }

  generateCharacter(character: Character, variant = 'portrait') { return this.generate(`${character.canonicalPrompt}; ${variant}`); }
  generateLocation(location: StoryLocation, variant = 'exterior') { return this.generate(`${location.canonicalPrompt}; ${variant}`); }
  generateScene(scene: StoryScene, characters: Character[]) { return this.generate(`${scene.imagePrompt}; consistent characters: ${characters.map((item) => item.canonicalPrompt).join('; ')}`); }
  generateStoryboard(scene: StoryScene, shotPrompt: string, characters: Character[]) { return this.generate(`${shotPrompt}; ${scene.action}; consistent characters: ${characters.map((item) => item.canonicalPrompt).join('; ')}`); }
  generatePoster(title: string, prompt: string) { return this.generate(`Film poster titled ${title}. ${prompt}`); }
  generateThumbnail(title: string, prompt: string) { return this.generate(`Film thumbnail for ${title}. ${prompt}`); }
}