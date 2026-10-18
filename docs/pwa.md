# Install Synkro on iPhone and Android

Synkro's website is an installable Progressive Web App (PWA). The same deployed frontend runs on both platforms and connects to the existing Render API and Socket.IO server. No APK, IPA, Mac, or Apple Developer membership is needed for this installation method.

## iPhone or iPad

1. Open the deployed Synkro website in Safari.
2. Tap **Share** and **Add to Home Screen**. If shown, turn on **Open as Web App**.
3. Tap **Add**, then open **Synkro** from the Home Screen.

Apple's current instructions are at <https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios>.

## Android

1. Open the deployed Synkro website in Chrome.
2. Open Chrome's menu and choose **Install app** or **Add to Home screen**.
3. Confirm, then open **Synkro** from the launcher.

The existing Android APK remains a separate option. The PWA and APK connect to the same backend but have separate app storage and sign-in sessions.

## Behavior and limits

The PWA caches only its public interface files so it can open its shell without a network connection. It does **not** cache private notes, credentials, API responses, or collaboration messages. Sign-in, room data, edits, presence, and syncing require internet access and the Render backend. Keep a room open while an unsaved draft is waiting to reconnect. The website's current sign-in session is held in memory, so reopening an installed PWA may require signing in again.

The iPhone Home Screen app is a PWA, not an IPA. An IPA installed as a native app requires an Apple-signed iOS build. Without a Mac or Apple signing credentials, this PWA is the usable iPhone installation path.

## Deployment and verification

Vercel should build the `frontend` directory with `npm run build` and the public `VITE_API_BASE_URL` and `VITE_SOCKET_URL` environment variables. The production build generates `manifest.webmanifest` and `sw.js` from [the Vite configuration](../frontend/vite.config.js). The service worker is deliberately omitted from Capacitor Android builds.

After deployment, check that `https://<frontend-domain>/manifest.webmanifest`, `/sw.js`, and both icon URLs return files rather than the SPA HTML fallback. Install from Safari and Chrome, sign in, open a room, and confirm a second browser sees edits and presence. Reload a room route and reopen the installed app to check routing. Turn off internet briefly: the public app shell should open, but room operations must not appear to succeed offline.
