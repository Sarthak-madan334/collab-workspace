# Local development

## Current state

The checkout contains documentation only. The following structure, environment examples, and commands become executable after the scaffold milestone. They are specifications for the future project; this task has not installed packages or created secrets.

## Planned layout

```text
Synkro/
  README.md
  docs/
  client/
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
    scripts/
    test/
  .gitignore
```

Use independent npm packages for client and server so both hosting providers can use their own root directory. No root workspace tooling is required.

## Prerequisites and configuration

Install Git and the same supported Node.js LTS major chosen during scaffolding. Create a development Atlas database, a scoped database user, and an IP access-list entry for your machine. Use an Atlas deployment that supports the transactions required by the write contract; integration tests must use a replica-set-capable database, not a standalone local MongoDB process.

Planned `client/.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000
```

Planned `server/.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/
MONGODB_DB_NAME=synkro_dev
CLIENT_ORIGINS=http://localhost:5173
SESSION_TTL_HOURS=8
LOG_LEVEL=info
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

The server must load its development environment file explicitly and validate configuration at startup. Copy examples to ignored local `.env` files only after they exist. Never paste real credentials into the example files or docs.

## Planned commands

In one terminal, after server implementation:

```powershell
cd server
npm ci
npm run dev
```

In another terminal, after client implementation:

```powershell
cd client
npm ci
npm run dev
```

Client script contract: `dev` starts Vite on port 5173 (strict port), `build` produces `dist`, `preview` previews the build, `test` runs frontend tests once, and `test:e2e` runs Playwright. Server script contract: `dev` starts the development watcher, `start` runs `src/server.js`, `test` runs unit tests, and `test:integration` runs transaction/API/socket tests against an isolated test database. Both packages should provide `lint`.

On initial scaffold use `npm install` to generate each lockfile; use `npm ci` thereafter. Exact package versions and scripts must be committed and checked before calling this setup runnable.

## First smoke test

Check `/health/ready`, register two distinct test users, create and join a room, confirm two-way edits and presence, reload/sign in again, and restore a revision. Never point automated cleanup at the production database. Test startup must reject database names that do not clearly identify a test environment.
