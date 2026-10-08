import type {
  Character,
  ScriptScene,
  StoryAnalysis,
  StoryLocation,
  StoryScene,
} from '@storyflix/shared';

export interface StoryInput {
  title: string;
  story: string;
  genre: string;
  language?: string;
  tone?: string;
  visualStyle?: string;
}

export interface GeneratedAsset {
  id: string;
  url: string;
  mimeType: string;
  provider: string;
  demo: boolean;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface TextProvider {
  readonly name: string;
  readonly demo: boolean;
  suggestGenre(input: Pick<StoryInput, 'title' | 'story'>): Promise<{ genre: string; reason: string }>;
  analyzeStory(input: StoryInput): Promise<StoryAnalysis>;
  generateScript(input: StoryInput, analysis?: StoryAnalysis): Promise<ScriptScene[]>;
  translate(text: string, targetLanguage: string, names?: string[]): Promise<string>;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface DubbingProvider {
  readonly name: string;
  readonly demo: boolean;
  transcribe(audio: Uint8Array, filename: string, mimeType: string, language?: string): Promise<TranscriptionSegment[]>;
}

export interface ImageProvider {
  readonly name: string;
  readonly demo: boolean;
  generateCharacter(character: Character, variant?: string): Promise<GeneratedAsset>;
  generateLocation(location: StoryLocation, variant?: string): Promise<GeneratedAsset>;
  generateScene(scene: StoryScene, characters: Character[]): Promise<GeneratedAsset>;
  generateStoryboard(scene: StoryScene, shotPrompt: string, characters: Character[]): Promise<GeneratedAsset>;
  generatePoster(title: string, prompt: string): Promise<GeneratedAsset>;
  generateThumbnail(title: string, prompt: string): Promise<GeneratedAsset>;
}

export interface VideoProvider {
  readonly name: string;
  readonly demo: boolean;
  generateFromText(prompt: string, options?: { durationSeconds?: number; aspectRatio?: string; onProgress?: (message: string) => void }): Promise<GeneratedAsset>;
  generateFromImage(imageUrl: string, prompt: string, options?: { durationSeconds?: number; onProgress?: (message: string) => void }): Promise<GeneratedAsset>;
  generateScene(scene: StoryScene, characters: Character[], options?: { aspectRatio?: string; onProgress?: (message: string) => void }): Promise<GeneratedAsset>;
}

export interface VoiceOptions {
  language?: string;
  accent?: string;
  emotion?: string;
  speed?: number;
  pitch?: number;
}

export interface TTSProvider {
  readonly name: string;
  readonly demo: boolean;
  generateDialogue(text: string, voice: string, options?: VoiceOptions): Promise<GeneratedAsset>;
  generateNarration(text: string, voice: string, options?: VoiceOptions): Promise<GeneratedAsset>;
}

export interface TranslationProvider {
  readonly name: string;
  readonly demo: boolean;
  translate(text: string, targetLanguage: string, names?: string[]): Promise<string>;
}

export interface MusicProvider {
  readonly name: string;
  readonly demo: boolean;
  generateMusic(prompt: string, durationSeconds: number, mood: string): Promise<GeneratedAsset>;
}

export interface ProviderSet {
  text: TextProvider;
  image: ImageProvider;
  video: VideoProvider;
  tts: TTSProvider;
  translation: TranslationProvider;
  music: MusicProvider;
  dubbing: DubbingProvider;
  demoMode: boolean;
  status: Record<string, { configured: boolean; mode: 'demo' | 'live' }>;
}

export { createProviders } from './registry.js';
export { DemoTextProvider, DemoImageProvider, DemoVideoProvider, DemoTTSProvider, DemoMusicProvider } from './demo.js';