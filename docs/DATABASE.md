# Database

Apply `supabase/migrations/001_initial_schema.sql` to a PostgreSQL/Supabase database. IDs use UUIDs, durable entities have timestamps, project data uses ownership foreign keys, and mutable entities use soft deletion where appropriate.

The schema includes profiles/projects/stories/chunks, characters/aliases/locations/scenes/scene-character relations/shots/scripts, generic and typed assets, voice/audio/video generation records, dubbing/render jobs, subtitles/timeline, generation jobs/attempts, credits/transactions/usage, plans/subscriptions, translations, social connections, exports and notifications.

RLS policies protect user/project assets when Supabase Auth is available. API queries also include `owner_id` and project authorization checks; RLS is defense in depth, not a replacement for API checks. Provider OAuth tokens are represented as encrypted server-side fields and must be encrypted before persistence.

Set `DATABASE_URL` on the API and worker deployments. Never ship the database URL or service-role key to the mobile app.