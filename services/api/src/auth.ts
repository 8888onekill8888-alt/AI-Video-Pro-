export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'user' | 'admin';
  demo: boolean;
}

export class AuthenticationError extends Error {
  readonly statusCode = 401;
  constructor(message = 'A valid sign-in is required') { super(message); }
}

export function assertProductionAuthConfigured(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== 'production') return;
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DATABASE_URL', 'REDIS_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Production requires server configuration: ${missing.join(', ')}`);
  }
}

export async function authenticate(authorization: string | undefined, env: Record<string, string | undefined>): Promise<AuthenticatedUser> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    if (env.NODE_ENV === 'production') throw new AuthenticationError('Authentication is not configured');
    if (authorization) throw new AuthenticationError('Supabase authentication is not configured for this server');
    return { id: 'demo-user', email: 'filmmaker@cineforge.demo', role: 'user', demo: true };
  }

  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AuthenticationError();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new AuthenticationError();
  const user = await response.json() as { id?: string; email?: string; app_metadata?: { role?: string }; user_metadata?: Record<string, unknown> };
  if (!user.id) throw new AuthenticationError();
  const administrators = (env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  const role = user.app_metadata?.role === 'admin' || Boolean(user.email && administrators.includes(user.email.toLowerCase())) ? 'admin' : 'user';
  return { id: user.id, email: user.email, role, demo: false };
}

export async function forwardSupabaseAuth(path: string, body: Record<string, unknown>, env: Record<string, string | undefined>, accessToken?: string) {
  const baseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error('Configure Supabase Auth to use account sign-in');
  const headers: Record<string, string> = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.msg === 'string' ? data.msg : typeof data.message === 'string' ? data.message : 'Authentication request failed';
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return data;
}

const OAUTH_PROVIDERS = new Set(['google', 'github', 'facebook', 'apple', 'tiktok']);

export function createSupabaseOAuthUrl(provider: string, env: Record<string, string | undefined>): string {
  if (!OAUTH_PROVIDERS.has(provider)) throw Object.assign(new Error('Unsupported OAuth provider'), { statusCode: 400 });
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw Object.assign(new Error('Configure Supabase Auth before starting OAuth'), { statusCode: 503 });
  const callback = env.SUPABASE_OAUTH_REDIRECT_URL ?? 'cineforge://auth/callback';
  const url = new URL('/auth/v1/authorize', env.SUPABASE_URL);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', callback);
  url.searchParams.set('apikey', env.SUPABASE_ANON_KEY);
  return url.toString();
}