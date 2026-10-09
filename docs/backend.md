# Backend specification

## Runtime

Use JavaScript on Node.js, Express for HTTP, Socket.IO for realtime, and the official MongoDB driver. Host one persistent Render web-service instance. Attach HTTP and Socket.IO to the same server, listen on `0.0.0.0`, and use `process.env.PORT` with local fallback `4000`.

Planned `server/src/` modules: `app.js`, `server.js`, `config/`, `routes/`, `middleware/`, `services/`, `repositories/`, `sockets/`, and `validation/`. Socket handlers and route controllers call shared services rather than duplicating permissions or persistence code.

## Services

| Service | Responsibilities |
| --- | --- |
| Auth | Registration, password verification, session issuance/revocation/expiry |
| Rooms | Atomic room creation, owner membership, invite redemption/rotation |
| Notes | Content validation, room mutation queue, transaction, idempotency |
| History | Paginated immutable versions, preview, owner-authorized restore |
| Presence | Room/user socket sets, deduplicated online users, membership checks |

Create the room, owner membership, empty note at revision 0, and initial version 0 in one transaction. Joining uses a unique membership index so repeated code redemption is harmless. Invite rotation and redemption must serialize per room and recheck the code within the mutation path.

## Request pipeline

Assign a request ID, enforce a request-size limit, check allowed origin, validate authentication, check room membership/ownership, validate a strict payload schema, call a service, and normalize the response. Never pass arbitrary client objects to database updates or trust a client-provided author/user ID.

Require authentication for all room resources and socket events. Revalidate session expiry and membership on each protected mutation. For socket expiry/revocation, disconnect affected session sockets and remove presence. An expiry timer handles otherwise idle sockets; a fresh event must still validate the session.

## Persistence and ordering

Each edit increments the current revision and stores a complete immutable version. Use a MongoDB transaction so neither current content nor history can commit alone. Enforce unique revision and operation indexes, retry transient transaction conflicts with bounded backoff, and return a retryable error when the budget is exhausted.

Use one bounded queue per active room shared by socket edits and HTTP restores. Release idle queues; reject overload with `RATE_LIMITED` or `SERVICE_UNAVAILABLE` rather than allowing unbounded memory growth. Driver transaction retries must not emit events inside the transaction callback. Broadcast only after a successful commit, including when an operation lookup discovers a committed retry.

Full-note snapshots are simple but expensive. The MVP keeps every committed version; monitor Atlas storage and limit payload/rate rather than silently pruning history. See [operations](operations.md) before adding retention.

## Presence

Track a set of socket IDs for each room/user. Add only after an authorized join, and remove on leave, disconnect, logout, or expiry. Publish the entire deduplicated presence list with a monotonic per-process presence sequence; a fresh join resets the client's presence baseline. Presence is not stored in MongoDB and is rebuilt after a restart.

## Health and shutdown

`GET /health/live` returns 200 if the process is running. `GET /health/ready` returns 200 only when database access and index initialization are ready, otherwise 503. Return a minimal body without infrastructure secrets.

At startup validate configuration, connect to Atlas, create/verify indexes, and enable readiness. On termination stop accepting writes, drain in-flight transactions within a bounded shutdown window, disconnect sockets, and close the database client. Clients recover through state sync rather than relying on delivery of a shutdown notice.

Log request ID, event type, room ID, outcome, latency, and revision where useful. Never log passwords, raw tokens, invite codes, connection strings, or note contents. See [security](security.md) and [operations](operations.md).
