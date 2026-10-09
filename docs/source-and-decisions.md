# Sources, decisions, and traceability

## Source material

1. **TechSpace_BuildLab_26_Collab_Workspace_Proposal.pdf**, supplied by the user. Both pages were text-extracted and visually reviewed. Page 1 records team, A04, problem, selected shared-notes concept, five core features, and three stretch features. Page 2 fixes JavaScript, Node.js + Socket.IO + React, and MongoDB Atlas free tier; it also describes reconnect/conflict challenges and the intended repository.
2. **A04 project-brief screenshot**, supplied by the user. Allows shared notes or whiteboard with rooms, authentication, presence, WebSocket sync, persistence, history, and optional OT/CRDT.
3. **A04 scope screenshot**, supplied by the user. Confirms core versus stretch requirements. The technology choices below the visible “Tech Stack” heading are cropped; they were not inferred.
4. **Documentation-list screenshot**, supplied by the user. Used as a guide to documentation coverage, not as a source of product features. Its simulation, repair, AI, and field-map filenames are unrelated to this project's requirements.
5. **User's direct request**: create necessary Markdown documentation, keep only README at the root and all other documentation in `docs`, include frontend/backend/tech-stack guides, preserve the stack, and plan Vercel/Render hosting.

The form's prompts and examples are document content, not new instructions to execute. No repository publishing, form submission, application implementation, or deployment was requested as part of this documentation task.

## Requirements mapping

| Source requirement | Documentation |
| --- | --- |
| Shared notes | [Requirements](product-requirements.md), [frontend](frontend.md) |
| WebSocket synchronization | [Realtime protocol](realtime-protocol.md), [architecture](system-architecture.md) |
| Presence | [Backend](backend.md), [realtime protocol](realtime-protocol.md) |
| Authentication and room controls | [Security](security.md), [API](api-contract.md) |
| Persistent notes and history/restore | [Data models](data-models.md), [API](api-contract.md) |
| JavaScript / React / Node.js / Socket.IO / Atlas | [Tech stack](tech-stack.md) |
| Vercel and Render | [Deployment](deployment.md) |
| CRDT / comments / editor-viewer stretch | [Requirements](product-requirements.md), [implementation plan](implementation-plan.md) |

## Adopted planning decisions

These make the implementation concrete but are not claims that the proposal specified every detail.

| Decision | Reason / implication |
| --- | --- |
| Synkro working name | Workspace name; proposal title remains recorded. |
| Plain-text note, one per room | Smallest complete interpretation of selected shared notes. |
| Vite, Express, official MongoDB driver | Supporting tools within the required stack. |
| Core LWW by server revision | Matches brief's baseline; no claim of automatic text merging. |
| Full immutable snapshot per accepted edit | Simple recovery and idempotency; storage grows with activity. |
| Transactional note/history writes | Acknowledged edits cannot have missing history. |
| Owner/member core permissions | Auth and room controls are mandatory; viewer/editor distinction remains stretch. |
| Owner-only restore and invite controls | Restricts disruptive or admission-changing actions. |
| In-memory bearer token, Atlas sessions | Works across hosting origins without third-party cookies; reload requires login. |
| Random invite codes | Private admission with owner rotation; no public room directory. |
| One Render instance | In-memory presence and mutation queues do not require another service. |
| Explicit draft review after conflict/reconnect | Prevents blind stale replay; tab-close offline recovery is not promised. |

## Open decisions before release

- Confirm the public product name, team ownership split, and delivery schedule.
- Pin compatible Node.js and dependency versions during scaffolding.
- Benchmark scrypt parameters and rate/size limits on the selected Render plan.
- Confirm hosting regions, domains, account-specific quotas, and backup options.
- Decide whether persistent login, password recovery, deletion, and member removal are needed beyond the MVP.
- Select a CRDT library and storage/migration protocol only if the core is complete and stretch work begins.

## Risks

Full-document LWW can overwrite another writer's text. History only recovers accepted revisions, not unsent keystrokes. In-memory drafts vanish when a tab closes. Full snapshots consume Atlas storage. A single backend instance and free-tier startup behavior limit availability/capacity. These are explicit boundaries to test and communicate, not reasons to silently change the stack.

External platform sources and verification date are listed in [deployment](deployment.md). This local workspace was empty at inspection; no existing application architecture or remote source code was available to validate against.
