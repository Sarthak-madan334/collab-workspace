# GitHub sign-in setup

Synkro uses GitHub's OAuth web authorization-code flow with a random `state` and S256 PKCE. The browser receives a short-lived code; the Render backend exchanges it using the GitHub client secret, reads the stable GitHub user ID and a verified email, and issues a normal Synkro session. Synkro requests only `user:email`, not repository access, and does not store the GitHub access token.

## 1. Register the GitHub OAuth app

1. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. An OAuth app is sufficient for sign-in; it does not need repository permissions.
2. Set **Application name** to `Synkro` and **Homepage URL** to your production frontend, for example `https://synkro3.vercel.app`.
3. Set **Authorization callback URL** to the exact frontend callback: `https://synkro3.vercel.app/auth/github/callback`. If users also access `https://collab-workspace-three.vercel.app`, add `https://collab-workspace-three.vercel.app/auth/github/callback` as another callback URL. Do not use the Render URL here.
4. Register the app. Copy its **Client ID**, then select **Generate a new client secret** and copy the secret. Keep the secret private; do not put it in Vercel or any `VITE_` variable.
5. For local testing, add `http://localhost:5173/auth/github/callback` as a callback URL too. Use the actual Vite port if it differs.

GitHub's [OAuth app creation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) and [web authorization flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) describe these settings.

## 2. Configure Render

Add these environment variables to the Synkro backend web service:

| Variable | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | The OAuth app's Client ID |
| `GITHUB_CLIENT_SECRET` | The generated client secret; save as a **Secret** |
| `CLIENT_ORIGINS` | Every frontend origin you use, comma-separated, with no paths or trailing slashes. Example: `https://synkro3.vercel.app,https://collab-workspace-three.vercel.app` |

Save and redeploy Render. Both GitHub variables must be set together. The backend returns `503 GITHUB_AUTH_UNAVAILABLE` until they are configured. Existing email and Google sign-in remain available.

## 3. Configure Vercel

In the frontend project's environment variables, add `VITE_GITHUB_CLIENT_ID` with the same Client ID. Choose **Config**, since this ID is public and Vite must bundle it into the browser. Apply it to Production and any Preview environment whose URL is registered as a GitHub callback, then redeploy Vercel. Do not add the GitHub client secret to Vercel.

For local development, add `VITE_GITHUB_CLIENT_ID=<Client ID>` to `frontend/.env.local` and restart Vite. Configure the same ID and secret on the local backend in `server/.env`.

## 4. Verify

1. Open a fresh browser tab at your production `/register` page and click **GitHub**.
2. GitHub should show `Synkro` requesting access to your email address. After approval, you should return to `/dashboard` with a Synkro session.
3. Sign out and repeat. The same GitHub account should return to the same Synkro user and rooms.
4. Try a second GitHub account. It must not see the first account's rooms.
5. If a password or Google account already has that email, Synkro returns `ACCOUNT_LINK_REQUIRED` instead of silently linking identities. Sign in using the original method; account linking is a separate feature.

The frontend checks the `state` and PKCE verifier from the same browser tab, removes the authorization code from the address bar immediately, and sends the code to the backend. The backend validates the request origin and exact callback URL before exchanging the code. GitHub sign-in in the bundled Android app remains unavailable; use the website for this flow.
