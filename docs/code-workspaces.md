# Code workspaces

Code workspaces are a collaborative file type with separate saved Python and C++ drafts, shared program input, autosave, version history, and a Run action. The compiler is called only by the authenticated API; source code and stdin are never sent directly from the browser to the compiler service.

The backend uses the Wandbox compile API, which runs the selected compiler in its sandbox. The default is `https://wandbox.org/api`; set `CODE_RUNNER_URL` on the server to use another compatible Wandbox endpoint. The frontend does not need a compiler key or URL. Never put runner credentials in a `VITE_` variable.

Each run is authenticated, limited to a code file in a room the user can access, capped at 64 KiB of source and 16 KiB of stdin, and rate-limited to five runs per user per minute. The runner has a 20 second request timeout and the UI shows standard output, compiler output, runtime errors, or service errors.

The public Wandbox service is a shared, best-effort dependency and does not provide an SLA. For production traffic, operate a compatible isolated runner or configure a managed compiler service with predictable quotas. The API deliberately has no direct process execution on the Synkro server.
