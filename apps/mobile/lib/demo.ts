import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "./storage";
import type { StoryLocation, StoryScene, StoryShot } from "@storyflix/shared";

const images = [
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=80",
];
const createId = () =>
  `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function detectNames(story: string): string[] {
  const ignored = new Set([
    "The",
    "This",
    "That",
    "When",
    "Then",
    "After",
    "Before",
    "Once",
    "One",
    "A",
    "An",
    "In",
    "At",
    "On",
    "During",
    "It",
    "He",
    "She",
    "They",
    "But",
    "And",
    "If",
    "As",
    "By",
    "From",
    "For",
    "Her",
    "His",
    "Their",
    "Chapter",
    "Scene",
  ]);
  return [
    ...new Set(
      (story.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) ?? [])
        .filter((name) => !ignored.has(name.split(" ")[0] ?? ""))
        .slice(0, 4),
    ),
  ];
}

function makeAnalysis(project: LocalProject) {
  const paragraphs = project.story
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names = detectNames(project.story);
  const location =
    project.story.match(
      /(?:at|in|inside|outside)\s+(?:the\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})/,
    )?.[1] ?? "The central setting";
  return {
    title: project.title,
    genre: project.genre,
    themes: ["Courage", "Belonging", "Change"],
    tone: "Cinematic, intimate, hopeful",
    plot: (paragraphs[0] ?? project.story).slice(0, 280),
    beginning: paragraphs[0] ?? project.story.slice(0, 220),
    middle:
      paragraphs[1] ??
      "A discovery tests the protagonist and changes their goal.",
    climax:
      "The protagonist makes an irreversible choice that resolves the central conflict.",
    ending:
      paragraphs.at(-1) ?? "A new beginning opens beyond the final scene.",
    mainConflict: `${names[0] ?? "The protagonist"} must choose what matters most when the story changes direction.`,
    characters: (names.length ? names : ["The protagonist"]).map(
      (name, index) => ({
        name,
        role: index ? "Supporting character" : "Protagonist",
        description: `${name} is central to this ${project.genre.toLowerCase()} story.`,
      }),
    ),
    relationships: names
      .slice(1)
      .map((name) => `${names[0]} ↔ ${name}: relationship to refine`),
    locations: [location],
    timePeriod: "Unspecified; editable",
    importantEvents: [
      paragraphs[0] ?? project.story.slice(0, 150),
      "A revelation shifts the stakes",
      "A decisive final choice",
    ],
    visualOpportunities: [
      "A cinematic establishing frame",
      "A recurring object that gathers meaning",
      "Contrasting light at the turning point",
    ],
  };
}

function buildProduction(project: LocalProject): LocalProject {
  const analysis = project.analysis ?? makeAnalysis(project);
  const previous = project.characters ?? [];
  const characters = analysis.characters.map((item) => {
    const prior = previous.find(
      (character) => character.name.toLowerCase() === item.name.toLowerCase(),
    );
    const canonicalPrompt =
      prior?.canonicalPrompt ??
      `${item.name}, ${item.role}; ${item.description}; consistent face, hair, body proportions and wardrobe in every image and video.`;
    return {
      id: prior?.id ?? createId(),
      name: item.name,
      aliases: prior?.aliases ?? [],
      age: prior?.age ?? "Unspecified",
      gender: prior?.gender ?? "Unspecified",
      personality: prior?.personality ?? item.description,
      role: item.role,
      relationships: prior?.relationships ?? [],
      appearance: prior?.appearance ?? item.description,
      hair: prior?.hair ?? "Define a consistent hairstyle",
      face: prior?.face ?? item.description,
      body: prior?.body ?? "Natural cinematic proportions",
      clothing: prior?.clothing ?? "Wardrobe to be defined",
      voice: prior?.voice ?? "Narrator",
      accent: prior?.accent ?? project.genre,
      canonicalPrompt,
      imageUrl: prior?.imageUrl ?? images[0],
    };
  });
  const priorLocations = project.locations ?? [];
  const locations: StoryLocation[] = analysis.locations.map((name) => {
    const prior = priorLocations.find(
      (location) => location.name.toLowerCase() === name.toLowerCase(),
    );
    return {
      id: prior?.id ?? createId(),
      name,
      description:
        prior?.description ?? `A distinctive setting from ${project.title}.`,
      era: prior?.era ?? analysis.timePeriod,
      architecture: prior?.architecture ?? "Architecture to be defined",
      weather: prior?.weather ?? "As the story requires",
      lighting: prior?.lighting ?? "Motivated cinematic light",
      mood: prior?.mood ?? analysis.tone,
      props: prior?.props ?? [],
      timeOfDay: prior?.timeOfDay ?? "Varies by scene",
      canonicalPrompt:
        prior?.canonicalPrompt ??
        `${name}; ${analysis.timePeriod}; consistent layout, palette and signature props.`,
      imageUrl: prior?.imageUrl ?? images[1],
    };
  });
  const storyLines = project.story
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lead = storyLines[0] ?? project.story;
  const middle =
    storyLines[Math.floor(storyLines.length / 2)] ??
    "A discovery changes the plan.";
  const ending = storyLines.at(-1) ?? "The protagonist chooses a new path.";
  const character = characters[0]?.name ?? "PROTAGONIST";
  const script = project.script ?? [
    {
      sceneNumber: 1,
      heading: "EXT. THE CENTRAL LOCATION — DAWN",
      location: locations[0]?.name ?? "Central location",
      time: "Dawn",
      action: lead,
      dialogue: [],
      voiceover: "",
      camera: "Slow wide push-in",
      lighting: "Cool dawn and a warm practical source",
      sound: "Wind and distant room tone",
      music: "Sparse piano motif",
      transition: "FADE IN:",
    },
    {
      sceneNumber: 2,
      heading: "INT. A PLACE OF DECISION — NIGHT",
      location: "A place of decision",
      time: "Night",
      action: middle,
      dialogue: [{ character, line: "I thought the answer would be easier." }],
      voiceover: "",
      camera: "Restrained handheld close-up",
      lighting: "Motivated side light, deep negative fill",
      sound: "A held breath, then silence",
      music: "Low string pulse",
      transition: "CUT TO:",
    },
    {
      sceneNumber: 3,
      heading: "EXT. THE WAY FORWARD — SUNRISE",
      location: "The way forward",
      time: "Sunrise",
      action: ending,
      dialogue: [{ character, line: "Then we begin again." }],
      voiceover: "",
      camera: "Wide frame, slow crane rise",
      lighting: "Soft gold through haze",
      sound: "Air opens around the scene",
      music: "Quiet hopeful resolve",
      transition: "FADE OUT.",
    },
  ];
  const durationSeconds = Math.max(
    1,
    Math.round(project.durationSeconds / script.length),
  );
  const scenes: StoryScene[] = project.scenes?.length
    ? project.scenes
    : script.map((scene, index) => {
        const sceneCharacters = scene.dialogue
          .map((line) => line.character)
          .filter(Boolean);
        const prompt = `${scene.action} ${scene.lighting}. ${project.genre} cinematic. Character continuity: ${characters.map((item) => item.canonicalPrompt).join("; ")}`;
        return {
          id: createId(),
          sceneNumber: scene.sceneNumber,
          durationSeconds,
          characters: sceneCharacters.length ? sceneCharacters : [character],
          location: scene.location,
          time: scene.time,
          weather: "As the story requires",
          action: scene.action,
          dialogue: scene.dialogue
            .map((line) => `${line.character}: ${line.line}`)
            .join("\n"),
          narration: scene.voiceover,
          camera: scene.camera,
          shotType: "Master shot",
          lens: "35mm",
          movement: "Slow cinematic camera movement",
          lighting: scene.lighting,
          mood: analysis.tone,
          music: scene.music,
          sfx: scene.sound,
          imagePrompt: prompt,
          videoPrompt: `${prompt} ${scene.camera}`,
          imageUrl: images[index % images.length],
        };
      });
  const shots: StoryShot[] = project.shots?.length
    ? project.shots
    : scenes.flatMap((scene) => [
        {
          id: createId(),
          sceneId: scene.id,
          shotNumber: 1,
          imageUrl: images[0],
          durationSeconds: Math.round(scene.durationSeconds / 2),
          camera: "Wide establishing shot",
          movement: "Slow push-in",
          dialogue: "",
          voiceover: "",
          sfx: scene.sfx,
          music: scene.music,
          prompt: `${scene.location}; ${scene.lighting}; establishing frame`,
        },
        {
          id: createId(),
          sceneId: scene.id,
          shotNumber: 2,
          imageUrl: scene.imageUrl,
          durationSeconds: Math.round(scene.durationSeconds / 2),
          camera: scene.camera,
          movement: scene.movement,
          dialogue: scene.dialogue,
          voiceover: scene.narration,
          sfx: scene.sfx,
          music: scene.music,
          prompt: scene.imagePrompt,
        },
      ]);
  const timeline = project.timeline ?? [
    {
      id: createId(),
      type: "VIDEO" as const,
      muted: false,
      volume: 1,
      clips: scenes.map((scene, index) => ({
        id: createId(),
        sceneId: scene.id,
        startSeconds: scenes
          .slice(0, index)
          .reduce((sum, before) => sum + before.durationSeconds, 0),
        endSeconds: scenes
          .slice(0, index + 1)
          .reduce((sum, current) => sum + current.durationSeconds, 0),
        trimInSeconds: 0,
        trimOutSeconds: 0,
        volume: 1,
        fadeInSeconds: 0.5,
        fadeOutSeconds: 0.5,
        speed: 1,
      })),
    },
    ...(["VOICE", "MUSIC", "SFX", "SUBTITLES"] as const).map((type) => ({
      id: createId(),
      type,
      muted: false,
      volume: 1,
      clips: [],
    })),
  ];
  return {
    ...project,
    analysis,
    script,
    characters,
    locations,
    scenes,
    shots,
    timeline,
    status: "IN_PRODUCTION",
    updatedAt: new Date().toISOString(),
  };
}

export async function completeLocalDemoStep(
  id: string,
  step: string,
): Promise<LocalProject | null> {
  const project = (await getLocalProjects()).find((item) => item.id === id);
  if (!project) return null;
  let next = { ...project };
  if (step === "analysis")
    next = { ...buildProduction(next), status: "ANALYZED" };
  else if (step === "script" || step === "characters" || step === "scenes")
    next = buildProduction(next);
  else if (step === "voice") {
    next = buildProduction(next);
    next.voiceAssets = [
      {
        id: createId(),
        name: `${next.title} · Demo narrator`,
        provider: "Storyflix Demo Voice",
        demo: true,
      },
    ];
  } else if (step === "export") {
    next = buildProduction(next);
    next.exportResult = {
      id: createId(),
      format: "mp4",
      resolution: "720p",
      demo: true,
      status: "COMPLETED",
      label: "Simulated demo render · No generated AI video",
    };
    next.status = "COMPLETED";
  }
  next.updatedAt = new Date().toISOString();
  await saveLocalProject(next);
  return next;
}

export async function moveLocalShot(
  projectId: string,
  shotId: string,
  direction: -1 | 1,
): Promise<LocalProject | null> {
  const project = (await getLocalProjects()).find(
    (item) => item.id === projectId,
  );
  if (!project?.shots) return project ?? null;
  const shots = [...project.shots];
  const current = shots.findIndex((shot) => shot.id === shotId);
  const target = current + direction;
  if (current < 0 || target < 0 || target >= shots.length) return project;
  [shots[current], shots[target]] = [shots[target]!, shots[current]!];
  const next = {
    ...project,
    shots: shots.map((shot, index) => ({ ...shot, shotNumber: index + 1 })),
    updatedAt: new Date().toISOString(),
  };
  await saveLocalProject(next);
  return next;
}
