# Local development

## Current state

The React frontend is under `frontend/` and the Node.js backend is under `server/`. The backend requires a reachable MongoDB Atlas database with transaction support. The browser's demo account remains local-only; register distinct accounts to test server-backed collaboration.

## Repository layout

```text
Synkro/
  README.md
  docs/
  frontend/
    package.json
    package-lock.json
    .env.example
    vercel.json
    src/
  server/
    package.json
    package-lock.json
    .env.example
    src/
    test/
  .gitignore
```

Use independent npm packages for the frontend and server so Vercel and Render can use their own root directory. No root workspace tooling is required.

## Prerequisites and configuration

Install Git and Node.js 22.18 or newer. Create a development Atlas database, a scoped database user, and an IP access-list entry for your machine. Use an Atlas deployment that supports transactions; integration tests must use a replica-set-capable database, not a standalone local MongoDB process.

`frontend/.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000
```

`server/.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/
MONGODB_DB_NAME=synkro_dev
CLIENT_ORIGINS=http://localhost:5173
SESSION_TTL_HOURS=8
LOG_LEVEL=info
TRUST_PROXY_HOPS=0
```

| Variable | Visibility / rules |
| --- | --- |
| `VITE_API_BASE_URL` | Public; full API prefix with no trailing slash |
| `VITE_SOCKET_URL` | Public; backend origin, no `/api/v1` or `/socket.io` suffix |
| `MONGODB_URI` | Server secret; URI-encode reserved password characters |
| `MONGODB_DB_NAME` | Explicit isolated database name |
| `CLIENT_ORIGINS` | Comma-separated exact origins without paths/trailing slashes |
| `SESSION_TTL_HOURS` | Positive bounded integer; default 8 |
| `PORT` | Local 4000; respect Render's supplied production value |
| `NODE_ENV`, `LOG_LEVEL` | Runtime behavior and logging level |
| `TRUST_PROXY_HOPS` | Trusted proxy count for IP-based rate limiting; `0` locally, `1` behind Render's proxy |

The server must load its development environment file explicitly and validate configuration at startup. Copy examples to ignored local `.env` files only after they exist. Never paste real credentials into the example files or docs.

## Run locally

Copy `server/.env.example` to `server/.env`, then set a real `MONGODB_URI` and development `MONGODB_DB_NAME`. Keep `.env` out of Git. In one terminal:

```powershell
cd server
npm ci
npm run dev
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

The frontend runs Vite on port 5173. The server runs HTTP and Socket.IO on port 4000. `npm test` in `server/` runs unit and HTTP pipeline tests. `npm run test:integration` runs the full MongoDB/API/socket test only when `MONGODB_TEST_URI` points to a transaction-capable isolated test cluster; otherwise it is explicitly skipped.

Use `npm ci` in each package. Both lockfiles are committed.

## First smoke test

For a UI-only preview, run the frontend and use the local demo credentials shown on the sign-in screen. The demo needs no backend and writes sample workspace data to the current browser's local storage.

Check `/health/ready`, register two distinct test users, create and join a room, confirm two-way edits and presence, reload/sign in again, and restore a revision. Never point automated cleanup at the production database. Test startup must reject database names that do not clearly identify a test environment.
