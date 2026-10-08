import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { StoryProject } from '@storyflix/shared';
import type { GeneratedAsset } from '@storyflix/providers';

const MAX_ASSET_BYTES = 500 * 1024 * 1024;

interface GenerationTask {
  id: string;
  ownerId: string;
  projectId: string;
  type: string;
  payload: Record<string, unknown>;
}

async function readLimited(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('Provider returned an empty media response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ASSET_BYTES) {
        await reader.cancel();
        throw new Error('Generated media exceeds the 500 MB limit');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

function decodedAsset(asset: GeneratedAsset): Buffer | undefined {
  if (!asset.url.startsWith('data:')) return undefined;
  const [metadata, body] = asset.url.split(',', 2);
  if (!metadata?.endsWith(';base64') || !body) throw new Error('Provider returned an unsupported data URL');
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length > MAX_ASSET_BYTES) throw new Error('Generated media exceeds the 500 MB limit');
  return bytes;
}

export class WorkerAssetStore {
  private readonly pool: Pool | undefined;

  constructor(private readonly env: Record<string, string | undefined> = process.env) {
    if (env.DATABASE_URL) this.pool = new Pool({ connectionString: env.DATABASE_URL, max: 4, ssl: env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined });
  }

  async persist(task: GenerationTask, asset: GeneratedAsset): Promise<GeneratedAsset & { storagePath?: string }> {
    if (asset.demo) return asset;
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Live media requires configured private Supabase Storage');
    const bytes = decodedAsset(asset) ?? await this.download(asset.url);
    if (!bytes.length) throw new Error('Provider returned an empty media asset');
    const category = asset.mimeType.startsWith('video/') ? 'scenes' : asset.mimeType.startsWith('audio/') ? 'audio' : 'assets';
    const extension = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'audio/mpeg' ? 'mp3' : asset.mimeType.startsWith('video/') ? 'mp4' : 'jpg';
    const path = `${task.ownerId}/${task.projectId}/${category}/${randomUUID()}.${extension}`;
    const endpoint = `${this.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
    const bucket = this.env.SUPABASE_STORAGE_BUCKET ?? 'cineforge-assets';
    const serviceKey = this.env.SUPABASE_SERVICE_ROLE_KEY;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const upload = await fetch(`${endpoint}/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': asset.mimeType, 'x-upsert': 'false' },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upload.ok) throw new Error(`Generated asset storage failed (${upload.status})`);
    const signed = await fetch(`${endpoint}/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 30 * 24 * 60 * 60 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!signed.ok) throw new Error(`Generated asset signing failed (${signed.status})`);
    const signedBody = await signed.json() as { signedURL?: string };
    if (!signedBody.signedURL) throw new Error('Storage did not return a signed generated asset URL');
    const url = signedBody.signedURL.startsWith('http') ? signedBody.signedURL : `${endpoint}${signedBody.signedURL}`;
    await this.persistDatabaseRecord(task, asset, path, url, bytes.length);
    return { ...asset, url, metadata: { ...asset.metadata, storagePath: path } };
  }

  async close(): Promise<void> { await this.pool?.end(); }

  private async download(url: string): Promise<Buffer> {
    const source = new URL(url);
    const storageHost = this.env.SUPABASE_URL ? new URL(this.env.SUPABASE_URL).hostname : '';
    const configuredHosts = (this.env.MEDIA_FETCH_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
    const approved = source.hostname === storageHost || source.hostname === 'fal.media' || source.hostname.endsWith('.fal.media') || source.hostname.endsWith('.replicate.delivery') || source.hostname.endsWith('.runwayml.com') || configuredHosts.includes(source.hostname.toLowerCase());
    if (source.protocol !== 'https:' || !approved) throw new Error('Provider media URL is not from an approved HTTPS host');
    const response = await fetch(source, { signal: AbortSignal.timeout(180_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Could not download generated media (${response.status})`);
    return readLimited(response);
  }

  private async persistDatabaseRecord(task: GenerationTask, asset: GeneratedAsset, path: string, url: string, size: number): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO assets (id, owner_id, project_id, kind, storage_path, mime_type, byte_size, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [asset.id, task.ownerId, task.projectId, asset.mimeType.startsWith('video/') ? 'VIDEO' : asset.mimeType.startsWith('audio/') ? 'AUDIO' : 'IMAGE', path, asset.mimeType, size, { provider: asset.provider, prompt: asset.prompt, demo: false }]);
      if (asset.mimeType.startsWith('video/')) {
        const sceneId = typeof task.payload.sceneId === 'string' ? task.payload.sceneId : null;
        const characterIds = Array.isArray(task.payload.characterIds) ? task.payload.characterIds : [];
        await client.query('INSERT INTO video_assets (id, project_id, owner_id, storage_path, prompt, provider, duration_seconds, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [asset.id, task.projectId, task.ownerId, path, asset.prompt, asset.provider, Number(task.payload.durationSeconds ?? 0) || null, { url }]);
        await client.query(`INSERT INTO video_generations (id, owner_id, project_id, scene_id, job_id, provider, prompt, character_ids, status, progress, output_url, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',100,$9,$10)`, [asset.id, task.ownerId, task.projectId, sceneId, task.id, asset.provider, asset.prompt, characterIds, url, asset.metadata ?? {}]);
      } else if (asset.mimeType.startsWith('audio/')) {
        await client.query(`INSERT INTO audio_assets (id, project_id, owner_id, storage_path, kind, metadata) VALUES ($1,$2,$3,$4,'VOICE',$5)`, [asset.id, task.projectId, task.ownerId, path, { url, provider: asset.provider, prompt: asset.prompt }]);
        await client.query(`INSERT INTO audio_generations (id, owner_id, project_id, scene_id, job_id, provider, kind, language, text_content, storage_path, status, metadata) VALUES ($1,$2,$3,$4,$5,$6,'DIALOGUE',$7,$8,$9,'COMPLETED',$10)`, [asset.id, task.ownerId, task.projectId, typeof task.payload.sceneId === 'string' ? task.payload.sceneId : null, task.id, asset.provider, String(task.payload.language ?? ''), asset.prompt, path, asset.metadata ?? {}]);
      } else {
        await client.query('INSERT INTO image_assets (id, project_id, owner_id, storage_path, prompt, provider, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)', [asset.id, task.projectId, task.ownerId, path, asset.prompt, asset.provider, { url, demo: false }]);
      }
      const { rows } = await client.query<{ payload: StoryProject }>('SELECT payload FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE', [task.projectId, task.ownerId]);
      const project = rows[0]?.payload;
      if (project) {
        if (task.type === 'IMAGE_GENERATION' && typeof task.payload.shotId === 'string') {
          project.shots = (project.shots ?? []).map((shot) => shot.id === task.payload.shotId ? { ...shot, imageUrl: url, imageDemo: false } : shot);
          const shot = project.shots.find((item) => item.id === task.payload.shotId);
          if (shot) project.scenes = project.scenes.map((scene) => scene.id === shot.sceneId ? { ...scene, imageUrl: url, imageDemo: false } : scene);
        } else if (task.type === 'VIDEO_GENERATION' && typeof task.payload.sceneId === 'string') {
          project.scenes = project.scenes.map((scene) => scene.id === task.payload.sceneId ? { ...scene, videoUrl: url, videoDemo: false } : scene);
          if (typeof task.payload.shotId === 'string') project.shots = (project.shots ?? []).map((shot) => shot.id === task.payload.shotId ? { ...shot, videoUrl: url, videoDemo: false } : shot);
        } else if (task.type === 'CHARACTER_GENERATION' && typeof task.payload.character === 'object' && task.payload.character !== null) {
          const characterId = (task.payload.character as { id?: string }).id;
          project.characters = project.characters.map((character) => character.id === characterId ? { ...character, imageUrl: url } : character);
        } else if (task.type === 'LOCATION_GENERATION' && typeof task.payload.location === 'object' && task.payload.location !== null) {
          const locationId = (task.payload.location as { id?: string }).id;
          project.locations = project.locations.map((location) => location.id === locationId ? { ...location, imageUrl: url } : location);
        }
        await client.query('UPDATE projects SET payload=$3, updated_at=NOW() WHERE id=$1 AND owner_id=$2', [task.projectId, task.ownerId, project]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}