# Product requirements

## Core requirements

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| C01 | Authentication | Register, sign in, inspect current session, and sign out; invalid credentials fail without disclosing account existence. |
| C02 | Rooms and access | A user creates a room or joins with an invite code; a nonmember cannot fetch notes, history, presence, or send edits. |
| C03 | Shared notes | Every room has one editable plain-text note; accepted content is displayed consistently to its connected members. |
| C04 | WebSocket synchronization | Two independent sessions exchange committed revisions through Socket.IO without a page refresh. |
| C05 | Presence | Authenticated users joined to the room appear once per user, even with multiple tabs; disconnecting the last tab removes them after disconnect detection. |
| C06 | Persistence | Acknowledged edits survive reload and backend restart; a failed database write never produces a saved indicator. |
| C07 | History and restore | Members browse saved revisions and preview their contents; the owner can restore one as a new revision visible to all clients. |
| C08 | Reconnection | Rejoining fetches current content and membership; an unsent local draft is preserved for review and never replayed over newer content automatically. |
| C09 | File version history | Documents, presentations, spreadsheets, and notebooks retain saved snapshots; members can preview history and the room owner can restore a snapshot as a new revision. |
| C10 | Contribution map | Members agree on area ownership and see server-derived saved edits by document, sheet, slide, or notebook page without presenting activity as a performance score. |

C01–C07 implement the proposal’s core features. C08 makes its reconnect-learning goal and consistency risk concrete. C09–C10 extend the workspace with recoverable file versions and agreed ownership visibility. Owner-only restore, invite codes, and plain text are documented implementation decisions.

## Permissions

| Action | Unauthenticated | Authenticated nonmember | Member | Owner |
| --- | --- | --- | --- | --- |
| Create room / redeem invite | No | Yes | Yes | Yes |
| Read room, note, history, presence | No | No | Yes | Yes |
| Edit note | No | No | Yes | Yes |
| Read or rotate room invite | No | No | No | Yes |
| Restore version | No | No | No | Yes |
| Read file history and contribution map | No | No | Yes | Yes |
| Assign file area | No | No | Yes | Yes |
| Restore file version | No | No | No | Yes |

The owner is also a member. Member removal, ownership transfer, room deletion, and viewer roles are not MVP APIs. Rotating an invite prevents new joins using the old code; it does not revoke existing memberships.

## Proposed limits and quality targets

- Up to 20 online users per room for the initial measured test; this is a test envelope, not proven capacity.
- Note content: at most 5 MiB (5,242,880 bytes) of UTF-8 text; room names: 1–80 characters; display names: 1–50 characters.
- Editor debounce: 500 ms; at most one edit request in flight per client. Retain later typing as a separate pending draft.
- On a warm service, target p95 under 1 second from server receipt to remote display for 20 users on the documented test network. Measure typing debounce separately.
- Target presence removal within 45 seconds after abrupt disconnection, subject to configured heartbeat timing and network conditions.
- All production traffic uses HTTPS/WSS. No user-supplied HTML is rendered as trusted markup.
- Responsive operation at 360 px width and desktop widths, keyboard access, visible focus, and text equivalents for status colors.
- No acknowledged revision may disappear because the server restarts. Unsent drafts are not guaranteed to survive closing a tab in the core release.

## Stretch and exclusions

| ID | Stretch feature | Completion criterion |
| --- | --- | --- |
| S01 | CRDT collaboration | Concurrent edits merge under a separately specified protocol; persisted state and reconnect tests pass. |
| S02 | Comments on selected text | Comment anchors have defined behavior after edits; access follows room membership. |
| S03 | Editor/viewer roles | Server rejects viewer mutations over both HTTP and Socket.IO; role changes affect active connections. |

No simulation engine, repair optimization, AI integration, or field-map subsystem is required; those filenames in the reference screenshot describe a different project.

## Completion gate

All core acceptance cases in [testing](testing-and-validation.md) pass against the deployed Vercel/Render/Atlas environment. The README must then be updated with actual setup commands, implementation status, verified live URLs, and known limitations. Documentation alone does not satisfy the application completion gate.
# Collaborative files: history and FairShare contribution map

Every document, presentation, spreadsheet, and notebook keeps recoverable snapshots for each saved revision. A room owner can inspect a prior snapshot and restore it; restoration is recorded as a new revision, preserving the current and prior work.

Each file also has an opt-in contribution map. Teammates can agree who owns the document, spreadsheet, an individual slide, or a notebook page. The map shows saved edits by area and contributor so teams can see what has been covered and where ownership is still open. Counts represent saved activity only and must not be presented as a measure of quality, effort, or performance.

The first implementation uses whole-document and whole-sheet areas, individual slides and notebook pages, room membership checks, owner-only restore, and server-derived operation counts. Earlier edits made before file history was enabled cannot be reconstructed; opening history on such a file records its current state as the available baseline.
