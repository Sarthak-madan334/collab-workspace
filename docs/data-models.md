# Data models

Use MongoDB Atlas with separate collections. API IDs are strings; validate and convert ObjectIds at the boundary. Store timestamps as server-generated UTC dates and revisions as nonnegative safe integers.

## Collections

| Collection | Fields |
| --- | --- |
| `users` | `_id`, `name`, `emailNormalized`, `passwordHash`, `passwordSalt`, `passwordParams`, `createdAt`, `updatedAt` |
| `sessions` | `_id`, `userId`, `tokenHash`, `createdAt`, `expiresAt`, `revokedAt` nullable |
| `rooms` | `_id`, `name`, `ownerId`, `inviteCode`, `createdAt`, `updatedAt` |
| `memberships` | `_id`, `roomId`, `userId`, `joinedAt` |
| `notes` | `_id`, `roomId`, `content`, `revision`, `updatedBy`, `updatedAt` |
| `versions` | `_id`, `roomId`, `revision`, `content`, `authorId`, `operationId`, `requestHash`, `baseRevision`, `kind`, `restoredFromRevision` nullable, `createdAt` |

`kind` is `initial`, `edit`, or `restore`. Revision 0 is the empty initial version with a server-generated operation ID. `requestHash` hashes a canonical representation of the operation's kind and submitted fields; it detects reuse of an operation ID with different content. For restore, include source revision and expected current revision in that hash.

Invite codes are random 128-bit values encoded as URL-safe strings. The MVP stores them as retrievable bearer invitations so an owner can display/share the current code. Treat database access and log redaction accordingly; only owner endpoints return them. They are distinct from room IDs and session tokens.

## Indexes

| Collection | Index | Purpose |
| --- | --- | --- |
| users | Unique `emailNormalized` | Prevent duplicate accounts |
| sessions | Unique `tokenHash`; TTL `expiresAt` with expiry 0 | Token lookup and eventual cleanup |
| sessions | `userId` | Session management |
| rooms | Unique `inviteCode`; `ownerId` | Invite lookup, owned rooms |
| memberships | Unique `(roomId, userId)`; `(userId, joinedAt)` | Authorization and dashboard |
| notes | Unique `roomId` | Exactly one note per room |
| versions | Unique `(roomId, revision)` | Ordered immutable history |
| versions | Unique `(roomId, operationId)` | Idempotent edits/restores |

The room/revision index also supports descending history reads. TTL cleanup is not immediate: validate `expiresAt` on every session use regardless of whether the row still exists.

## Invariants

1. Every room has an owner membership, note, and initial version.
2. Current note revision and content equal the latest committed version.
3. Every committed operation advances revision exactly once.
4. A repeated operation ID with the same actor and request returns its original result; mismatched reuse fails with `OPERATION_ID_REUSED`.
5. Restored content creates a new version with a link to its source revision.
6. Author and owner identities come from the authenticated server context.
7. Membership is checked against the target room for every read and mutation; knowing a version ID does not grant access.

For a normal edit, read current note inside a transaction, increment revision, update note, and insert a version. A concurrent transaction conflict restarts the read/write attempt. For restore, verify the expected revision inside the transaction; on mismatch return `REVISION_CONFLICT` without modifying anything. Check committed operation identity before a restore's expected-revision check so a retry succeeds even after later edits.

## History response and retention

List metadata without full content, newest first, default 20 and maximum 100 results. Use a `beforeRevision` cursor, excluding that revision. A separate version endpoint returns content on demand. Keep all revisions in the MVP; snapshot-per-edit storage grows quickly and needs monitoring. Never describe history as an independent backup.

## Migration discipline

Keep schema/index migration scripts versioned under the planned `server/scripts/`. Validate existing documents before creating unique indexes. Test changes against a separate Atlas database and make compatible changes before deploying dependent code. CRDT storage, role fields, and comments require explicit future migrations.
