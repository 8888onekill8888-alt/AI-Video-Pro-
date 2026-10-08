CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  auth_provider text NOT NULL DEFAULT 'supabase',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'en',
  plan_id text NOT NULL DEFAULT 'FREE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  story text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ANALYZED', 'IN_PRODUCTION', 'COMPLETED', 'ARCHIVED')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_text text NOT NULL,
  language text NOT NULL DEFAULT 'English',
  extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chapter text,
  content text NOT NULL,
  token_estimate integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  role text,
  canon jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_prompt text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  variant text NOT NULL DEFAULT 'portrait',
  provider text NOT NULL DEFAULT 'demo',
  prompt text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  canon jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_prompt text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  variant text NOT NULL DEFAULT 'exterior',
  provider text NOT NULL DEFAULT 'demo',
  prompt text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 5,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_number)
);

CREATE TABLE IF NOT EXISTS shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  shot_number integer NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 5,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, shot_number)
);

CREATE TABLE IF NOT EXISTS scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  language text NOT NULL DEFAULT 'English',
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'demo',
  provider_voice_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text,
  kind text NOT NULL CHECK (kind IN ('VOICE', 'NARRATION', 'MUSIC', 'SFX', 'AMBIENCE')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text,
  prompt text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'demo',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text,
  prompt text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'demo',
  duration_seconds integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text,
  prompt text NOT NULL DEFAULT '',
  license text NOT NULL DEFAULT 'user-provided-or-original',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language text NOT NULL,
  format text NOT NULL CHECK (format IN ('SRT', 'VTT', 'BURNED_IN')),
  style text NOT NULL DEFAULT 'Cinema',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_type text NOT NULL CHECK (track_type IN ('VIDEO', 'VOICE', 'MUSIC', 'SFX', 'SUBTITLES')),
  sort_order integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES timeline_tracks(id) ON DELETE CASCADE,
  asset_id uuid,
  start_seconds numeric(12,3) NOT NULL DEFAULT 0,
  end_seconds numeric(12,3) NOT NULL DEFAULT 0,
  trim_in numeric(12,3) NOT NULL DEFAULT 0,
  trim_out numeric(12,3) NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  provider text,
  status text NOT NULL,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES plans(id),
  provider text NOT NULL DEFAULT 'manual',
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credits (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  plan_id text NOT NULL DEFAULT 'FREE',
  period_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('TEXT', 'IMAGE', 'VIDEO', 'TTS', 'TRANSLATION', 'UPSCALE', 'RENDER')),
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  operation text NOT NULL,
  units numeric(12,3) NOT NULL DEFAULT 1,
  credits_used bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text,
  encrypted_access_token bytea,
  encrypted_refresh_token bytea,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'connected',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  storage_path text,
  format text NOT NULL DEFAULT 'mp4',
  resolution text NOT NULL DEFAULT '720p',
  preset text NOT NULL DEFAULT 'youtube',
  status text NOT NULL DEFAULT 'QUEUED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('IMAGE', 'VIDEO', 'AUDIO', 'SCRIPT', 'SUBTITLE', 'RENDER', 'DOCUMENT')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text GENERATED ALWAYS AS (lower(trim(alias))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, normalized_alias)
);

CREATE TABLE IF NOT EXISTS scene_characters (
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'PRESENT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scene_id, character_id)
);

CREATE TABLE IF NOT EXISTS video_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  prompt text NOT NULL,
  character_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  output_url text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audio_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DIALOGUE', 'NARRATION', 'DUBBING', 'MUSIC', 'SFX')),
  language text,
  text_content text NOT NULL DEFAULT '',
  storage_path text,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dubbing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  source_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  source_language text NOT NULL,
  target_language text NOT NULL,
  voice_id text,
  speed numeric(4,2) NOT NULL DEFAULT 1 CHECK (speed BETWEEN 0.5 AND 2),
  subtitles_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  output_video_path text,
  subtitle_path text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  preset text NOT NULL DEFAULT 'youtube',
  aspect_ratio text NOT NULL DEFAULT '16:9',
  resolution text NOT NULL DEFAULT '720p',
  fps integer NOT NULL DEFAULT 24 CHECK (fps IN (24, 25, 30, 60)),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'GENERATING_SCENES', 'GENERATING_AUDIO', 'ASSEMBLING', 'RENDERING', 'FINALIZING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  output_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('STORY', 'SCRIPT', 'DIALOGUE', 'NARRATION', 'SUBTITLE')),
  entity_id uuid,
  source_language text NOT NULL,
  target_language text NOT NULL,
  original_content jsonb NOT NULL,
  translated_content jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('YOUTUBE', 'TIKTOK', 'FACEBOOK', 'INSTAGRAM')),
  provider_account_id text,
  encrypted_access_token bytea,
  encrypted_refresh_token bytea,
  scopes text[] NOT NULL DEFAULT '{}',
  approval_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  connected_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS projects_owner_updated_idx ON projects(owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stories_project_idx ON stories(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS story_chunks_project_idx ON story_chunks(project_id, chunk_index);
CREATE INDEX IF NOT EXISTS characters_project_idx ON characters(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS locations_project_idx ON locations(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS scenes_project_order_idx ON scenes(project_id, scene_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS shots_scene_order_idx ON shots(scene_id, shot_number);
CREATE INDEX IF NOT EXISTS generation_jobs_owner_status_idx ON generation_jobs(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_project_idx ON generation_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_operation_idx ON usage_events(user_id, operation, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS exports_project_idx ON exports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_project_kind_idx ON assets(project_id, kind, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS character_aliases_character_idx ON character_aliases(character_id);
CREATE INDEX IF NOT EXISTS scene_characters_character_idx ON scene_characters(character_id, scene_id);
CREATE INDEX IF NOT EXISTS video_generations_project_status_idx ON video_generations(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS audio_generations_project_status_idx ON audio_generations(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS dubbing_jobs_owner_status_idx ON dubbing_jobs(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_project_status_idx ON render_jobs(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS translations_project_language_idx ON translations(project_id, target_language, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','profiles','projects','stories','story_chunks','characters','character_images','locations','location_images','scenes','shots','scripts','voices','audio_assets','image_assets','video_assets','music_assets','subtitles','timeline_tracks','timeline_items','generation_jobs','generation_attempts','plans','subscriptions','credits','credit_transactions','usage_events','connected_accounts','exports','notifications','assets','character_aliases','scene_characters','video_generations','audio_generations','dubbing_jobs','render_jobs','translations','social_connections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', table_name);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
  END LOOP;
END;
$$;

INSERT INTO plans (id, name, limits) VALUES
  ('FREE', 'Free', '{"projects":3,"imagesPerMonth":10,"videosPerMonth":3,"ttsMinutesPerMonth":30,"maxResolution":"720p","watermark":true,"creditsMonthly":200}'),
  ('PRO', 'Pro', '{"projects":100,"imagesPerMonth":500,"videosPerMonth":100,"ttsMinutesPerMonth":600,"maxResolution":"1080p","watermark":false,"creditsMonthly":10000}')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE character_aliases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE scene_characters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audio_generations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE dubbing_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS profiles_owner ON profiles';
    EXECUTE 'CREATE POLICY profiles_owner ON profiles USING (id = auth.uid()) WITH CHECK (id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS projects_owner ON projects';
    EXECUTE 'CREATE POLICY projects_owner ON projects USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS assets_owner ON assets';
    EXECUTE 'CREATE POLICY assets_owner ON assets USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS scenes_owner ON scenes';
    EXECUTE 'CREATE POLICY scenes_owner ON scenes USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = scenes.project_id AND p.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = scenes.project_id AND p.owner_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS shots_owner ON shots';
    EXECUTE 'CREATE POLICY shots_owner ON shots USING (EXISTS (SELECT 1 FROM scenes s JOIN projects p ON p.id = s.project_id WHERE s.id = shots.scene_id AND p.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM scenes s JOIN projects p ON p.id = s.project_id WHERE s.id = shots.scene_id AND p.owner_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS characters_owner ON characters';
    EXECUTE 'CREATE POLICY characters_owner ON characters USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = characters.project_id AND p.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = characters.project_id AND p.owner_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS character_aliases_owner ON character_aliases';
    EXECUTE 'CREATE POLICY character_aliases_owner ON character_aliases USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = character_aliases.project_id AND p.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = character_aliases.project_id AND p.owner_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS scene_characters_owner ON scene_characters';
    EXECUTE 'CREATE POLICY scene_characters_owner ON scene_characters USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = scene_characters.project_id AND p.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = scene_characters.project_id AND p.owner_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS video_generations_owner ON video_generations';
    EXECUTE 'CREATE POLICY video_generations_owner ON video_generations USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS audio_generations_owner ON audio_generations';
    EXECUTE 'CREATE POLICY audio_generations_owner ON audio_generations USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS dubbing_jobs_owner ON dubbing_jobs';
    EXECUTE 'CREATE POLICY dubbing_jobs_owner ON dubbing_jobs USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS render_jobs_owner ON render_jobs';
    EXECUTE 'CREATE POLICY render_jobs_owner ON render_jobs USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS translations_owner ON translations';
    EXECUTE 'CREATE POLICY translations_owner ON translations USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS social_connections_owner ON social_connections';
    EXECUTE 'CREATE POLICY social_connections_owner ON social_connections USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END;
$$;