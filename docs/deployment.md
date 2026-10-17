# Deployment: Vercel, Render, and MongoDB Atlas

This is the deployment runbook for the implemented application. No service has been created or deployed. Settings assume the `frontend/` and `server/` layout in [local development](local-development.md). The local development UI can show sample rooms without a backend; a production build cannot use that mode.

## Provisioning order

1. Create the Vercel project and note its stable production URL (or configure the final custom domain). Its first build may wait until the backend URL is known.
2. Create the Atlas cluster, production database user, and network access for Render's outbound ranges.
3. Create the Render service with the exact Vercel origin in `CLIENT_ORIGINS`; note the Render URL.
4. Add the Render URLs to the Vercel production environment and deploy or redeploy the frontend.
5. Run the two-user release checks below before inviting users.

## Hosting contract

| Component | Host | Configuration |
| --- | --- | --- |
| React frontend | Vercel | Root `frontend`, Vite preset, build `npm run build`, output `dist` |
| Node.js + Socket.IO | Render web service | Root `server`, build `npm ci`, start `npm start`, health `/health/ready` |
| Database | MongoDB Atlas | Separate production database and scoped application user |

Use the backend's direct public origin for both HTTP and Socket.IO. This architecture keeps the persistent realtime server on Render as requested. Vercel serves the client build; do not place application API credentials in frontend build settings.

## 1. Prepare Atlas

Create an Atlas cluster in a suitable region. Provision a dedicated database user with `readWrite` on `synkro_prod`, record its connection string as a Render secret, and configure Atlas network access for the actual Render outbound IP ranges shown in Render's **Connect → Outbound** tab. Do not expose the URI to Vercel or use `0.0.0.0/0` as the long-term access rule. Add developer IPs only to development access as needed. Verify connectivity and transaction support before release. Atlas requires both valid database credentials and permitted network access; see [Atlas connection documentation](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/) and [Render outbound IP guidance](https://render.com/docs/outbound-ip-addresses).

Initialize indexes and test a note/version transaction. Never store durable notes on the Render filesystem. Monitor storage because full snapshots accumulate rapidly: each edit stores a full revision, and a single note can be as large as 5 MiB. Atlas's free shared tier has a 0.5 GB storage limit, including indexes, so choose a paid tier or enforce usage limits before broad public access. See [Atlas free-tier limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

## 2. Deploy Render backend

Connect the intended Git repository and select `main`. Use a Node web service, root `server`, `npm ci`, and `npm start`; no transpilation build is required. Pin a tested Node version with Render's `NODE_VERSION` setting. Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME=synkro_prod`, `SESSION_TTL_HOURS=8`, `LOG_LEVEL=info`, and the exact frontend origin in `CLIENT_ORIGINS`. Keep `MONGODB_URI` only in Render secret settings and URL-encode special characters in its password.

The server must bind to `0.0.0.0` and Render's supplied `PORT`. HTTP and Socket.IO share this port. Set `TRUST_PROXY_HOPS=1` for correct IP-based rate limiting behind Render's proxy. Configure `/health/ready` and retain one instance. See [Render web-service configuration](https://render.com/docs/web-services).

The backend requires at least one exact HTTPS browser origin at startup. Use the intended production domain, then update `CLIENT_ORIGINS` to the assigned Vercel origin before browser testing. Do not temporarily permit every origin.

Render supports WebSocket connections, but replacement instances close existing connections. The application must reconnect and resync after deploys; see [Render WebSockets](https://render.com/docs/websocket). A free Render web service spins down after inactivity and has cold starts, so use a paid always-on plan for real users; see [Render free services](https://render.com/docs/free).

## 3. Deploy Vercel frontend

Import the repository, select root `frontend`, choose Vite, and use build `npm run build` with output `dist`. Set:

```dotenv
VITE_API_BASE_URL=https://<backend>.onrender.com/api/v1
VITE_SOCKET_URL=https://<backend>.onrender.com
```

These are public build-time values. The production build fails if either is missing or malformed, so set both before the first successful frontend deployment. Rebuild after changing them. The `frontend/vercel.json` SPA fallback lets direct navigation to React Router routes work:

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
- Account registration and sign-in work against Atlas; a browser refresh currently requires signing in again because the session token is kept only in memory.
- Decide whether email verification, password reset, abuse reporting, backups, and storage/room quotas are required for the intended public launch. They are not implemented by the current application.
- Record deployment URLs, commit, plan/region, and acceptance results in a release record.

## Rollback

Redeploy the last known compatible backend and frontend commits. Check environment values before rollback and resync clients after the backend restart. Application rollback does not revert MongoDB data; schema changes must remain backward compatible or have a separately tested recovery plan. See [operations](operations.md).

Provider guidance was checked on 2026-10-17. Recheck account-specific plan availability and limits before deployment; no uptime or pricing guarantee is implied.
