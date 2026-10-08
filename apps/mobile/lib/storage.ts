import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Character,
  ScriptScene,
  StoryAnalysis,
  StoryLocation,
  StoryScene,
  StoryShot,
  SubtitleCue,
  TimelineTrack,
} from "@storyflix/shared";

const PROJECTS_KEY = "storyflix.projects.v1";

export interface LocalProject {
  id: string;
  title: string;
  story: string;
  genre: string;
  format: "9:16" | "16:9" | "1:1" | "4:5";
  durationSeconds: number;
  language?: string;
  audience?: string;
  tone?: string;
  visualStyle?: string;
  resolution?: "720p" | "1080p" | "4k";
  fps?: 24 | 25 | 30 | 60;
  updatedAt: string;
  status: string;
  analysis?: StoryAnalysis;
  script?: ScriptScene[];
  characters?: Character[];
  locations?: StoryLocation[];
  scenes?: StoryScene[];
  shots?: StoryShot[];
  subtitles?: SubtitleCue[];
  timeline?: TimelineTrack[];
  voiceAssets?: Array<{
    id: string;
    name: string;
    provider: string;
    demo: true;
  }>;
  exportResult?: {
    id: string;
    format: "mp4";
    resolution: string;
    demo: boolean;
    status: "QUEUED" | "COMPLETED" | "FAILED";
    label: string;
    url?: string;
  };
  translations?: Record<string, string>;
}

export async function getLocalProjects(): Promise<LocalProject[]> {
  try {
    return JSON.parse(
      (await AsyncStorage.getItem(PROJECTS_KEY)) ?? "[]",
    ) as LocalProject[];
  } catch {
    return [];
  }
}

export async function saveLocalProject(project: LocalProject): Promise<void> {
  const projects = await getLocalProjects();
  await AsyncStorage.setItem(
    PROJECTS_KEY,
    JSON.stringify([
      project,
      ...projects.filter((item) => item.id !== project.id),
    ]),
  );
}

export async function updateLocalProject(
  id: string,
  update: Partial<LocalProject>,
): Promise<void> {
  const projects = await getLocalProjects();
  await AsyncStorage.setItem(
    PROJECTS_KEY,
    JSON.stringify(
      projects.map((item) => (item.id === id ? { ...item, ...update } : item)),
    ),
  );
}

export async function deleteLocalProject(id: string): Promise<void> {
  const projects = await getLocalProjects();
  await AsyncStorage.setItem(
    PROJECTS_KEY,
    JSON.stringify(projects.filter((item) => item.id !== id)),
  );
}

export async function clearLocalProjects(): Promise<void> {
  await AsyncStorage.removeItem(PROJECTS_KEY);
}
