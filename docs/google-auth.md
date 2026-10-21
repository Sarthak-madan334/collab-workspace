# Google sign-in setup

Synkro accepts a Google Identity Services ID token at `POST /api/v1/auth/google` and verifies it on the Render backend before issuing the same opaque Synkro session used by email/password sign-in. The backend does not accept a Google access token or trust a client-supplied email. The visible Google button is still disabled; a separate frontend integration must obtain the ID token and call this endpoint.

## 1. Create a Google web client

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Configure Google Auth Platform branding, audience, and test users as appropriate for your app. Use only the basic sign-in identity scopes; Synkro does not need access to Google Drive or other Google data.
3. Create an OAuth client with application type **Web application**. Record its client ID, ending in `.apps.googleusercontent.com`.
4. Add exact **Authorized JavaScript origins** for the frontend domains you use, for example `https://collab-workspace-three.vercel.app`, `https://synkro3.vercel.app`, and your local Vite origin such as `http://localhost:5173`. Do not include paths or trailing slashes. Add `http://localhost:5174` only if you use that port.
5. This integration receives a Google ID token in the browser and sends it to Render. It does not use a Google redirect callback, so **Authorized redirect URIs** are not needed for this flow.

Follow [Google's web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [server-side ID-token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## 2. Configure Render

On the Render web service, set `GOOGLE_CLIENT_ID` to that exact web client ID and redeploy. This is an optional backend setting: without it, the Google endpoint returns `503 GOOGLE_AUTH_UNAVAILABLE`, while email/password sign-in keeps working. Keep `MONGODB_URI` in Render's secret environment settings. The client ID is public, but provider private credentials must never be placed in `VITE_` variables. See [Render environment variables](https://render.com/docs/configure-environment-variables).

The backend checks Google's signature, issuer, expiry, audience, stable `sub`, and verified email through `google-auth-library`. A first-time Google identity creates a Synkro user with `googleSub` and a server-side session. Subsequent Google sign-ins use the same user. A password account with the same email returns `409 ACCOUNT_LINK_REQUIRED`; Synkro deliberately does not merge accounts based only on an email match. Account linking needs a separate authenticated flow.

## 3. Connect the frontend

The current Google button in `frontend/src/App.jsx` is disabled and marked **Coming soon**. To make it functional, integrate the official Google Identity Services client, use the web client ID to obtain its `credential` ID token, and send JSON `{ "credential": "<Google ID token>" }` to `POST https://collab-workspace-6b8e.onrender.com/api/v1/auth/google`. Treat the returned `{ user, token, expiresAt }` exactly like the existing `/auth/login` response. Add a public `VITE_GOOGLE_CLIENT_ID` to Vercel when implementing that frontend step, then redeploy the frontend. The backend must still verify every token; frontend configuration alone is insufficient.

Do not send a Google access token, raw profile fields, or a client secret to this endpoint. Do not log ID tokens. If using Google Identity Services' JavaScript callback, it does not require a redirect URI; choose one integration mode and configure Google Cloud for that mode.

## 4. Verify before release

- Backend readiness at `/health/ready` returns `{ "status": "ok" }`.
- A real Google credential with this client ID yields a Synkro session and works with `/api/v1/auth/me`.
- A token for another client ID, an expired/altered token, or an unverified email is rejected.
- The same Google account signs into the same Synkro user on repeat visits.
- An email/password account with the same email is not automatically linked.
- Two real browser accounts can still access only their authorized rooms.

Unit tests cover the account creation, repeat sign-in, collision, and rejection paths. The repository's MongoDB integration tests require `MONGODB_TEST_URI` pointing to an isolated transaction-capable test database.
