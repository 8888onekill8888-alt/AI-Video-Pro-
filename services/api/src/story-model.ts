import { randomUUID } from 'node:crypto';
import type { Character, ProjectSettings, ScriptScene, StoryAnalysis, StoryLocation, StoryProject, StoryScene, StoryShot } from '@storyflix/shared';
import type { StoryInput } from '@storyflix/providers';

export function storyInput(project: StoryProject): StoryInput {
	return {
		title: project.title,
		story: project.story,
		genre: project.settings.genre,
		language: project.settings.language,
		tone: project.settings.tone,
		visualStyle: project.settings.visualStyle,
	};
}

export function buildCharacters(analysis: StoryAnalysis, existing: Character[] = []): Character[] {
	return analysis.characters.map((item) => {
		const prior = existing.find((character) => character.name.toLowerCase() === item.name.toLowerCase());
		const age = prior?.age ?? 'Unspecified';
		const appearance = prior?.appearance ?? item.description;
		const hair = prior?.hair ?? 'Define a consistent hairstyle';
		const eyes = prior?.eyes ?? 'Define consistent eye color';
		const face = prior?.face ?? item.description;
		const body = prior?.body ?? 'Natural proportions, cinematic realism';
		const clothing = prior?.clothing ?? 'Wardrobe to be defined';
		const canonicalPrompt = prior?.canonicalPrompt ?? `${item.name}, ${age}; ${appearance}; hair: ${hair}; eyes: ${eyes}; face: ${face}; body: ${body}; clothing: ${clothing}. Keep facial features, hair, body proportions and wardrobe consistent across every image and video.`;
		return {
			id: prior?.id ?? randomUUID(), name: item.name, aliases: prior?.aliases ?? [], age, gender: prior?.gender ?? 'Unspecified',
			personality: prior?.personality ?? item.description, role: item.role, relationships: prior?.relationships ?? [],
			appearance, hair, eyes, face, body, clothing, background: prior?.background ?? '', voice: prior?.voice ?? '', accent: prior?.accent ?? '', canonicalPrompt, visualReference: prior?.visualReference, imageUrl: prior?.imageUrl,
		};
	});
}

export function buildLocations(analysis: StoryAnalysis, existing: StoryLocation[] = []): StoryLocation[] {
	return analysis.locations.map((name) => {
		const prior = existing.find((location) => location.name.toLowerCase() === name.toLowerCase());
		const description = prior?.description ?? `A visually distinctive story location: ${name}.`;
		return {
			id: prior?.id ?? randomUUID(), name, description, era: prior?.era ?? analysis.timePeriod,
			architecture: prior?.architecture ?? 'Architecture to be defined from the story', weather: prior?.weather ?? 'As the scene requires',
			lighting: prior?.lighting ?? 'Consistent motivated cinematic lighting', mood: prior?.mood ?? analysis.tone,
			props: prior?.props ?? [], timeOfDay: prior?.timeOfDay ?? 'Varies by scene',
			canonicalPrompt: prior?.canonicalPrompt ?? `${name}; ${description}; ${prior?.architecture ?? 'established architecture'}; ${analysis.timePeriod}; ${analysis.tone}. Preserve the same layout, palette and signature props in all shots.`,
			imageUrl: prior?.imageUrl,
		};
	});
}

export function buildScenes(script: ScriptScene[], project: StoryProject, characters: Character[], locations: StoryLocation[]): StoryScene[] {
	const duration = Math.max(1, Math.round(project.settings.durationSeconds / Math.max(script.length, 1)));
	return script.map((scene, index) => {
		const characterNames = [...new Set([...(scene.characters ?? []), ...scene.dialogue.map((line) => line.character)].filter(Boolean))];
		if (!characterNames.length && characters[index % Math.max(1, characters.length)]) characterNames.push(characters[index % characters.length]?.name ?? '');
		const location = scene.location || locations[index % Math.max(1, locations.length)]?.name || 'Unspecified location';
		const dialogue = scene.dialogue.map((line) => `${line.character}: ${line.line}`).join('\n');
		return {
			id: randomUUID(), sceneNumber: scene.sceneNumber || index + 1, title: scene.heading, durationSeconds: duration, characters: characterNames,
			characterIds: characterNames.map((name) => characters.find((character) => character.name.toLowerCase() === name.toLowerCase())?.id).filter((id): id is string => Boolean(id)), location,
			time: scene.time || 'Unspecified', weather: 'As the story requires', action: scene.action, dialogue, narration: scene.voiceover,
			camera: scene.camera, shotType: 'Master shot', lens: '35mm', movement: 'As described in camera direction', lighting: scene.lighting,
			mood: project.settings.tone, music: scene.music, sfx: scene.sound,
			imagePrompt: `${scene.action} Location: ${location}. ${scene.lighting}. ${project.settings.visualStyle}. Characters: ${characterNames.map((name) => characters.find((character) => character.name === name)?.canonicalPrompt ?? name).join('; ')}`,
			negativePrompt: 'inconsistent character identity, altered wardrobe, extra fingers, distorted face, duplicate character, text, watermark',
			videoPrompt: `${scene.action} ${scene.camera}. ${scene.lighting}. ${scene.sound}. ${project.settings.visualStyle}. Preserve character appearance: ${characterNames.map((name) => characters.find((character) => character.name === name)?.canonicalPrompt ?? name).join('; ')}`,
		};
	});
}

export function buildShots(scenes: StoryScene[]): StoryShot[] {
	return scenes.flatMap((scene) => {
		const prompts = [
			`Establish ${scene.location} at ${scene.time}; ${scene.mood}; ${scene.lighting}`,
			`Action detail: ${scene.action}; ${scene.movement}; maintain scene continuity`,
			`Emotional close shot; dialogue ${scene.dialogue || scene.narration}; ${scene.camera}`,
		];
		return prompts.map((prompt, index) => ({
			id: randomUUID(), sceneId: scene.id, shotNumber: index + 1, durationSeconds: Math.max(2, Math.round(scene.durationSeconds / 3)),
			camera: index === 0 ? 'Wide establishing shot' : index === 1 ? scene.shotType : 'Close-up',
			movement: index === 0 ? 'Slow push-in' : scene.movement,
			dialogue: index === 2 ? scene.dialogue : '', voiceover: index === 2 ? scene.narration : '',
			sfx: scene.sfx, music: scene.music, prompt,
		}));
	});
}

export function normalizeProjectSettings(input: Partial<ProjectSettings> | undefined): ProjectSettings {
	return {
		genre: input?.genre ?? 'Drama', language: input?.language ?? 'English', audience: input?.audience ?? 'General',
		tone: input?.tone ?? 'Cinematic', visualStyle: input?.visualStyle ?? 'Cinematic realism',
		format: input?.format ?? '16:9', durationSeconds: input?.durationSeconds ?? 60,
		resolution: input?.resolution ?? '720p', fps: input?.fps ?? 24,
	};
}