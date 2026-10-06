# AI Video Studio

Native Android starter and Node.js API for AI-assisted screenplay generation and video translation.

## Android

Open the repository in Android Studio or build with JDK 17 and Gradle 8.9:

```sh
gradle wrapper --gradle-version 8.9
./gradlew assembleDebug
```

By default, the Android emulator connects to `http://10.0.2.2:3000`. For a deployed backend, set `API_BASE_URL` in `~/.gradle/gradle.properties` or pass `-PAPI_BASE_URL=https://your-api.example` to the Gradle build. The app asks `/api/discovery` for additional configured service nodes.

Email account screens and Google/Facebook/Apple buttons are interface scaffolding only. Authentication requires a configured identity provider and backend. The timeline and visualizer are editing controls/UI scaffolding; this project does not yet render generated scenes into a finished movie.

## Backend

```sh
cd backend
cp .env.example .env
npm install
npm start
```

Set `OPENAI_API_KEY` and `MONGO_URI` in the backend environment. `PUBLIC_BASE_URL` and comma-separated `DISCOVERY_URLS` advertise reachable API nodes. Restrict `CORS_ORIGINS` in deployments. Video uploads default to a 500 MB limit and processed files are served from `/outputs`.

`POST /api/video/generate` creates a Vietnamese screenplay and English scene image prompts with `gpt-4o`. Set `generateImages: true` to generate DALL·E 3 stills for up to four scenes (each image call may incur OpenAI charges); it does not render a movie. `POST /api/video/translate` accepts multipart fields `video` and `targetLanguage`, transcribes with Whisper, translates with `gpt-4o`, generates standard localized TTS audio, and replaces the source audio using FFmpeg. It does not clone a person's voice or preserve the original dialogue/music mix. Add authentication, rate limiting, and managed object storage before exposing the API publicly.

## CI

`.github/workflows/build-apk.yml` tests the backend and runs `./gradlew assembleDebug` for native Android builds on pushes, pull requests to `main`, and manual dispatches. It publishes the automatically signed debug APK as the `ai-video-studio-final-app` artifact. The APK is uploaded at its actual build size; the workflow does not fabricate or pad a 200 MB binary.