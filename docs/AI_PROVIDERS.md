# AI Providers

Provider interfaces cover text, images, video, TTS, transcription/dubbing and music. `createProviders` selects each live adapter independently; unset or incomplete credentials select a Demo adapter and provider state is exposed at `/v1/config`.

| Capability | Adapter | Required server settings |
| --- | --- | --- |
| Analysis, screenplay, translation, genre | OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Audio transcription | OpenAI audio API | `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL` |
| Image generation | fal.ai | `FAL_API_KEY`, `FAL_IMAGE_MODEL` |
| Video generation | Runway | `RUNWAYML_API_SECRET`, `RUNWAY_MODEL` |
| Alternate video adapter | Replicate | `REPLICATE_API_TOKEN`, `REPLICATE_VIDEO_MODEL` |
| Speech generation | ElevenLabs | `ELEVENLABS_API_KEY`, approved voice ID/catalog |

Provider model names are configured server-side. Secrets must never use the Expo `EXPO_PUBLIC_` prefix. Demo image references are labeled samples; Demo TTS is silent audio; Demo video jobs do not return playable video. No music is bundled or claimed to be licensed.

External adapter availability, quotas, allowed duration, model versions and commercial rights must be verified against the provider account before production use.