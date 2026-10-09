# Tech stack

## Required by the supplied proposal

| Technology | Responsibility | Constraint |
| --- | --- | --- |
| JavaScript | Browser and server source | Use `.js` / `.jsx`; TypeScript migration is outside this plan. |
| React | Client UI and editor state | Keep the client a React application. |
| Node.js | HTTP and realtime application server | Run a persistent process on Render. |
| Socket.IO | Rooms, events, acknowledgments, presence | Use matching compatible server/client releases. |
| MongoDB Atlas | Users, rooms, notes, version history | Atlas free tier is the proposal's storage plan. |

Hosting was added explicitly by the user: **Vercel for the frontend and Render for the backend**. Atlas remains the database.

## Supporting implementation choices

These are proposed additions within the selected stack, not technologies named by the proposal. Pin compatible stable versions and commit package lockfiles when scaffolding; no dependency versions have been installed or tested yet.

| Choice | Purpose |
| --- | --- |
| Vite and npm | React development/build tooling and dependency management |
| React Router | Login, dashboard, and room routes |
| Plain CSS / CSS modules | Styling without requiring another UI framework |
| Express | HTTP routing and middleware within Node.js |
| Official MongoDB Node.js driver | Queries, indexes, and transactions; no ORM required |
| Node.js `crypto` | Password derivation, random session/invite tokens, token hashing |
| Native `fetch` | Browser HTTP requests |
| Vitest and React Testing Library | Client behavior tests |
| Node.js test runner | Server unit/integration tests |
| Playwright | Multi-session browser and deployment tests |

Use one supported Node.js LTS major compatible with the chosen tooling, pinned consistently in local development, CI, and Render. Record the exact major and package versions after scaffolding rather than assuming an unverified version here.

## Deliberate boundaries

Do not replace the stack with Next.js, Firebase, Supabase, PostgreSQL, a hosted realtime product, or a separate Python backend. Do not add Redis or horizontal backend replicas for the MVP: presence and room ordering are designed for one Render instance. Scaling requires an explicit architectural revision.

An optional JavaScript CRDT library may be evaluated for S01 after core completion. No CRDT library is selected or required yet. See [source and decisions](source-and-decisions.md).
