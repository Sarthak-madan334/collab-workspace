# Socket.IO protocol

## Connection

Connect to `VITE_SOCKET_URL` at Socket.IO path `/socket.io`, with `auth: {token}`. Use the Socket.IO client, not a raw WebSocket client. Allow its compatible polling/upgrade transport behavior; verify an actual WebSocket upgrade during acceptance testing. Authenticate the handshake, validate origin, and enforce authorization on every event.

All client events use acknowledgments: success `{ok:true,data:...}` or failure `{ok:false,error:{code,message}}`. Proposed acknowledgment timeout: 5 seconds; timeout means the result is unknown, not necessarily failed. The token is never placed in a query string.

## Client events

| Event | Payload | Acknowledgment data |
| --- | --- | --- |
| `room:join` | `{roomId}` | `{note,presence,presenceSequence}` after member check and subscription |
| `room:leave` | `{roomId}` | `{roomId}` after removing subscription |
| `note:update` | `{roomId,operationId,baseRevision,content}` | `{appliedRevision,note}` after durable commit |
| `note:sync` | `{roomId}` | `{note,presence,presenceSequence}` for current joined member |
| `note:status` | `{roomId,operationId}` | `{committed,appliedRevision,note}`; appliedRevision is null if not committed |

`note:status` only discloses an operation owned by the authenticated user and always checks room membership. `note:update` also requires the socket to have joined the specified room. The browser creates a fresh UUID operation ID for each submitted snapshot, retaining it for retries of that exact payload.

## Server events

| Event | Payload | Meaning |
| --- | --- | --- |
| `note:updated` | `{roomId,operationId,kind,note}` | Canonical state after committed edit or restore; includes sender |
| `presence:updated` | `{roomId,users:[{id,name}],presenceSequence}` | Complete deduplicated online-member list |
| `session:expired` | `{code:"UNAUTHENTICATED"}` | Session expired/revoked; disconnect follows |

The canonical note shape is defined in [API contract](api-contract.md). Ignore events for an inactive room. Install snapshots before buffered events, then apply note revisions strictly monotonically. Presence sequence is per process and resets on a new join baseline; a sync response replaces the baseline.

## Ordering and conflict rule

The server's per-room queue defines processing order. The database revision is the durable source of ordering. Never order edits by browser time. A transaction writes both note and immutable history before an acknowledgment or broadcast.

`baseRevision` records which revision the user edited; core LWW accepts a stale base rather than merging it. A base greater than the server's current revision is invalid. If Alice and Bob submit different full notes based on revision 4, the first processed write becomes 5 and the second becomes 6. Everyone converges to 6; version 5 remains recoverable. Do not claim lossless concurrent typing.

For an already committed operation, validate matching actor/request hash and return its original `appliedRevision` plus the latest note. Do not create another version. A reused ID with different fields returns `OPERATION_ID_REUSED`. Retried operations must not resend an older snapshot as if it were a new event.

## Reconnection and missed messages

1. Pause edit submission and retain the draft/in-flight snapshot in browser memory on disconnect.
2. Reauthenticate and rejoin after reconnect; never assume prior room membership on the socket survived.
3. Install the latest note and presence baseline, respecting local dirty draft handling.
4. Query `note:status` for any operation whose acknowledgment was lost.
5. If committed, mark that snapshot acknowledged without erasing later typing. If uncommitted, show the latest shared note and let the user choose whether to retry or discard the preserved draft.
6. While connected, call `note:sync` every 15 seconds and on focus to recover a commit whose broadcast was missed.

Do not emit edits while disconnected or automatically flush a stale offline queue. Retry network operations with bounded exponential backoff and jitter; recheck session expiry before reconnecting. Session failures require login rather than infinite reconnect attempts.

## Restore and presence races

Restore shares the edit queue and checks `expectedRevision`. If an edit wins before restore, restore returns `REVISION_CONFLICT`; if restore wins first, a later normal edit may still overwrite it under LWW. Preserve both committed versions and show remote-change review to dirty clients.

Presence represents connected room subscriptions, not all registered room members. Two tabs count as one user until the last leaves. Socket.IO disconnect detection removes dead sockets; no history version is created for presence. Restart clears the in-memory map and reconnects rebuild it.
