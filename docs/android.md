# Synkro for Android

The Android app packages the existing React/Vite frontend in Capacitor. It uses the same Render API and Socket.IO server as the website. The web deployment remains a separate Vite build and is not served from the APK.

## Requirements

- Node.js 22 or newer, npm, and Android Studio 2025.2.1 or newer.
- Android SDK Platform 36, Build Tools 36, and Platform Tools. Android Studio installs a suitable JDK; use JDK 21 when building from a terminal or CI.
- Android 7.0 (API 24) or newer device with a current Android System WebView. Enable USB debugging for `adb install`.
- The deployed Render backend must include the server change that allows the Android bundle's exact `https://localhost` origin. This is **the origin of local files inside Capacitor**, not a development server. The app still authenticates every private API and Socket.IO call with a server-issued bearer token.

## Configure the backend

The committed `frontend/.env.android` contains only public Render URLs. If the backend moves, update both `VITE_API_BASE_URL` and `VITE_SOCKET_URL` there; they must use HTTPS and the same origin. The API URL must end in `/api/v1`. No credentials belong in this file.

The backend's `CLIENT_ORIGINS` still lists the exact Vercel web origins. The server code separately permits the fixed Android origin `https://localhost`. Deploy that server commit to Render before testing the APK. A healthy server responds at `https://collab-workspace-6b8e.onrender.com/health/ready` with `{ "status": "ok" }`.

## Build a debug APK

From the repository root:

```text
cd frontend
npm ci
npm test
npm run android:sync
```

`android:sync` runs the production-style Android Vite build and `cap sync android`. It copies the built assets into the native project. The APK loads these bundled assets and **does not need localhost, Vite, or Vercel at runtime**. After every frontend or Capacitor plugin change, run it again before rebuilding the APK.

On Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

On macOS/Linux:

```sh
cd android
./gradlew assembleDebug
```

The output is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r` followed by that path, or open `frontend/android` in Android Studio (`npm run android:open` from `frontend`) and run it on a device or emulator. The [Android debug APK workflow](../.github/workflows/android-apk.yml) also builds an installable artifact on every change to `main` affecting Android and can be run manually in GitHub Actions.

If Gradle reports a missing SDK, configure the SDK path in Android Studio or set `ANDROID_HOME` to the SDK directory. If it reports a missing JDK, configure Gradle JDK in Android Studio or set `JAVA_HOME` to a suitable JDK. Neither Android Studio nor an SDK is currently required to run the website.

## Signed release APK

Use Android Studio's **Build → Generate Signed App Bundle / APK → APK** flow, choose `release`, and create or select a keystore stored **outside this repository**. Keep the keystore, alias, passwords, and backup copies private; losing the signing key prevents future updates to that package. Verify the release variant uses the same bundled web assets by running `npm run android:sync` first. Android Studio writes the signed APK under `frontend/android/app/release` or the chosen destination. Increment `versionCode` and `versionName` in `frontend/android/app/build.gradle` before publishing an update.

The repository ignores keystores and APK outputs. Do not put signing passwords in Gradle files, shell history, `.env.android`, or GitHub Actions logs.

## Device verification

1. Install the APK and launch it with the device online. The splash and launcher icon should show the Synkro mark, and no local development server should be running.
2. Register or sign in, create a room, join another room by code, edit notes, inspect history, and invite a teammate. Close and reopen the app before the server's session expiry; the session should restore. After expiry or sign-out it should return to sign-in.
3. Open one room on Android and another device or the website. Confirm edits and presence appear both ways. Background and resume the Android app; it should rejoin and sync.
4. Toggle airplane mode, check the offline banner, then reconnect and tap **Retry**. Confirm the room reconnects. Full offline collaboration is not supported; keep the page open while unsaved edits are waiting.
5. Check the Android Back button in a room, a history drawer, and a dialog. Open the keyboard on login and in the editor, and test portrait widths around 320, 360, 393, and 412 CSS pixels without clipped controls or horizontal scrolling.
6. Open the repository link. It should open outside the app's WebView. Inspect the system status and navigation bars on both the dark landing/auth pages and the light signed-in workspace.

The debug APK is signed with a development key. Use a private release keystore for distribution. The app stores a short-lived bearer session in Android app-private Preferences so it survives process restarts; Android backup is disabled. This is not encrypted storage, so do not extend token lifetime without revisiting the storage design.
