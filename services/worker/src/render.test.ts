import { describe, expect, it } from 'vitest';
import type { StoryProject, StoryScene } from '@storyflix/shared';
import { renderProjectToMp4 } from './render.js';

const scene: StoryScene = {
  id: 'scene-1', sceneNumber: 1, title: 'Opening', durationSeconds: 5, characters: [], characterIds: [], location: 'Harbor', time: 'Dawn', weather: 'Fog',
  action: 'A letter arrives', dialogue: '', narration: '', camera: 'Wide', shotType: 'Establishing', lens: '35mm', movement: 'Slow push',
  lighting: 'Dawn', mood: 'Quiet', music: '', sfx: '', imagePrompt: 'A foggy harbor', negativePrompt: '', videoPrompt: 'A slow pan over a foggy harbor',
  imageUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26',
};

function projectWithScene(changes: Partial<StoryScene> = {}): StoryProject {
  return {
    id: '00000000-0000-4000-8000-000000000001', ownerId: '00000000-0000-4000-8000-000000000002', title: 'Test film', story: '', status: 'IN_PRODUCTION',
    settings: { genre: 'Drama', language: 'English', audience: 'General', tone: 'Quiet', visualStyle: 'Naturalism', format: '16:9', durationSeconds: 30, resolution: '720p', fps: 24 },
    characters: [], locations: [], scenes: [{ ...scene, ...changes }], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  };
}

describe('FFmpeg render input validation', () => {
  it('refuses demo images instead of packaging placeholders as film footage', async () => {
    await expect(renderProjectToMp4(projectWithScene({ imageDemo: true }))).rejects.toThrow('Demo placeholders are not rendered');
  });

  it('rejects insecure or unapproved media URLs before invoking FFmpeg', async () => {
    await expect(renderProjectToMp4(projectWithScene({ imageUrl: 'http://untrusted.example/frame.jpg' }))).rejects.toThrow('not from an approved HTTPS provider');
  });

  it('requires at least one scene', async () => {
    const project = projectWithScene();
    project.scenes = [];
    await expect(renderProjectToMp4(project)).rejects.toThrow('Add at least one scene');
  });
});