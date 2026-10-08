import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createProviders } from '@storyflix/providers';
import { CreditLedger } from './credits.js';
import { MemoryJobQueue, type GenerationTask } from './jobs.js';
import { MemoryProjectRepository } from './repository.js';
import { createApp } from './app.js';

describe('Cineforge API demo flow', () => {
  let app: FastifyInstance;
  let repository: MemoryProjectRepository;
  let queuedTasks: GenerationTask[];

  beforeEach(async () => {
    const env = { API_RATE_LIMIT: '500', DEMO_JOB_STEP_MS: '2' };
    repository = new MemoryProjectRepository();
    queuedTasks = [];
    const jobs = new MemoryJobQueue(async (task) => { queuedTasks.push(task); return { demo: true }; }, 2);
    app = await createApp({ env, repository, providers: createProviders({}), credits: new CreditLedger(env), jobs });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it('exposes health without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'cineforge-api' });
  });

  it('creates a project, analyzes it and generates editable screenplay scenes', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title: 'Saltwater Letter', story: 'Mara finds a letter at the lighthouse. Eli knows it is addressed to tomorrow.', settings: { genre: 'Mystery', format: '16:9', durationSeconds: 60 } } });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().project.id as string;

    const analysisResponse = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/analyze`, payload: {} });
    expect(analysisResponse.statusCode).toBe(200);
    expect(analysisResponse.json().analysis.characters.map((character: { name: string }) => character.name)).toContain('Mara');
    expect(analysisResponse.json().project.characters[0].canonicalPrompt).toContain('Mara');

    const scriptResponse = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/script`, payload: { action: 'generate' } });
    expect(scriptResponse.statusCode).toBe(200);
    expect(scriptResponse.json().script.length).toBeGreaterThan(0);
    expect(scriptResponse.json().project.scenes[0]).toMatchObject({ sceneNumber: 1, durationSeconds: 20 });
    expect(scriptResponse.json().project.shots.length).toBeGreaterThan(0);
  });

  it('does not expose another owner’s project', async () => {
    const foreign = await repository.create('different-user', { title: 'Private cut', story: 'Not for the demo user.', settings: { genre: 'Drama', language: 'English', audience: 'General', tone: 'Quiet', visualStyle: 'Realism', format: '16:9', durationSeconds: 60 } });
    const response = await app.inject({ method: 'GET', url: `/v1/projects/${foreign.id}` });
    expect(response.statusCode).toBe(404);
  });

  it('recommends a genre through the active provider and labels demo output', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/genres/suggest', payload: { title: 'The Vanishing', story: 'A detective finds clues after a witness disappears.' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ genre: 'Mystery', demo: true });
  });

  it('adds canonical character IDs and profiles to video generation jobs', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title: 'Consistent Cast', story: 'Mara finds a letter at the lighthouse. Eli waits for her.' } });
    const projectId = created.json().project.id as string;
    await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/analyze`, payload: {} });
    const generated = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/script`, payload: { action: 'generate' } });
    const project = generated.json().project as { scenes: Array<{ id: string; characterIds: string[] }>; characters: Array<{ id: string; canonicalPrompt: string }> };
    const scene = project.scenes[0];
    expect(scene).toBeDefined();
    const response = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/jobs`, payload: { type: 'VIDEO_GENERATION', payload: { sceneId: scene?.id, characterIds: scene?.characterIds } } });
    expect(response.statusCode).toBe(202);
    for (let attempt = 0; attempt < 50 && queuedTasks.length === 0; attempt++) await new Promise((resolve) => setTimeout(resolve, 2));
    const task = queuedTasks.find((item) => item.type === 'VIDEO_GENERATION');
    expect(task?.payload.characterIds).toEqual(scene?.characterIds);
    for (const characterId of scene?.characterIds ?? []) {
      const character = project.characters.find((item) => item.id === characterId);
      expect(character).toBeDefined();
      expect(task?.payload.prompt).toContain(character?.canonicalPrompt);
      expect(task?.payload.prompt).toContain(characterId);
    }
  });

  it('enforces the free project limit on the backend', async () => {
    for (const title of ['One', 'Two']) {
      const response = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title, story: 'A complete short story.' } });
      expect(response.statusCode).toBe(201);
    }
    const blocked = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title: 'Four', story: 'Another story.' } });
    expect(blocked.statusCode).toBe(403);
  });

  it('charges credits and completes video jobs asynchronously', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title: 'Moving Image', story: 'A woman watches the sunrise.' } });
    const projectId = created.json().project.id as string;
    const queued = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/jobs`, payload: { type: 'VIDEO_GENERATION', payload: { prompt: 'A slow sunrise over the ocean', durationSeconds: 5 } } });
    expect(queued.statusCode).toBe(202);
    expect(queued.json()).toMatchObject({ estimatedCredits: 30, balance: 170, demo: true });
    const jobId = queued.json().job.id as string;
    let result = queued.json().job;
    for (let attempt = 0; attempt < 30 && result.status !== 'COMPLETED'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      result = (await app.inject({ method: 'GET', url: `/v1/jobs/${jobId}` })).json().job;
    }
    expect(result).toMatchObject({ status: 'COMPLETED', progress: 100, result: { demo: true } });
  });

  it('queues an export without blocking the request', async () => {
    const created = await app.inject({ method: 'POST', url: '/v1/projects', payload: { title: 'Render this', story: 'Three visual moments become a film.' } });
    const projectId = created.json().project.id as string;
    await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/analyze`, payload: {} });
    await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/script`, payload: { action: 'generate' } });
    const response = await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/export`, payload: { resolution: '720p', preset: 'youtube', format: 'mp4' } });
    expect(response.statusCode).toBe(202);
    expect(['QUEUED', 'PROCESSING']).toContain(response.json().job.status);
    expect(response.json().estimatedCredits).toBe(5);
  });

  it('reports credentials as unconfigured instead of claiming publishing is active', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/integrations' });
    expect(response.statusCode).toBe(200);
    expect(response.json().accounts.tiktok).toMatchObject({ configured: false, connected: false, publishing: false });
  });
});