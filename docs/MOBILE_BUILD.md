# Mobile Build

The Android application uses Expo SDK 54, Expo Router and the EAS profiles in `apps/mobile/eas.json`.

```sh
npm install
npm run mobile:check
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

The preview profile produces an installable APK. Production creates an Android App Bundle (AAB). Configure an EAS project and Android signing credentials through Expo; set `EXPO_TOKEN` only in CI secrets. No Android keystore or signing credential belongs in this repository.

`EXPO_PUBLIC_API_URL` is compiled into the client and must point to the API HTTPS origin for production. Expo public variables are not secret storage.