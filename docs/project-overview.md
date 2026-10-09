# Project overview

## Identity

| Item | Value |
| --- | --- |
| Working name | Synkro |
| Proposal title | Real-Time Collaborative Workspace |
| Event / statement | TechSpace BuildLab '26 / A04 |
| Track / category | Advanced, squad of 3–4 / Web and Systems |
| Team | Power Puff Girls |

The proposal identifies Piyush Aggarwal, Alie Sharma, and Tanisha Malik as first-year BTech CSE AIML students, and Sarthak Madan as a first-year BTech CSE Core student. Assignments within the team are not specified.

## Problem and audience

Small teams need a single shared note instead of separate copies. Delayed updates make it difficult to know what changed, who is participating, and how to recover previous work. The initial audience is students collaborating on meeting notes, project planning, and study sessions.

## Primary journey

1. Register or sign in.
2. Create a private room or join using a shared invite code.
3. Open its note and see online members.
4. Edit while other members see accepted updates.
5. Observe a saved status after persistence succeeds.
6. Leave and return to the persisted note.
7. Inspect an earlier revision and restore it as a new revision.

## Product boundary

Build shared notes, which is the option explicitly selected in the proposal. A whiteboard is permitted by the A04 brief but is not selected here. The MVP has one plain-text note per room, owner/member access, and a history panel. Rich text, multiple documents per room, attachments, chat, video calls, AI features, and offline-first editing are outside core scope.

CRDT editing, anchored comments, and editor/viewer roles are stretch features from the proposal. They must not delay core delivery or be presented as already implemented.

## Success

Two authenticated users can collaborate across separate browser sessions on the deployed site, observe presence, reopen durable content after a backend restart, and restore a revision. Unauthorized users cannot read or mutate a room. Under simultaneous edits the core converges to the server's latest revision, with the limitations of last-write-wins explained and demonstrated.

Performance thresholds and capacity targets in [requirements](product-requirements.md) are proposed engineering targets, not promises from the original proposal.
