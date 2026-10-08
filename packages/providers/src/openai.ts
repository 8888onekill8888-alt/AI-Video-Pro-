import type { ScriptScene, StoryAnalysis } from '@storyflix/shared';
import type { StoryInput, TextProvider } from './index.js';

export class OpenAITextProvider implements TextProvider {
  readonly name = 'OpenAI';
  readonly demo = false;
  constructor(private readonly apiKey: string, private readonly model: string) {}

  private async complete(system: string, user: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`Text provider failed (${response.status})`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Text provider returned an empty response');
    return content;
  }

  async suggestGenre(input: Pick<StoryInput, 'title' | 'story'>): Promise<{ genre: string; reason: string }> {
    const content = await this.complete(
      'Recommend exactly one best-fit film genre. Allowed: Romance, Action, Adventure, Comedy, Drama, Horror, Thriller, Sci-Fi, Fantasy, Mystery, Documentary. Return JSON {"genre":"...","reason":"..."}.',
      JSON.stringify(input),
    );
    const result = JSON.parse(content) as { genre?: string; reason?: string };
    const allowed = new Set(['Romance', 'Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 'Thriller', 'Sci-Fi', 'Fantasy', 'Mystery', 'Documentary']);
    if (!result.genre || !allowed.has(result.genre)) throw new Error('Genre provider returned an unsupported genre');
    return { genre: result.genre, reason: result.reason ?? 'Recommended from story themes and stakes.' };
  }

  async analyzeStory(input: StoryInput): Promise<StoryAnalysis> {
    const content = await this.complete('Analyze the story as a film dramaturg. Return strict JSON matching StoryAnalysis. Keep names stable and use editable, concise fields.', JSON.stringify(input));
    return JSON.parse(content) as StoryAnalysis;
  }

  async generateScript(input: StoryInput, analysis?: StoryAnalysis): Promise<ScriptScene[]> {
    const content = await this.complete('Adapt the story into a concise cinematic screenplay. Return strict JSON with a scenes array. Each scene must contain sceneNumber, characters (character names from the supplied bible only), heading, location, time, action, dialogue [{character,line,direction}], voiceover, camera, lighting, sound, music, transition.', JSON.stringify({ ...input, analysis }));
    const parsed = JSON.parse(content) as { scenes?: ScriptScene[] } | ScriptScene[];
    return Array.isArray(parsed) ? parsed : parsed.scenes ?? [];
  }

  async translate(text: string, targetLanguage: string, names: string[] = []): Promise<string> {
    const content = await this.complete(`Translate into ${targetLanguage}. Preserve formatting, IDs, speaker names and timestamps. Never translate these names: ${names.join(', ')}. Return JSON {"translation":"..."}.`, JSON.stringify({ text }));
    return (JSON.parse(content) as { translation: string }).translation;
  }
}