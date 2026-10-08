import { describe, expect, it } from 'vitest';
import { createProviders } from './registry.js';

describe('provider registry', () => {
  it('activates all demo providers without credentials', () => {
    const providers = createProviders({});
    expect(providers.demoMode).toBe(true);
    expect(Object.values(providers.status).every((item) => item.mode === 'demo')).toBe(true);
  });

  it('uses configured adapters independently and keeps unrelated providers in demo mode', () => {
    const providers = createProviders({ OPENAI_API_KEY: 'test-placeholder', OPENAI_MODEL: 'test-model', FAL_API_KEY: 'test-placeholder' });
    expect(providers.text.demo).toBe(false);
    expect(providers.image.demo).toBe(false);
    expect(providers.video.demo).toBe(true);
    expect(providers.demoMode).toBe(false);
  });

  it('embeds the canonical character bible into image generation prompts', async () => {
    const providers = createProviders({});
    const character = { id: 'c1', name: 'Mara', aliases: [], age: '30', gender: 'woman', personality: '', role: 'lead', relationships: [], appearance: '', hair: '', face: '', body: '', clothing: '', voice: '', accent: '', canonicalPrompt: 'Mara has a red scarf and a small scar.' };
    const asset = await providers.image.generateCharacter(character, 'expression sheet');
    expect(asset.demo).toBe(true);
    expect(asset.prompt).toContain(character.canonicalPrompt);
    expect(asset.prompt).toContain('expression sheet');
  });
});