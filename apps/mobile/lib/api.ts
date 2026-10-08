import type { LocalProject } from "./storage";
import type { StoryProject } from "@storyflix/shared";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

interface SessionTokens {
  access_token?: string;
  refresh_token?: string;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync("storyflix.refresh-token");
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) throw new Error("Session refresh failed");
    const tokens = (await response.json()) as SessionTokens;
    if (!tokens.access_token) throw new Error("Auth provider did not return an access token");
    await SecureStore.setItemAsync("storyflix.access-token", tokens.access_token);
    if (tokens.refresh_token) await SecureStore.setItemAsync("storyflix.refresh-token", tokens.refresh_token);
    return tokens.access_token;
  } catch {
    await SecureStore.deleteItemAsync("storyflix.access-token");
    await SecureStore.deleteItemAsync("storyflix.refresh-token");
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let accessToken = await SecureStore.getItemAsync("storyflix.access-token");
  const send = (token: string | null) => fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  let response = await send(accessToken);
  const shouldRefresh = response.status === 401 && !path.startsWith("/v1/auth/");
  if (shouldRefresh) {
    accessToken = await refreshAccessToken();
    if (accessToken) response = await send(accessToken);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiError(body.message ?? `Request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/v1/auth/logout", { method: "POST", body: "{}" });
  } finally {
    await SecureStore.deleteItemAsync("storyflix.access-token");
    await SecureStore.deleteItemAsync("storyflix.refresh-token");
  }
}

export async function parseDocumentFile(asset: {
  uri: string;
  name: string;
  mimeType?: string;
}) {
  const accessToken = await SecureStore.getItemAsync("storyflix.access-token");
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? "application/octet-stream",
  } as unknown as Blob);
  const response = await fetch(`${API_URL}/v1/documents/parse`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      body.message ?? `Document parsing failed (${response.status})`,
    );
  }
  return response.json() as Promise<{
    text: string;
    filename: string;
    characterCount: number;
    chapters: unknown[];
  }>;
}

export async function createProject(
  project: Omit<LocalProject, "id" | "updatedAt" | "status">,
) {
  return apiRequest<{ project: LocalProject }>("/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      title: project.title,
      story: project.story,
      settings: {
        genre: project.genre,
          language: project.language ?? "English",
          audience: project.audience ?? "General",
          tone: project.tone ?? "Cinematic",
          visualStyle: project.visualStyle ?? "Cinematic realism",
        format: project.format,
        durationSeconds: project.durationSeconds,
          resolution: project.resolution ?? "720p",
          fps: project.fps ?? 24,
      },
    }),
  });
}

export function toLocalProject(project: StoryProject): LocalProject {
  return {
    ...project,
    genre: project.settings.genre,
    format: project.settings.format,
    durationSeconds: project.settings.durationSeconds,
    language: project.settings.language,
    audience: project.settings.audience,
    tone: project.settings.tone,
    visualStyle: project.settings.visualStyle,
    resolution: project.settings.resolution,
    fps: project.settings.fps,
    shots: project.shots ?? [],
  };
}

export async function listProjects() {
  const response = await apiRequest<{ projects: StoryProject[] }>("/v1/projects");
  return response.projects.map(toLocalProject);
}

export async function getProject(id: string) {
  const response = await apiRequest<{ project: StoryProject }>(`/v1/projects/${encodeURIComponent(id)}`);
  return toLocalProject(response.project);
}

export async function suggestGenre(story: string, title = "Untitled") {
  return apiRequest<{ genre: string; reason: string; demo: boolean }>(
    "/v1/genres/suggest",
    { method: "POST", body: JSON.stringify({ story, title }) },
  );
}

export async function uploadDubbingVideo(
  asset: { uri: string; name: string; mimeType?: string },
  options: { projectId: string; sourceLanguage: string; targetLanguage: string; voice: string; speed: number; subtitles: boolean },
) {
  const accessToken = await SecureStore.getItemAsync("storyflix.access-token");
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? "video/mp4",
  } as unknown as Blob);
  for (const [key, value] of Object.entries(options)) formData.append(key, String(value));
  const response = await fetch(`${API_URL}/v1/dubbing/jobs`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    job?: { id: string; status: string; progress: number; message: string };
    providerConfigured?: boolean;
  };
  if (!response.ok) throw new ApiError(payload.message ?? `Dubbing upload failed (${response.status})`, response.status);
  return payload;
}

export async function runProjectAction<T>(
  id: string,
  action: string,
  body: object = {},
) {
  return apiRequest<T>(`/v1/projects/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
