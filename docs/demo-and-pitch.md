# Demo and pitch

## Pitch

Synkro gives small teams a shared note that updates live, shows who is online, and keeps recoverable versions. It uses the proposal's JavaScript, React, Node.js, Socket.IO, and MongoDB Atlas stack, with a Vercel frontend and Render backend.

## Preparation

Use synthetic notes and two separate accounts in independent browser contexts. Verify deployment health, credentials, invite flow, and a prepopulated history. Keep a third nonmember account for access testing. Record cold-start behavior honestly and check connectivity before presenting. Do not put secrets or real private notes in screenshots.

## Suggested five-minute demonstration

| Time | Action | Evidence |
| --- | --- | --- |
| 0:00–0:30 | Explain duplicate-note/conflicting-copy problem | Clear use case and A04 alignment |
| 0:30–1:15 | Sign in, create room, join from second account | Authentication and rooms |
| 1:15–2:15 | Edit in each browser and point to presence/save status | Live sync and online participants |
| 2:15–3:00 | Refresh/sign in again and reopen note | Persistence |
| 3:00–3:45 | Preview earlier version and restore as owner | History and restore |
| 3:45–4:30 | Briefly disconnect/reconnect; test a nonmember | Recovery and access controls |
| 4:30–5:00 | Explain architecture, LWW limitation, and stretch roadmap | Technical understanding |

Show simultaneous edits only with an honest explanation: the core converges to the last server-processed snapshot and retains accepted history; it does not merge concurrent text. Demonstrate CRDT behavior only if S01 is implemented and tested.

## Submission checklist

- Working repository link and verified frontend URL.
- README that reflects implemented features and actual setup.
- Evidence for every core acceptance requirement.
- Deployment architecture and measured test results.
- Clear known limitations, especially concurrency and free-tier startup behavior.
- Stretch features labeled implemented, incomplete, or deferred.

The supplied proposal identifies the team and repository but does not define a pitch deadline, judging duration, or team ownership split. The timing above is a suggested rehearsal format.
