# CINEFORGE AI

CINEFORGE AI turns story ideas into editable film projects: analysis, screenplay, characters, scenes, storyboard, voice, localization and asynchronous video rendering.

## Architecture

- `apps/mobile`: Expo SDK 54, React Native, TypeScript and Expo Router for Android/iOS.
- `services/api`: Fastify API, Supabase Auth validation, ownership checks, credits, project persistence and job creation.
- `services/worker`: BullMQ consumer, dubbing pipeline and FFmpeg render pipeline.
- `packages/shared`: strict project, scene, character, job and billing contracts.
- `packages/providers`: replaceable text, image, video, TTS, transcription and music interfaces.
- `supabase/migrations`: PostgreSQL/Supabase schema and row-level ownership policies.

## Requirements

- Node.js 22 or newer and npm 10 or newer.
- PostgreSQL/Supabase and Redis for multi-user production jobs.
- FFmpeg and ffprobe on the worker host for video assembly/dubbing.
- Expo Go for local UI iteration, or EAS credentials for installable Android builds.

## Install and run

```sh
npm install
cp .env.example .env
npm run dev:api
npm run dev:mobile
```

Run the worker separately after configuring Redis:

```sh
npm run dev:worker
```

By default the API selects Demo providers when provider credentials/models are missing. It never reports a demo simulation as AI-generated media. Local-only projects remain editable; uploads and persistent generation require the configured API.

## Supabase

1. Create a Supabase project and run `supabase/migrations/001_initial_schema.sql`.
2. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` and a private `SUPABASE_STORAGE_BUCKET` on the server.
3. Configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only if the mobile client needs public Supabase SDK access. The current client sends authentication through the API.
4. Keep service-role and database credentials out of mobile builds.

## AI providers

Each provider is independent. Configure server-side `OPENAI_API_KEY` plus `OPENAI_MODEL` for analysis, screenplay, genre recommendations, translation and `OPENAI_TRANSCRIPTION_MODEL` for dubbing transcription. Configure `FAL_API_KEY`/`FAL_IMAGE_MODEL`, `RUNWAYML_API_SECRET`/`RUNWAY_MODEL`, or `REPLICATE_API_TOKEN`/`REPLICATE_VIDEO_MODEL` for images/video. Configure `ELEVENLABS_API_KEY` and a permitted voice ID/catalog for speech generation. Missing configuration is reported in Settings and uses clearly labeled Demo behavior.

## Production services

- Set `NODE_ENV=production`, Supabase Auth settings, `DATABASE_URL`, `REDIS_URL`, provider secrets, storage and CORS origin.
- Start `npm run start -w @storyflix/api` and `npm run start -w @storyflix/worker` as separate services.
- Install FFmpeg/ffprobe on the worker and set `FFMPEG_PATH`, `FFPROBE_PATH`; set `FFMPEG_4K_SUPPORTED=true` only after verifying the worker can render 4K.
- Publishing integrations remain disabled until the relevant official platform API approval and OAuth scopes are granted.
- Stripe checkout is unavailable until server-side Stripe credentials and a price are configured.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run mobile:check
```

## Android

For an internal preview APK:

```sh
npx eas-cli build --platform android --profile preview
```

For the production AAB:

```sh
npx eas-cli build --platform android --profile production
```

Set `EXPO_TOKEN` in CI/EAS secrets and complete the EAS project setup before remote builds. `.env.example` contains names only, never working credentials.