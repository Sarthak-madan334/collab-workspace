# Synkro

Synkro is a collaborative workspace where teams create shared rooms and work together on separate documents, notebooks, presentations, and spreadsheets. It keeps a team's ideas and files in one place.

## What it does

- Lets users sign in and create or join a room.
- Keeps a shared room note synchronized through Socket.IO.
- Shows which room members are online.
- Saves notes and their revision history in MongoDB Atlas.
- Lets room owners restore an earlier version.
- Lets users choose a file type before creating it. Each file has its own editor and invite code for collaborators.
- Provides document formatting and reading view, notebook pages, presentation slides with themes and speaker notes, and a spreadsheet grid with cell formatting.
- Shows collaborators' file changes in real time and lets users review edits to the same field before overwriting either version.
- Supports spreadsheet cell references, arithmetic, SUM, and AVERAGE.

The room note uses server-ordered last-write-wins updates with revision history. Shared files save at the document, notebook-page, slide-field, or sheet-cell level, so teammates can edit different parts at the same time. Editing the same part concurrently prompts a review before either change is overwritten.

## Technology

Synkro uses JavaScript across a React frontend and Node.js backend. Socket.IO handles live collaboration, and MongoDB Atlas stores users, rooms, notes, and revision history. The frontend is hosted on Vercel, with the persistent backend on Render.

The same React app is also packaged for Android with Capacitor. From `frontend`, run `npm ci` and `npm run android:sync`, then build the debug APK from `frontend/android` with `gradlew.bat assembleDebug` on Windows or `./gradlew assembleDebug` on macOS/Linux. Android Studio and an Android SDK are required; the complete Android setup, release signing, and testing guide is in [docs/android.md](docs/android.md).

The website can also be installed as one PWA on iPhone and Android. Installation and online/offline behavior are described in [docs/pwa.md](docs/pwa.md).

Synkro is being developed for TechSpace BuildLab '26 problem statement A04, Real-Time Collaborative Workspace.
