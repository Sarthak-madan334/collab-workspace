# Deployment: Vercel, Render, and MongoDB Atlas

This is a deployment runbook for the current frontend and the planned backend. No service has been created or deployed. In the current checkout, `frontend/` contains the only `package.json`; there is no `server/` directory or backend package yet.

The frontend is React + Vite, not Next.js. The Vercel error “No Next.js version detected” means the Vercel project is using the wrong framework preset or root directory; do not install Next.js. Set the Vercel project settings below in the Vercel dashboard. They cannot be changed remotely from this repository.

## Hosting contract

| Component | Host | Configuration |
| --- | --- | --- |
| React frontend | Vercel | Root `frontend`, Vite preset, install `npm install`, build `npm run build`, output `dist` |
| Node.js + Socket.IO | Not in this checkout | Planned separate service; no server package can currently be deployed |
| Database | MongoDB Atlas | Planned for the backend; no database service is configured by this frontend repository |

When a backend is available, use its direct public origin for both HTTP and Socket.IO. Vercel serves only the client build; do not place database credentials or other server secrets in frontend build settings.

## 1. Prepare Atlas

Create the planned Atlas free-tier deployment if available and suitable for the selected region/account. Provision a dedicated database user scoped to `synkro_prod`, record its connection string as a Render secret, and configure Atlas network access for the actual Render outbound IP ranges. Add developer IPs only to development access as needed. Verify connectivity and transaction support before release. Atlas requires both valid database credentials and permitted network access; see [Atlas connection documentation](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

Initialize indexes and test a note/version transaction. Never store durable notes on the Render filesystem. Monitor storage because full snapshots accumulate rapidly.

## 2. Planned backend deployment

This step is not actionable from the current checkout because there is no `server/` package. Once implemented, deploy it as a separate Node service (for example, on Render) using its actual package scripts. The planned environment variables are `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_DB_NAME`, `SESSION_TTL_HOURS`, `LOG_LEVEL`, and `CLIENT_ORIGINS`.

The server must bind to `0.0.0.0` and Render's supplied `PORT`. HTTP and Socket.IO share this port. Configure `/health/ready` and retain one instance. See [Render web-service configuration](https://render.com/docs/web-services).

If the frontend domain is not known yet, deploy the backend with an empty browser-origin allowlist, then set the exact assigned Vercel origin before testing. Do not temporarily permit every origin.

Render supports WebSocket connections, but replacement instances close existing connections. The application must reconnect and resync after deploys; see [Render WebSockets](https://render.com/docs/websocket). A free Render web service can spin down after inactivity and take time to restart. Treat cold starts as a separate UX/test condition and review current plan limits before the demo; see [Render free services](https://render.com/docs/free).

## 3. Configure the Vercel frontend

In **Project Settings → Build and Deployment** configure:

- Root Directory: `frontend` (enable “Include source files outside of the Root Directory” only if Vercel requests it; the frontend builds independently)
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

In **Project Settings → Environment Variables**, add the public backend URLs for Production and for any Preview environment that has an approved backend:

```dotenv
VITE_API_BASE_URL=https://<backend>.onrender.com/api/v1
VITE_SOCKET_URL=https://<backend>.onrender.com
```

These are public build-time values. Rebuild after changing them. Without them, the production client now reports a clear configuration error rather than silently targeting `localhost`. The existing `frontend/vercel.json` SPA fallback lets direct navigation to React Router routes work:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The API remains on Render; it is not included in this frontend rewrite. Verify asset requests and deep links after deploy. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## 4. Connect origins and environments

Set Render `CLIENT_ORIGINS` to the exact Vercel production origin, redeploy as needed, and test HTTP preflight plus the Socket.IO handshake/upgrade. Use HTTPS URLs without trailing slashes. Socket.IO's configured path remains `/socket.io` on both sides.

Preview deployments need explicit origin approval and preferably a separate staging backend/database. Do not broadly allow all `*.vercel.app` origins or let untrusted previews access production data. Keep development, test, staging, and production credentials separate.

## 5. Release checklist

- Readiness succeeds; database indexes and transactions verified.
- Frontend direct routes load; API and socket URLs point to the correct environment.
- Two distinct authenticated users collaborate and see presence over WSS.
- Reload and backend redeploy preserve acknowledged notes/history.
- Restore creates a new revision and updates both browsers.
- Nonmembers, invalid origins, expired sessions, and invalid payloads are rejected.
- Logs and frontend assets contain no secrets or note bodies.
- Record deployment URLs, commit, plan/region, and acceptance results in the README/release record.

## Rollback

Redeploy the last known compatible backend and frontend commits. Check environment values before rollback and resync clients after the backend restart. Application rollback does not revert MongoDB data; schema changes must remain backward compatible or have a separately tested recovery plan. See [operations](operations.md).

Provider guidance was checked on 2026-10-09. Recheck account-specific plan availability and limits before deployment; no uptime or pricing guarantee is implied.
