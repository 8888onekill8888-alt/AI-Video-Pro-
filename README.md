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
python3 -m pip install -r requirements.txt
npm start
```

Set `GEMINI_API_KEY` to a Google AI Studio API key (the Gemini free tier is available subject to Google's quotas), and set `MONGO_URI` if database persistence is needed. Install the Python dependency with `python3 -m pip install -r requirements.txt` from `backend/`; gTTS uses Google's public text-to-speech service and requires outbound network access. `PYTHON_BIN` can override the Python executable. `GEMINI_MODEL` defaults to `gemini-2.5-flash`. `PUBLIC_BASE_URL` and comma-separated `DISCOVERY_URLS` advertise reachable API nodes. Restrict `CORS_ORIGINS` in deployments. Video uploads default to a 500 MB limit and processed files are served from `/outputs`.

`POST /api/video/generate` creates a Vietnamese screenplay and English scene image prompts with Gemini. Set `generateImages: true` to attach direct Pollinations AI image URLs to the scenes; images are generated when opened, without an API key. `POST /api/video/translate` accepts multipart fields `video` and `targetLanguage`, transcribes and translates with Gemini, synthesizes localized speech with gTTS, and replaces the source audio using FFmpeg. The included languages are Vietnamese, English, Spanish, French, Japanese, and Korean. This does not clone a person's voice or preserve the original dialogue/music mix. Gemini free-tier quotas, Pollinations availability/rate limits, and Google's gTTS service limits may change; none of these free services is guaranteed to be unlimited or always available. Add authentication, rate limiting, and managed object storage before exposing the API publicly.

## CI

`.github/workflows/build-apk.yml` tests the backend and runs `./gradlew assembleDebug` for native Android builds on pushes, pull requests to `main`, and manual dispatches. It publishes the automatically signed debug APK as the `ai-video-studio-final-app` artifact. The APK is uploaded at its actual build size; the workflow does not fabricate or pad a 200 MB binary.