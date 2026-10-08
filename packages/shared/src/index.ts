export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type JobType =
  | 'STORY_ANALYSIS'
  | 'SCRIPT_GENERATION'
  | 'CHARACTER_GENERATION'
  | 'LOCATION_GENERATION'
  | 'IMAGE_GENERATION'
  | 'VIDEO_GENERATION'
  | 'DUBBING_GENERATION'
  | 'TTS_GENERATION'
  | 'TRANSLATION'
  | 'SUBTITLE_GENERATION'
  | 'VIDEO_RENDER'
  | 'EXPORT';

export type CreditOperation =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'TTS'
  | 'TRANSLATION'
  | 'UPSCALE'
  | 'RENDER';

export type ProjectFormat = '9:16' | '16:9' | '1:1' | '4:5';

export interface ProjectSettings {
  genre: string;
  language: string;
  audience: string;
  tone: string;
  visualStyle: string;
  format: ProjectFormat;
  durationSeconds: number;
  resolution?: '720p' | '1080p' | '4k';
  fps?: 24 | 25 | 30 | 60;
}

export interface StoryProject {
  id: string;
  ownerId: string;
  title: string;
  story: string;
  status: 'DRAFT' | 'ANALYZED' | 'IN_PRODUCTION' | 'COMPLETED' | 'ARCHIVED';
  settings: ProjectSettings;
  analysis?: StoryAnalysis;
  script?: ScriptScene[];
  characters: Character[];
  locations: StoryLocation[];
  scenes: StoryScene[];
  shots?: StoryShot[];
  subtitles?: SubtitleCue[];
  timeline?: TimelineTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryAnalysis {
  title: string;
  genre: string;
  themes: string[];
  tone: string;
  plot: string;
  beginning: string;
  middle: string;
  climax: string;
  ending: string;
  mainConflict: string;
  characters: Array<{ name: string; role: string; description: string }>;
  relationships: string[];
  locations: string[];
  timePeriod: string;
  importantEvents: string[];
  visualOpportunities: string[];
  logline?: string;
  synopsis?: string;
  setting?: string;
  timeline?: string[];
  storyArcs?: string[];
}

export interface ScriptScene {
  sceneNumber: number;
  characters?: string[];
  heading: string;
  location: string;
  time: string;
  action: string;
  dialogue: Array<{ character: string; line: string; direction?: string }>;
  voiceover: string;
  camera: string;
  lighting: string;
  sound: string;
  music: string;
  transition: string;
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  age: string;
  gender: string;
  personality: string;
  role: string;
  relationships: string[];
  appearance: string;
  hair: string;
  eyes?: string;
  face: string;
  body: string;
  clothing: string;
  background?: string;
  voice: string;
  accent: string;
  canonicalPrompt: string;
  visualReference?: string;
  imageUrl?: string;
}

export interface StoryLocation {
  id: string;
  name: string;
  description: string;
  era: string;
  architecture: string;
  weather: string;
  lighting: string;
  mood: string;
  props: string[];
  timeOfDay: string;
  canonicalPrompt: string;
  imageUrl?: string;
}

export interface StoryScene {
  id: string;
  sceneNumber: number;
  title?: string;
  durationSeconds: number;
  characters: string[];
  characterIds?: string[];
  location: string;
  time: string;
  weather: string;
  action: string;
  dialogue: string;
  narration: string;
  camera: string;
  shotType: string;
  lens: string;
  movement: string;
  lighting: string;
  mood: string;
  music: string;
  sfx: string;
  imagePrompt: string;
  negativePrompt?: string;
  videoPrompt: string;
  imageUrl?: string;
  imageDemo?: boolean;
  videoUrl?: string;
  videoDemo?: boolean;
}

export interface StoryShot {
  id: string;
  sceneId: string;
  shotNumber: number;
  imageUrl?: string;
  durationSeconds: number;
  camera: string;
  movement: string;
  dialogue: string;
  voiceover: string;
  sfx: string;
  music: string;
  prompt: string;
  imageDemo?: boolean;
  videoUrl?: string;
  videoDemo?: boolean;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface TimelineClip {
  id: string;
  assetId?: string;
  sceneId?: string;
  startSeconds: number;
  endSeconds: number;
  trimInSeconds: number;
  trimOutSeconds: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  speed: number;
  transition?: string;
  text?: string;
}

export interface TimelineTrack {
  id: string;
  type: 'VIDEO' | 'VOICE' | 'MUSIC' | 'SFX' | 'SUBTITLES';
  muted: boolean;
  volume: number;
  clips: TimelineClip[];
}

export interface GenerationJob {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLimits {
  projects: number;
  imageGenerationsMonthly: number;
  videoGenerationsMonthly: number;
  ttsMinutesMonthly: number;
  maxResolution: '720p' | '1080p' | '4k';
  watermark: boolean;
  creditsMonthly: number;
}

export { chunkDocument, detectChapters, retrieveContext } from './documents.js';
export type { StoryChunk } from './documents.js';
export { CREDIT_COSTS, PLAN_LIMITS, SUPPORTED_LANGUAGES, creditCosts, planLimits } from './billing.js';