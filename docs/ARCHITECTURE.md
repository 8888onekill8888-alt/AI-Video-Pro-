# Architecture

CINEFORGE is an npm workspace monorepo. Expo Router owns mobile navigation; the app stores drafts locally and uses the Fastify API for authenticated persistent projects, generation and billing operations. Shared TypeScript contracts live in `packages/shared`.

The API validates request schemas, verifies Supabase access tokens, enforces project ownership and reserves server-side credits before expensive operations. PostgreSQL is selected by `DATABASE_URL`; otherwise a memory repository is used only for local/demo runs. Storage uses a private Supabase bucket adapter or an explicitly temporary in-memory adapter.

Generation providers are interfaces in `packages/providers`. The API creates BullMQ jobs when Redis is configured. The worker performs image/video/TTS generation, dubbing and final FFmpeg assembly. Provider output includes a `demo` flag so simulated results cannot be confused with actual media.

The main production path is story analysis → script → character/location bibles → scenes/shots → media jobs → voice/dubbing → timeline → export. Character IDs and canonical descriptions are attached to scene generation jobs.

## Runtime boundaries

- Mobile contains only public API/Supabase configuration.
- Fastify contains authentication, authorization, validation, credits and provider selection.
- Worker contains provider calls that can take minutes, FFmpeg and private asset persistence.
- PostgreSQL and Supabase Storage own durable user/project assets; Redis owns transient asynchronous queue state.