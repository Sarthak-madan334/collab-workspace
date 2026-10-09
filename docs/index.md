# Documentation index

All guides describe the planned implementation unless explicitly stated otherwise. The current repository is documentation-only.

| Guide | Purpose |
| --- | --- |
| [Project overview](project-overview.md) | Problem, users, boundaries, and outcomes |
| [Product requirements](product-requirements.md) | Core and stretch scope with acceptance criteria |
| [Tech stack](tech-stack.md) | Required technologies and supporting choices |
| [System architecture](system-architecture.md) | Components, data flow, and deployment boundaries |
| [Frontend](frontend.md) | Screens, state, editor behavior, accessibility |
| [Backend](backend.md) | Services, lifecycle, authorization, persistence |
| [Data models](data-models.md) | Collections, fields, indexes, and invariants |
| [API contract](api-contract.md) | HTTP routes, payloads, and errors |
| [Realtime protocol](realtime-protocol.md) | Events, ordering, acknowledgments, and recovery |
| [Security](security.md) | Sessions, credentials, permissions, and validation |
| [Local development](local-development.md) | Planned layout, commands, and environment variables |
| [Implementation plan](implementation-plan.md) | Milestones and completion gates |
| [Testing and validation](testing-and-validation.md) | Functional, concurrency, security, and deployment checks |
| [Deployment](deployment.md) | Vercel frontend, Render backend, Atlas database |
| [Operations](operations.md) | Logs, recovery, rollback, and troubleshooting |
| [Demo and pitch](demo-and-pitch.md) | Core demonstration and evaluation evidence |
| [Source and decisions](source-and-decisions.md) | Traceability, assumptions, risks, and open decisions |

Start implementation with requirements and the stack. Agree on the data, HTTP, and realtime contracts before connecting the editor. Use the testing guide as the release checklist. Update affected guides in the same change as any implementation decision.
