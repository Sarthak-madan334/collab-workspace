# HTTP API contract

Planned base URL: `https://<backend>.onrender.com/api/v1`. JSON requests and responses. These routes are specifications, not existing endpoints.

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
