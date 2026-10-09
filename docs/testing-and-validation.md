# Testing and validation

These are planned test cases, not results. Use isolated Atlas test data, separate browser contexts, and reproducible network conditions. Proposed tooling is listed in [tech stack](tech-stack.md).

## Core acceptance matrix

| Test | Requirements | Expected result |
| --- | --- | --- |
| Register/login/logout and invalid credentials | C01 | Correct session behavior, no sensitive fields returned, logout disconnects sockets. |
| Expiry with idle socket and new edit | C01 | Idle socket closes; protected events fail even before TTL record cleanup. |
| Create room and redeem invite twice | C02 | Exactly one owner membership/note/version 0 and one joining membership. |
| Unauthorized HTTP and socket requests | C02 | No note/history/presence disclosure or mutation. |
| Rotate invite | C02 | Old code fails; new code works; current members retain access. |
| Two users edit in turn | C03, C04 | Both display committed revisions without refresh; WebSocket transport verified. |
| Simultaneous edits from the same base | C03, C04 | Server revisions are ordered, final state converges, earlier accepted snapshot remains in history. |
| Two tabs for one user | C05 | One presence entry; closing one tab does not remove the user. |
| Abrupt network loss | C05, C08 | Presence eventually removes user within measured target; reconnect rebuilds state. |
| Reload and backend restart after save | C06 | Last acknowledged note and history remain in Atlas. |
| Force DB write/transaction failure | C06 | No saved acknowledgment, no partial note/history commit, draft preserved. |
| Browse multiple history pages and preview | C07 | Stable revision cursor, no duplicates/missing results, exact content. |
| Owner restore | C07 | New revision created; old history retained; peers update. |
| Member restore attempt | C02, C07 | Server rejects it even if HTTP is called directly. |
| Restore with stale expected revision | C07 | Conflict returned; no new version. |
| Disconnect with local typing | C08 | No blind queued replay; shared state fetched; draft offered for review. |

## Recovery and concurrency tests

- Drop an acknowledgment after a successful commit, resend the exact operation, and assert one history version.
- Reuse an operation ID with changed content or another user and assert `OPERATION_ID_REUSED` with no mutation.
- Kill the server after commit but before emit; reconnect/status lookup recovers the committed revision.
- Suppress a broadcast while the socket stays connected; periodic sync catches up.
- Deliver duplicate/out-of-order revisions; displayed canonical revision never decreases.
- Deliver an update during room join; buffered events applied after snapshot prevent a missed change.
- Type while an earlier operation awaits acknowledgment; acknowledgment does not erase later typing.
- Receive a remote edit or restore while dirty; local draft remains available and autosave pauses.
- Race normal edits with restore; check expected-revision semantics and immutable history.
- Force a transaction retry; no duplicate broadcast from inside the transaction callback.

## Security and UI tests

Check oversized text/events, malformed ObjectIds, unknown keys, NoSQL operator inputs, script-like note text, brute-force limits, unapproved origins, expired tokens, and guesses of another room/version ID. Inspect the production client bundle and logs for credentials. Confirm owner-only APIs are not protected solely by hidden buttons.

Test keyboard-only navigation, focus return, screen-reader status announcements, 360 px layout, connection error screens, empty history/dashboard states, and direct route reload. Mount/unmount the editor repeatedly to detect duplicate listeners and sockets.

## Performance and release checks

Measure the proposed 20-user envelope and p95 synchronization latency on a warm Render instance; report network conditions, sample count, note sizes, and measurement boundaries. Record cold-start time separately. Test repeated 100 KiB notes to understand full-snapshot memory/storage costs without exhausting a shared database.

After deployment verify HTTPS/WSS, allowed origins, Atlas access, health checks, direct room URLs, two-browser collaboration, refresh persistence, history restore, and recovery after a Render redeploy. Never substitute local test success for deployed acceptance.

## Result record template

```text
Commit / deployment:
Date and tester:
Environment / browser / Node version:
Case IDs and outcome:
Latency samples / p95 / note size:
Failure reproduction and evidence:
Known limitations:
Release decision:
```

No application tests can run until the code and manifests exist. Documentation verification checks file placement, local links, stack consistency, and contract agreement separately.
