# Implementation plan

No milestones below are marked complete by this documentation task. Assign owners and estimates with the team; the proposal does not specify them.

| Milestone | Deliverables | Completion gate |
| --- | --- | --- |
| M0: scaffold | JavaScript React client, Node server, lockfiles, environment examples, lint scripts | Both apps start; build succeeds; no secrets committed. |
| M1: data and auth | Atlas connection/indexes, password hashing, sessions, registration/login/logout | Authentication and expiry tests pass; server restarts preserve sessions. |
| M2: rooms | Create/join/list, owner membership, invites, access checks | Two accounts share a room; a third cannot access it without joining. |
| M3: durable note service | Note/version transactions, operation IDs, LWW revisions | Failed writes leave no partial state; duplicate operations create one version. |
| M4: collaboration UI | Editor, authenticated socket joins, updates, presence, save states | Two sessions converge; double tabs show one presence member; disconnects handled. |
| M5: history and recovery | Paginated preview/restore, conflict handling, draft recovery, periodic sync | Restore broadcasts, stale restore rejects, lost acknowledgment and restart tests pass. |
| M6: release | Accessibility, security checks, Vercel/Render/Atlas deployment, demo | All core release cases pass on live deployment; README records actual status/URLs. |
| M7: optional stretch | CRDT, comments, viewer/editor roles in separate increments | Core suite remains green; each stretch feature meets its own requirements. |

## Dependency order

Agree on [data models](data-models.md), [HTTP](api-contract.md), and [realtime contracts](realtime-protocol.md) before implementing both sides. Build the transactional note service before the socket edit handler. Add recovery before claiming reliable saving. Deploy a minimal health endpoint and static client early to verify origins, Atlas connectivity, and build settings; complete the release checks later.

## Working agreements

Keep changes focused and reviewable. Implement shared authorization once. Add meaningful tests with each data/auth/transport milestone. Review updates to contracts alongside code, including both producer and consumer. Use seeded synthetic users/notes for tests and demos. Do not add unrelated libraries or stretch scope to unblock a core feature without recording why.

## Stretch sequencing

CRDT work first requires a design decision on library, state encoding, persistence, and migration from full snapshots. It must retain React, Node.js, Socket.IO, and Atlas. Comments require stable anchor semantics, so implement them after the editing model is settled. Viewer roles require server-side enforcement, active-socket revocation handling, and new authorization tests.

## Release evidence

Record the commit, package/runtime versions, date, deployment URLs, test results, measured latency, failure-recovery evidence, and known limitations. Application delivery is complete only after deployed acceptance checks, not after a local UI demo.
