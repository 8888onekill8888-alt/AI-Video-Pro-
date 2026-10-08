import { randomUUID } from 'node:crypto';
import type { Character, ScriptScene, StoryAnalysis, StoryLocation, StoryScene } from '@storyflix/shared';
import type { DubbingProvider, GeneratedAsset, ImageProvider, MusicProvider, StoryInput, TextProvider, TTSProvider, VideoProvider, VoiceOptions } from './index.js';

const imagePool = [
  'photo-1478720568477-152d9b164e26',
  'photo-1500530855697-b586d89ba3ee',
  'photo-1518837695005-2083093ee35b',
  'photo-1500534623283-312aade485b7',
];

function asset(prompt: string, kind: string, image = 0, mimeType = 'image/jpeg'): GeneratedAsset {
  return {
    id: randomUUID(),
    url: mimeType.startsWith('image/')
      ? `https://images.unsplash.com/${imagePool[image % imagePool.length]}?auto=format&fit=crop&w=1200&q=85`
      : `demo://${kind}/${randomUUID()}`,
    mimeType,
    provider: 'Cineforge Demo Studio',
    demo: true,
    prompt,
    metadata: { label: 'DEMO MODE', generated: false },
  };
}

function capitalizedNames(text: string): string[] {
  const ignored = new Set(['The', 'This', 'That', 'When', 'Then', 'After', 'Before', 'Once', 'One', 'A', 'An', 'In', 'At', 'On', 'During', 'It', 'He', 'She', 'They', 'But', 'And', 'If', 'As', 'By', 'From', 'For', 'Her', 'His', 'Their', 'Chapter', 'Scene']);
  const found = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) ?? [];
  return [...new Set(found.filter((name) => !ignored.has(name.split(' ')[0] ?? '')).slice(0, 4))];
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

export class DemoTextProvider implements TextProvider {
  readonly name = 'Demo Story Engine';
  readonly demo = true;

  async suggestGenre(input: Pick<StoryInput, 'title' | 'story'>): Promise<{ genre: string; reason: string }> {
    const text = `${input.title} ${input.story}`.toLowerCase();
    const match = /murder|mystery|detective|clue|disappear/.test(text) ? ['Mystery', 'The story emphasizes investigation, secrets or unresolved questions.']
      : /space|planet|robot|future|spaceship|alien/.test(text) ? ['Sci-Fi', 'The story includes speculative technology, space or future settings.']
        : /ghost|haunted|nightmare|demon|fear/.test(text) ? ['Horror', 'The story leans on dread, supernatural elements or fear.']
          : /battle|warrior|fight|chase|rescue/.test(text) ? ['Action', 'The story centers on physical stakes and decisive movement.']
            : /love|heart|romance|wedding|relationship/.test(text) ? ['Romance', 'The story emphasizes intimate relationships and emotional choice.']
              : /dragon|magic|spell|kingdom|myth/.test(text) ? ['Fantasy', 'The story contains mythic or magical world-building.']
                : ['Drama', 'The story centers on character choices and emotional stakes.'];
    return { genre: match[0] ?? 'Drama', reason: match[1] ?? 'A character-led story with emotional stakes.' };
  }

  async analyzeStory(input: StoryInput): Promise<StoryAnalysis> {
    const names = capitalizedNames(input.story);
    const paragraphs = input.story.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const characters = (names.length ? names : ['The protagonist']).map((name, index) => ({
      name,
      role: index === 0 ? 'Protagonist' : index === 1 ? 'Ally' : 'Supporting character',
      description: `${name} is a key figure in this ${input.genre.toLowerCase()} story. Add canonical traits and relationships in the editable character bible.`,
    }));
    const locationMatch = input.story.match(/(?:at|in|inside|outside)\s+(?:the\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})/);
    const location = locationMatch?.[1] ?? 'The central setting';
    const lead = paragraphs[0] ?? input.story.slice(0, 240);
    const last = paragraphs.at(-1) ?? 'The story is ready for a final resolution.';
    return {
      title: input.title,
      genre: input.genre,
      themes: ['Belonging', 'Courage', 'Change'],
      tone: input.tone ?? 'Cinematic, intimate, hopeful',
      plot: `${lead.slice(0, 280)}${input.story.length > 280 ? '…' : ''}`,
      beginning: `Introduce ${characters[0]?.name} and establish ${location}. ${lead.slice(0, 180)}`,
      middle: paragraphs[1]?.slice(0, 220) ?? 'A new discovery complicates the central conflict and tests the protagonist’s resolve.',
      climax: 'The protagonist makes an irreversible choice that brings the central conflict into focus.',
      ending: last.slice(0, 220),
      mainConflict: `${characters[0]?.name} must overcome the obstacle implied by the story while protecting what matters most.`,
      characters,
      relationships: characters.slice(1).map((character) => `${characters[0]?.name} ↔ ${character.name}: relationship to be refined`),
      locations: [location, 'A threshold between safety and the unknown'],
      timePeriod: 'Unspecified contemporary era; editable',
      importantEvents: [lead.slice(0, 150), 'A revelation changes the protagonist’s goal', 'A decisive choice resolves the conflict'],
      visualOpportunities: ['A memorable establishing shot of the central location', 'A visual motif that evolves with the protagonist', 'Contrasting light at the story’s turning point'],
      logline: `${characters[0]?.name ?? 'A protagonist'} must face the central conflict before the story’s defining moment passes.`,
      synopsis: `${lead.slice(0, 350)}${input.story.length > 350 ? '…' : ''}`,
      setting: location,
      timeline: ['Opening: the ordinary world and inciting event', 'Middle: escalating choices and consequences', 'Climax: the decisive confrontation', 'Ending: the new equilibrium'],
      storyArcs: characters.map((character) => `${character.name}: begins with an unresolved need and changes through the central choice.`),
    };
  }

  async generateScript(input: StoryInput, analysis?: StoryAnalysis): Promise<ScriptScene[]> {
    const lines = sentences(input.story);
    const lead = lines[0] ?? input.story;
    const middle = lines[Math.floor(lines.length / 2)] ?? 'A new discovery changes everything.';
    const ending = lines.at(-1) ?? 'The choice is made. The world is different now.';
    const character = analysis?.characters[0]?.name ?? capitalizedNames(input.story)[0] ?? 'PROTAGONIST';
    return [
      { sceneNumber: 1, heading: 'EXT. CENTRAL LOCATION — DAWN', location: analysis?.locations[0] ?? 'Central location', time: 'Dawn', action: lead.slice(0, 260), dialogue: [], voiceover: '', camera: 'Slow, deliberate wide push-in', lighting: 'Cool dawn with a warm practical source', sound: 'Wind, distant environmental texture', music: 'Sparse piano motif enters', transition: 'FADE IN:' },
      { sceneNumber: 2, heading: 'INT. A PLACE OF DECISION — NIGHT', location: 'A place of decision', time: 'Night', action: middle.slice(0, 260), dialogue: [{ character, line: 'I thought the answer would be easier.' }], voiceover: '', camera: 'Medium close-up, restrained handheld', lighting: 'Motivated side light, deep negative fill', sound: 'Room tone gives way to a held breath', music: 'The motif gains a low string pulse', transition: 'CUT TO:' },
      { sceneNumber: 3, heading: 'EXT. THE WAY FORWARD — SUNRISE', location: 'The way forward', time: 'Sunrise', action: ending.slice(0, 260), dialogue: [{ character, line: 'Then we begin again.' }], voiceover: '', camera: 'Wide frame, slow crane rise', lighting: 'Soft golden edge light through the haze', sound: 'Air opens; a single bird call', music: 'Resolve to a quiet, hopeful cadence', transition: 'FADE OUT.' },
    ];
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    return `[Demo ${targetLanguage}] ${text}`;
  }
}

export class DemoImageProvider implements ImageProvider {
  readonly name = 'Demo Image Library';
  readonly demo = true;
  async generateCharacter(character: Character, variant = 'portrait') { return asset(`${character.canonicalPrompt}; ${variant}`, 'character', 0); }
  async generateLocation(location: StoryLocation, variant = 'exterior') { return asset(`${location.canonicalPrompt}; ${variant}`, 'location', 1); }
  async generateScene(scene: StoryScene, characters: Character[]) { return asset(`${scene.imagePrompt}; character continuity: ${characters.map((item) => item.canonicalPrompt).join('; ')}`, 'scene', 2); }
  async generateStoryboard(scene: StoryScene, shotPrompt: string, characters: Character[]) { return asset(`${shotPrompt}; scene: ${scene.action}; character continuity: ${characters.map((item) => item.canonicalPrompt).join('; ')}`, 'storyboard', 0); }
  async generatePoster(title: string, prompt: string) { return asset(`Poster for ${title}: ${prompt}`, 'poster', 3); }
  async generateThumbnail(title: string, prompt: string) { return asset(`Thumbnail for ${title}: ${prompt}`, 'thumbnail', 0); }
}

export class DemoVideoProvider implements VideoProvider {
  readonly name = 'Demo Video Simulator';
  readonly demo = true;
  async generateFromText(prompt: string) { return asset(prompt, 'video', 1, 'video/mp4'); }
  async generateFromImage(imageUrl: string, prompt: string) { return asset(`${prompt}; source image ${imageUrl}`, 'video', 2, 'video/mp4'); }
  async generateScene(scene: StoryScene, characters: Character[]) { return asset(`${scene.videoPrompt}; character continuity: ${characters.map((item) => item.canonicalPrompt).join('; ')}`, 'video', 0, 'video/mp4'); }
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class DemoTTSProvider implements TTSProvider {
  readonly name = 'Demo Voice Studio';
  readonly demo = true;
  async generateDialogue(text: string, voice: string, options?: VoiceOptions) { return { ...asset(`${voice}: ${text}`, 'voice', 0, 'audio/wav'), url: SILENT_WAV, metadata: { label: 'Demo silent audio', options } }; }
  async generateNarration(text: string, voice: string, options?: VoiceOptions) { return this.generateDialogue(text, voice, options); }
}

export class DemoMusicProvider implements MusicProvider {
  readonly name = 'Demo Sound Library';
  readonly demo = true;
  async generateMusic(prompt: string, durationSeconds: number, mood: string) { return { ...asset(`${mood}: ${prompt}`, 'music', 0, 'audio/wav'), url: SILENT_WAV, metadata: { durationSeconds, label: 'Demo silent audio' } }; }
}

export class DemoDubbingProvider implements DubbingProvider {
  readonly name = 'Dubbing not configured';
  readonly demo = true;

  async transcribe(): Promise<never> {
    throw new Error('Video dubbing requires OPENAI_API_KEY and OPENAI_TRANSCRIPTION_MODEL; the demo does not invent a transcript.');
  }
}