import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { chunkDocument, type ProjectSettings, type StoryProject } from '@storyflix/shared';

export interface ProjectRepository {
  ensureUser?(user: { id: string; email?: string; role: 'user' | 'admin' }): Promise<void>;
  list(ownerId: string, limit?: number, offset?: number): Promise<StoryProject[]>;
  get(ownerId: string, id: string): Promise<StoryProject | null>;
  create(ownerId: string, input: { title: string; story: string; settings: ProjectSettings }): Promise<StoryProject>;
  update(ownerId: string, id: string, update: Partial<StoryProject>): Promise<StoryProject | null>;
  remove(ownerId: string, id: string): Promise<boolean>;
}

function emptyProject(ownerId: string, title: string, story: string, settings: ProjectSettings): StoryProject {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), ownerId, title, story, status: 'DRAFT', settings,
    characters: [], locations: [], scenes: [], shots: [], createdAt: now, updatedAt: now,
  };
}

function sampleProject(): StoryProject {
  const project = emptyProject('demo-user', 'The Last Light', 'On the night the sea went still, Mara found a letter addressed to tomorrow. Its ink was saltwater. Every sentence described a choice she had not made yet. At the lighthouse, Eli kept the old lens turning, though there were no ships left to guide. By dawn, Mara had to decide whether to send the letter back into the waves or answer it.', {
    genre: 'Mystery', language: 'English', audience: 'General', tone: 'Quietly suspenseful', visualStyle: 'Cinematic coastal realism', format: '16:9', durationSeconds: 180,
  });
  project.status = 'ANALYZED';
  project.characters = [
    { id: randomUUID(), name: 'Mara Venn', aliases: ['Mara'], age: 'Early 30s', gender: 'Woman', personality: 'Observant, guarded, quietly brave', role: 'Protagonist', relationships: ['Eli: childhood friend and keeper of the lighthouse'], appearance: 'Weather-marked face, expressive eyes', hair: 'Dark hair tied loosely at the nape', face: 'Fine features, a small scar above the left brow', body: 'Lean, practical posture', clothing: 'Charcoal raincoat, knitted rust scarf', voice: 'Low, measured', accent: 'Coastal English', canonicalPrompt: 'Mara Venn, early-30s woman, dark hair loosely tied, small scar above left brow, charcoal raincoat and rust scarf; consistent grounded coastal realism.' },
    { id: randomUUID(), name: 'Eli Rowan', aliases: ['Eli'], age: 'Mid 30s', gender: 'Man', personality: 'Patient, wry, deeply loyal', role: 'Supporting character', relationships: ['Mara: childhood friend'], appearance: 'Gentle face, wind-reddened skin', hair: 'Short sandy-brown hair', face: 'Soft eyes, close-trimmed beard', body: 'Tall, wiry build', clothing: 'Faded navy wool sweater, brass watch', voice: 'Warm baritone', accent: 'Coastal English', canonicalPrompt: 'Eli Rowan, mid-30s man, short sandy-brown hair and close-trimmed beard, faded navy wool sweater and brass watch; consistent grounded coastal realism.' },
  ];
  project.locations = [{ id: randomUUID(), name: 'Northpoint Lighthouse', description: 'A lighthouse above a slate-grey sea', era: 'Present day', architecture: 'Whitewashed stone tower and weathered keeper’s house', weather: 'Sea mist and intermittent rain', lighting: 'Rotating amber beam against cool twilight', mood: 'Watchful, isolated, tender', props: ['brass lens', 'salt-stained letter', 'wool blanket'], timeOfDay: 'Blue hour', canonicalPrompt: 'Whitewashed lighthouse on a rugged northern coast, old brass Fresnel lens, slate sea, soft sea mist, restrained cinematic realism.' }];
  project.scenes = [
    { id: randomUUID(), sceneNumber: 1, durationSeconds: 35, characters: ['Mara Venn'], location: 'Shoreline', time: 'Night', weather: 'Still mist', action: 'Mara discovers a saltwater letter caught between the rocks.', dialogue: '', narration: 'The sea had stopped speaking.', camera: 'Wide establishing shot into a slow push', shotType: 'Wide', lens: '35mm', movement: 'Slow push-in', lighting: 'Moonlight with lighthouse sweep', mood: 'Uncanny stillness', music: 'Sparse piano, distant low strings', sfx: 'Water drawing back over stones', imagePrompt: 'A lone woman in a rust scarf on a dark slate shoreline, a letter in her hand, lighthouse beam through sea mist.', videoPrompt: 'Slow cinematic push toward the woman as the lighthouse beam sweeps once behind her.' },
    { id: randomUUID(), sceneNumber: 2, durationSeconds: 55, characters: ['Mara Venn', 'Eli Rowan'], location: 'Lighthouse keeper’s room', time: 'Late night', weather: 'Rain against glass', action: 'Mara reads the letter while Eli keeps the ancient lens turning.', dialogue: 'ELI: It knows what you will choose. MARA: Not yet.', narration: '', camera: 'Alternating close-ups, restrained handheld', shotType: 'Medium close-up', lens: '50mm', movement: 'Subtle handheld', lighting: 'Warm lantern against blue window light', mood: 'Intimate tension', music: 'Low strings under a ticking pulse', sfx: 'Lens gears and rain', imagePrompt: 'Two friends in a lamplit lighthouse room, saltwater letter, rotating brass lens behind them.', videoPrompt: 'A measured two-shot, rack focus from the letter to Mara as the light passes.' },
    { id: randomUUID(), sceneNumber: 3, durationSeconds: 40, characters: ['Mara Venn'], location: 'Lighthouse balcony', time: 'Dawn', weather: 'Mist lifting', action: 'Mara chooses to answer, writing her own future into the tide.', dialogue: '', narration: 'Tomorrow could still be written.', camera: 'Wide crane up from the open letter', shotType: 'Wide', lens: '28mm', movement: 'Slow crane rise', lighting: 'First gold through fog', mood: 'Tentative hope', music: 'Piano motif resolves', sfx: 'Waves return, paper flutter', imagePrompt: 'A woman on a lighthouse balcony at dawn, mist lifting over the sea, letter held to her chest.', videoPrompt: 'The camera rises slowly as the first morning light reaches the water.' },
  ];
  project.shots = project.scenes.flatMap((scene) => [1, 2].map((shotNumber) => ({ id: randomUUID(), sceneId: scene.id, shotNumber, durationSeconds: Math.round(scene.durationSeconds / 2), camera: scene.camera, movement: scene.movement, dialogue: scene.dialogue, voiceover: scene.narration, sfx: scene.sfx, music: scene.music, prompt: scene.imagePrompt })));
  return project;
}

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, StoryProject>();

  constructor() {
    const sample = sampleProject();
    this.projects.set(sample.id, sample);
  }

  async list(ownerId: string, limit = 20, offset = 0): Promise<StoryProject[]> {
    return [...this.projects.values()].filter((project) => project.ownerId === ownerId && project.status !== 'ARCHIVED').slice(offset, offset + limit).map((project) => structuredClone(project));
  }

  async get(ownerId: string, id: string): Promise<StoryProject | null> {
    const project = this.projects.get(id);
    return project?.ownerId === ownerId && project.status !== 'ARCHIVED' ? structuredClone(project) : null;
  }

  async create(ownerId: string, input: { title: string; story: string; settings: ProjectSettings }): Promise<StoryProject> {
    const project = emptyProject(ownerId, input.title, input.story, input.settings);
    this.projects.set(project.id, project);
    return structuredClone(project);
  }

  async update(ownerId: string, id: string, update: Partial<StoryProject>): Promise<StoryProject | null> {
    const existing = this.projects.get(id);
    if (!existing || existing.ownerId !== ownerId || existing.status === 'ARCHIVED') return null;
    const project = { ...existing, ...update, id, ownerId, updatedAt: new Date().toISOString() };
    this.projects.set(id, project);
    return structuredClone(project);
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const existing = this.projects.get(id);
    if (!existing || existing.ownerId !== ownerId) return false;
    this.projects.set(id, { ...existing, status: 'ARCHIVED', updatedAt: new Date().toISOString() });
    return true;
  }
}

interface ProjectRow { id: string; owner_id: string; title: string; story: string; status: StoryProject['status']; settings: ProjectSettings; payload: StoryProject; created_at: Date; updated_at: Date; }

export class PostgresProjectRepository implements ProjectRepository {
  private readonly pool: Pool;
  constructor(connectionString: string) { this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined }); }

  async ensureUser(user: { id: string; email?: string; role: 'user' | 'admin' }): Promise<void> {
    await this.pool.query('INSERT INTO users (id, email, role) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, role=EXCLUDED.role, updated_at=NOW()', [user.id, user.email ?? null, user.role]);
    await this.pool.query('INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [user.id]);
  }

  async list(ownerId: string, limit = 20, offset = 0): Promise<StoryProject[]> {
    const { rows } = await this.pool.query<ProjectRow>('SELECT id, owner_id, title, story, status, settings, payload, created_at, updated_at FROM projects WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT $2 OFFSET $3', [ownerId, limit, offset]);
    return rows.map((row) => this.toProject(row));
  }

  async get(ownerId: string, id: string): Promise<StoryProject | null> {
    const { rows } = await this.pool.query<ProjectRow>('SELECT id, owner_id, title, story, status, settings, payload, created_at, updated_at FROM projects WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1', [ownerId, id]);
    return rows[0] ? this.toProject(rows[0]) : null;
  }

  async create(ownerId: string, input: { title: string; story: string; settings: ProjectSettings }): Promise<StoryProject> {
    const project = emptyProject(ownerId, input.title, input.story, input.settings);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO projects (id, owner_id, title, story, status, settings, payload, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [project.id, ownerId, project.title, project.story, project.status, project.settings, project, project.createdAt]);
      await this.syncStory(client, project);
      await this.syncChildren(client, project);
      await client.query('COMMIT');
      return project;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async update(ownerId: string, id: string, update: Partial<StoryProject>): Promise<StoryProject | null> {
    const existing = await this.get(ownerId, id);
    if (!existing) return null;
    const project = { ...existing, ...update, id, ownerId, updatedAt: new Date().toISOString() };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('UPDATE projects SET title=$3, story=$4, status=$5, settings=$6, payload=$7, updated_at=$8 WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL', [ownerId, id, project.title, project.story, project.status, project.settings, project, project.updatedAt]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
      await this.syncStory(client, project, project.story !== existing.story);
      await this.syncChildren(client, project);
      await client.query('COMMIT');
      return project;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const result = await this.pool.query("UPDATE projects SET status='ARCHIVED', deleted_at=NOW(), updated_at=NOW() WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL", [ownerId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> { await this.pool.end(); }

  private async syncStory(client: PoolClient, project: StoryProject, replaceChunks = true): Promise<void> {
    const current = await client.query<{ id: string }>('SELECT id FROM stories WHERE owner_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 1', [project.ownerId, project.id]);
    const storyId = current.rows[0]?.id ?? randomUUID();
    if (current.rows[0]) {
      await client.query('UPDATE stories SET source_text=$3, language=$4, updated_at=NOW() WHERE owner_id=$1 AND project_id=$2 AND id=$5', [project.ownerId, project.id, project.story, project.settings.language, storyId]);
    } else {
      await client.query('INSERT INTO stories (id, project_id, owner_id, source_text, language) VALUES ($1,$2,$3,$4,$5)', [storyId, project.id, project.ownerId, project.story, project.settings.language]);
    }
    if (!replaceChunks) return;
    await client.query('DELETE FROM story_chunks WHERE story_id=$1', [storyId]);
    for (const chunk of chunkDocument(project.story)) {
      await client.query('INSERT INTO story_chunks (story_id, project_id, chunk_index, chapter, content, token_estimate) VALUES ($1,$2,$3,$4,$5,$6)', [storyId, project.id, chunk.index, chunk.chapter ?? null, chunk.text, chunk.tokenEstimate]);
    }
  }

  private async syncChildren(client: PoolClient, project: StoryProject): Promise<void> {
    const characterIds = project.characters.map((character) => character.id);
    const locationIds = project.locations.map((location) => location.id);
    const sceneIds = project.scenes.map((scene) => scene.id);
    await client.query('DELETE FROM characters WHERE project_id=$1 AND NOT (id = ANY($2::uuid[]))', [project.id, characterIds]);
    await client.query('DELETE FROM locations WHERE project_id=$1 AND NOT (id = ANY($2::uuid[]))', [project.id, locationIds]);
    await client.query('DELETE FROM scenes WHERE project_id=$1 AND NOT (id = ANY($2::uuid[]))', [project.id, sceneIds]);

    for (const character of project.characters) {
      await client.query('INSERT INTO characters (id, project_id, name, aliases, role, canon, canonical_prompt) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, aliases=EXCLUDED.aliases, role=EXCLUDED.role, canon=EXCLUDED.canon, canonical_prompt=EXCLUDED.canonical_prompt, updated_at=NOW()', [character.id, project.id, character.name, character.aliases, character.role, character, character.canonicalPrompt]);
      await client.query('DELETE FROM character_aliases WHERE character_id=$1', [character.id]);
      for (const alias of character.aliases) {
        await client.query('INSERT INTO character_aliases (character_id, project_id, alias) VALUES ($1,$2,$3) ON CONFLICT (project_id, normalized_alias) DO UPDATE SET character_id=EXCLUDED.character_id', [character.id, project.id, alias]);
      }
    }
    for (const location of project.locations) {
      await client.query('INSERT INTO locations (id, project_id, name, description, canon, canonical_prompt) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, canon=EXCLUDED.canon, canonical_prompt=EXCLUDED.canonical_prompt, updated_at=NOW()', [location.id, project.id, location.name, location.description, location, location.canonicalPrompt]);
    }
    if (project.script) {
      await client.query('INSERT INTO scripts (project_id, version, language, content) VALUES ($1,1,$2,$3) ON CONFLICT (project_id, version) DO UPDATE SET language=EXCLUDED.language, content=EXCLUDED.content, updated_at=NOW()', [project.id, project.settings.language, project.script]);
    }
    for (const scene of project.scenes) {
      await client.query('INSERT INTO scenes (id, project_id, scene_number, duration_seconds, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET scene_number=EXCLUDED.scene_number, duration_seconds=EXCLUDED.duration_seconds, data=EXCLUDED.data, updated_at=NOW()', [scene.id, project.id, scene.sceneNumber, scene.durationSeconds, scene]);
      await client.query('DELETE FROM scene_characters WHERE scene_id=$1', [scene.id]);
      const linkedCharacterIds = scene.characterIds ?? project.characters.filter((character) => scene.characters.some((name) => name.toLowerCase() === character.name.toLowerCase())).map((character) => character.id);
      for (const characterId of linkedCharacterIds) {
        if (characterIds.includes(characterId)) await client.query('INSERT INTO scene_characters (scene_id, character_id, project_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [scene.id, characterId, project.id]);
      }
    }
    const shots = project.shots ?? [];
    const shotIds = shots.map((shot) => shot.id);
    if (sceneIds.length) await client.query('DELETE FROM shots WHERE scene_id = ANY($1::uuid[]) AND NOT (id = ANY($2::uuid[]))', [sceneIds, shotIds]);
    for (const shot of shots) {
      await client.query('INSERT INTO shots (id, scene_id, shot_number, duration_seconds, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scene_id, shot_number) DO UPDATE SET duration_seconds=EXCLUDED.duration_seconds, data=EXCLUDED.data, updated_at=NOW()', [shot.id, shot.sceneId, shot.shotNumber, shot.durationSeconds, shot]);
    }
  }

  private toProject(row: ProjectRow): StoryProject { return { ...row.payload, id: row.id, ownerId: row.owner_id, title: row.title, story: row.story, status: row.status, settings: row.settings, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }; }
}

export function createProjectRepository(env: Record<string, string | undefined> = process.env): ProjectRepository {
  return env.DATABASE_URL ? new PostgresProjectRepository(env.DATABASE_URL) : new MemoryProjectRepository();
}