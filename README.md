# Synkro

Real-time collaborative notes for TechSpace BuildLab '26, problem statement **A04**, Advanced track. Synkro is the working product name taken from this workspace; the submitted proposal is titled **Real-Time Collaborative Workspace**.

Users sign in, create or join a room, edit shared notes, see who is online, and review or restore saved versions.

## Project status

This repository currently contains planning and implementation documentation only. Application code, package manifests, tests, and deployment configuration have not been created. Commands and paths described in the guides are the intended implementation contract, not working setup instructions for the current checkout.

## Required stack and hosting

| Layer | Technology | Destination |
| --- | --- | --- |
| Language | JavaScript | Client and server |
| Frontend | React | Vercel |
| Backend | Node.js | Render web service |
| Live synchronization | Socket.IO | Browser to Render |
| Persistent storage | MongoDB Atlas | Atlas free tier planned in proposal |

Supporting choices such as Vite and Express are documented separately from the proposal's required stack in [Tech stack](docs/tech-stack.md). No replacement framework, database, or managed realtime service is part of the plan.

## Scope

- Shared plain-text notes, one document per room.
- Authentication and private room access.
- Socket.IO updates and online-member presence.
- Persistent notes and version history with restore.
- Stretch only: CRDT editing, comments on selected text, and editor/viewer permissions.

The core uses server-ordered last-write-wins. Concurrent full-document edits can overwrite one another; saved history makes accepted revisions recoverable. CRDT merging is a separate stretch milestone.

## Documentation

Start with the [documentation index](docs/index.md), then read [requirements](docs/product-requirements.md), [architecture](docs/system-architecture.md), [frontend](docs/frontend.md), and [backend](docs/backend.md).

Implementation guides cover [data models](docs/data-models.md), [HTTP APIs](docs/api-contract.md), [Socket.IO contracts](docs/realtime-protocol.md), [security](docs/security.md), and [local development](docs/local-development.md). Delivery guides cover the [implementation plan](docs/implementation-plan.md), [testing](docs/testing-and-validation.md), [Vercel/Render deployment](docs/deployment.md), [operations](docs/operations.md), and [demo](docs/demo-and-pitch.md).

## Source and team

The documentation follows the supplied two-page project proposal and A04 screenshots. See [source mapping and decisions](docs/source-and-decisions.md) for required scope, assumptions, and unresolved choices.

Team: **Power Puff Girls** — Piyush Aggarwal, Alie Sharma, Tanisha Malik, and Sarthak Madan. The proposal lists [Techspace-srmuh/collab-workspace](https://github.com/Techspace-srmuh/collab-workspace) as the intended repository; no remote repository was inspected or modified for this documentation task.
