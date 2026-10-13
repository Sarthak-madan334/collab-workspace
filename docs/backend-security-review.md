# Backend security and integration review

Reviewed on 2026-10-13 against the repository's HTTP and realtime contracts. This is a code and local test review, not a deployment penetration test.

## Findings fixed

| Finding | Risk | Change |
| --- | --- | --- |
| An uncertain MongoDB commit retried the whole transaction. | A room creation could commit, then return an error after a duplicate-key retry. | Retry commit on the same session; retry the full transaction only for transient transaction errors. |
| Registration wrote the user before creating a session. | A failed session insert could leave an unusable new account. | Create the user and initial session in one MongoDB transaction. |
| Database failure during Socket.IO authentication was reported as invalid credentials. | A temporary outage could sign users out unnecessarily. | Preserve `SERVICE_UNAVAILABLE` and `RATE_LIMITED` handshake errors; the frontend signs out only for `UNAUTHENTICATED`. |
| Socket connections and read/join events had no practical bound. | One account could retain excessive sockets and repeatedly load room state. | Cap sockets per user and globally, rooms per socket, and handshake/join/sync/status rates. |
| A rejected Engine.IO upgrade was briefly passed an `Error` object during hardening. | The transport expected a string and could terminate the process on a forbidden origin. | Send string rejection reasons and assert the server stays live after a blocked origin. |
| API responses containing bearer tokens and private notes had no explicit no-store policy. | Browser or intermediary caching could retain private responses. | Add `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` to API responses. |
| Rate-limit state could grow with arbitrary distinct keys. | A high-cardinality traffic pattern could consume unbounded memory. | Bound active limiter keys and reject overload. |
| Session-expiry event could be lost to an immediate transport close. | A client might remain on a reconnecting screen with an expired token. | Allow the expiry packet to flush briefly before disconnect and handle authentication failure on reconnect. |
| Shutdown could close the database while an accepted socket handler was still starting. | An in-flight edit could fail after shutdown had reported drained work. | Reject new HTTP/socket work, close transports, then drain active socket handlers and the room queue before closing MongoDB. |
| Frontend runtime dependencies used `latest` ranges. | A fresh install could resolve unreviewed versions instead of the tested set. | Pin the current dependency versions in the frontend manifest and lockfile. |
| History and idempotency lookups fetched full note bodies unnecessarily. | A metadata-only history page could transfer hundreds of MiB from MongoDB after the 5 MiB note limit. | Project only required fields for history, operation-status, and duplicate-operation lookups. |
| Invite redemption checked the code before writing membership. | A rotation on another server instance could commit between that check and membership insertion. | Redeem the code with a conditional room write in the membership transaction, so rotation and redemption conflict and retry in a defined order. |
| Socket events authenticated before any in-flight work cap. | A single connected client could queue many database reads and hold many event payloads concurrently. | Cap pending events at eight per socket and 256 per process before authentication. |
| A socket could disconnect while an asynchronous room join was pending. | Presence could retain a user whose disconnect handler had already run. | Recheck connection after joining and before adding presence. |

## Validation performed

- Twelve unit and HTTP/socket tests pass, including unauthorized origin, nonmember room access, two-tab presence, socket and in-flight event caps, disconnect during join, token revocation, transaction retry semantics, response cache headers, byte-budget enforcement, and metadata-only history reads.
- A local single-node MongoDB replica set ran the end-to-end HTTP/Socket.IO test: account creation, atomic initial room state, invite redemption and rotation, a controlled cross-service rotation/redemption race, two-user edits, idempotent retry, conflicting operation reuse, stale-base ordering, history pagination after a 5 MiB edit, owner-only restore, oversized note rejection, idle session expiry, and logout disconnect. The test database was dropped afterward.
- `npm audit` reports zero known advisories for the server and frontend lockfiles at review time. This does not prove the absence of vulnerabilities.
- The frontend production build and `git diff --check` pass.

## Release checks still required

- Repeat the integration test against the intended isolated Atlas environment by setting `MONGODB_TEST_URI` and running `npm run test:integration` in `server/`.
- Test the deployed Vercel/Render pair over HTTPS/WSS, including proxy IP behavior, idle expiry, cold starts, and reconnect after a Render restart.
- Measure memory, Atlas storage growth, and p95 synchronization latency under the planned 20-user workload. In-memory presence and room ordering require a single backend instance.
