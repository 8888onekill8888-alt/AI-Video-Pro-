import { randomUUID } from 'node:crypto';

export interface StoredObject {
  path: string;
  url: string;
  mimeType: string;
  size: number;
  demo: boolean;
}

export interface StorageScope {
  projectId?: string;
  category?: 'assets' | 'scenes' | 'audio' | 'renders' | 'scripts' | 'subtitles';
}

export interface StorageProvider {
  readonly name: string;
  readonly demo: boolean;
  upload(ownerId: string, filename: string, contentType: string, bytes: Buffer, scope?: StorageScope): Promise<StoredObject>;
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>;
  remove(path: string): Promise<void>;
}

export class MemoryStorageProvider implements StorageProvider {
  readonly name = 'Demo memory storage';
  readonly demo = true;
  private readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async upload(ownerId: string, filename: string, contentType: string, bytes: Buffer, scope: StorageScope = {}): Promise<StoredObject> {
    const safeName = filename.replace(/[^\w.-]+/g, '-').slice(-120) || 'upload';
    const project = scope.projectId ? `${scope.projectId}/` : '';
    const category = scope.category ?? 'assets';
    const path = `${ownerId}/${project}${category}/${randomUUID()}/${safeName}`;
    this.objects.set(path, { bytes: Buffer.from(bytes), contentType });
    return { path, url: `demo-storage://${path}`, mimeType: contentType, size: bytes.length, demo: true };
  }

  async signedUrl(path: string): Promise<string> {
    if (!this.objects.has(path)) throw new Error('Stored object not found');
    return `demo-storage://${path}?signature=local`;
  }

  async remove(path: string): Promise<void> { this.objects.delete(path); }
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'Supabase Storage';
  readonly demo = false;
  private readonly endpoint: string;
  private readonly bucket: string;

  constructor(baseUrl: string, private readonly serviceRoleKey: string, bucket = 'cineforge-assets') {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/storage/v1`;
    this.bucket = bucket;
  }

  async upload(ownerId: string, filename: string, contentType: string, bytes: Buffer, scope: StorageScope = {}): Promise<StoredObject> {
    const safeName = filename.replace(/[^\w.-]+/g, '-').slice(-120) || 'upload';
    const project = scope.projectId ? `${scope.projectId}/` : '';
    const category = scope.category ?? 'assets';
    const path = `${ownerId}/${project}${category}/${randomUUID()}/${safeName}`;
    const response = await fetch(`${this.endpoint}/object/${encodeURIComponent(this.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.serviceRoleKey}`, apikey: this.serviceRoleKey, 'Content-Type': contentType, 'x-upsert': 'false' },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
    const url = await this.signedUrl(path);
    return { path, url, mimeType: contentType, size: bytes.length, demo: false };
  }

  async signedUrl(path: string, expiresInSeconds = 3_600): Promise<string> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${this.endpoint}/object/sign/${encodeURIComponent(this.bucket)}/${encodedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.serviceRoleKey}`, apikey: this.serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: Math.max(60, Math.min(86_400, expiresInSeconds)) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Storage signing failed (${response.status})`);
    const result = await response.json() as { signedURL?: string };
    if (!result.signedURL) throw new Error('Storage did not return a signed URL');
    return result.signedURL.startsWith('http') ? result.signedURL : `${this.endpoint}${result.signedURL}`;
  }

  async remove(path: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.serviceRoleKey}`, apikey: this.serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Storage removal failed (${response.status})`);
  }
}

export function createStorageProvider(env: Record<string, string | undefined> = process.env): StorageProvider {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return new SupabaseStorageProvider(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_STORAGE_BUCKET);
  return new MemoryStorageProvider();
}