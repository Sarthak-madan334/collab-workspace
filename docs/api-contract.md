# HTTP API contract

Base URL: `https://<backend>.onrender.com/api/v1` in production and `http://localhost:4000/api/v1` locally. The routes below are implemented in `server/src/app.js` and backed by MongoDB Atlas.

Success envelope: `{ "data": ... }`. Error envelope: `{ "error": { "code": "FORBIDDEN", "message": "Access denied", "requestId": "..." } }`. Protected routes use `Authorization: Bearer <token>`. API timestamps are ISO 8601 UTC strings.

## Authentication

| Method / path | Input | Success |
| --- | --- | --- |
| POST `/auth/register` | `{name,email,password}` | 201, `{user,token,expiresAt}` |
| POST `/auth/login` | `{email,password}` | 200, `{user,token,expiresAt}` |
| GET `/auth/me` | Bearer token | 200, `{user,expiresAt}` |
| POST `/auth/logout` | Bearer token | 200, `{loggedOut:true}`; revoke current session and disconnect its sockets |

Public user shape is `{id,name}`; `/auth/me` may additionally return that user's email. Never return password fields or session hashes. Registration validation failures use 422; duplicate registration uses generic `REGISTRATION_FAILED` without account details. Failed login uses 401 `INVALID_CREDENTIALS`.

## Rooms and notes

| Method / path | Input | Success and permission |
| --- | --- | --- |
| GET `/rooms` | `limit` default 20/max 100, optional opaque `cursor` | 200, `{items,nextCursor}`; own memberships only; stable `(joinedAt,id)` ordering |
| POST `/rooms` | `{name}` | 201, `{room,inviteCode}`; authenticated creator becomes owner |
| POST `/rooms/join` | `{inviteCode}` | 200, `{room}`; repeat membership join is idempotent |
| GET `/rooms/:roomId` | None | 200, `{room}`; member only |
| GET `/rooms/:roomId/invite` | None | 200, `{inviteCode}`; owner only |
| POST `/rooms/:roomId/invite/rotate` | None | 200, `{inviteCode}`; owner only; old invite stops admitting new members |
| GET `/rooms/:roomId/note` | None | 200, `{note}`; member only |

Room shape: `{id,name,ownerId,createdAt}`. Note shape: `{roomId,content,revision,updatedBy,updatedAt}`. `updatedBy` is a user ID. Do not embed invite codes in general room or dashboard responses. There is no REST edit endpoint in core; Socket.IO owns normal edits.

## History

| Method / path | Input | Success |
| --- | --- | --- |
| GET `/rooms/:roomId/versions` | `limit` default 20/max 100, optional `beforeRevision` | 200, `{items,nextBeforeRevision}` |
| GET `/rooms/:roomId/versions/:revision` | None | 200, `{version}` including content |
| POST `/rooms/:roomId/versions/:revision/restore` | `{operationId,expectedRevision}` | 200, `{appliedRevision,note}` |

History items: `{revision,authorId,authorName,kind,createdAt,restoredFromRevision}`. Resolve author names from user records with a fallback label if unavailable. Restore requires owner access, reads only a version in the target room, and broadcasts `note:updated` after commit. `appliedRevision` identifies the restored operation; `note` is the latest canonical snapshot at response time and may have a later revision on retry.

## Collaborative files

| Method / path | Input | Success and permission |
| --- | --- | --- |
| GET `/rooms/:roomId/files/:fileId/history` | `limit` default 20/max 100, optional `beforeRevision` | 200, metadata-only snapshots; room member |
| GET `/rooms/:roomId/files/:fileId/history/:revision` | None | 200, `{version}` including file content; room member |
| POST `/rooms/:roomId/files/:fileId/history/:revision/restore` | `{operationId,expectedRevision}` | 200, `{file}`; room owner only |
| POST `/rooms/:roomId/files/:fileId/run` | `{language,source,stdin}` | 200, compiler status and bounded output; authenticated room member, code files only; five runs per user/minute |
| GET `/rooms/:roomId/files/:fileId/contributions` | None | 200, current areas, member list, and saved edit counts; room member |
| POST `/rooms/:roomId/files/:fileId/assignments` | `{areaId,assigneeId}` (`assigneeId:null` clears) | 200, updated contribution map; room member |

File versions snapshot document, slide, spreadsheet, notebook, or code state per committed revision. Restores are append-only and preserve the selected snapshot as a new revision. The contribution map supports one document, spreadsheet, or code area and per-slide/per-notebook-page ownership; saved edits are derived from the server operation log. File history opened on an older file with no snapshot backfills only its current state, since earlier snapshots cannot be reconstructed retroactively. Code workspaces keep separate Python and C++ sources and use the authenticated backend's isolated runner; see [Code workspaces](code-workspaces.md).

## Errors

| HTTP | Code examples | Client behavior |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_ID` | Fix malformed payload/identifier |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | Sign in again when appropriate |
| 403 | `FORBIDDEN` | Stop protected action |
| 404 | `NOT_FOUND`, `INVALID_INVITE` | Show unavailable resource or invite |
| 409 | `REVISION_CONFLICT`, `OPERATION_ID_REUSED` | Fetch current state; never blindly repeat with altered content |
| 413 | `PAYLOAD_TOO_LARGE` | Reduce note size |
| 422 | `VALIDATION_FAILED`, `REGISTRATION_FAILED` | Show safe field/general feedback |
| 429 | `RATE_LIMITED` | Honor `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | Keep draft; retry with backoff |

For room reads, return a uniform 404 for missing rooms and nonmember access to reduce enumeration. A known member trying an owner-only operation receives 403. Validate unknown fields and reject operator-shaped objects. Bound pagination and never return an entire history unpaginated.

`/health/live` and `/health/ready` are outside `/api/v1`, unauthenticated, with `{status:"ok"}` or `{status:"unavailable"}`. See [backend lifecycle](backend.md).
