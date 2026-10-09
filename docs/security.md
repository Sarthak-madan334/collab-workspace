# Security and access

## Session design

Proposed core design: opaque random bearer sessions, stored server-side in Atlas. Generate at least 32 random bytes with Node.js `crypto`, return the token once, and store only its SHA-256 hash. Session lifetime defaults to 8 hours. Check expiry/revocation on every protected request and event; TTL indexes only clean up records.

Store tokens in browser memory, not localStorage, URLs, or logs. Page reload requires sign-in; persistent login/refresh tokens are deferred. This avoids depending on cross-site cookies between Vercel and Render. If persistent login is later introduced, document its cookie, CSRF, refresh, and browser compatibility design before changing this contract.

Logout revokes the session, disconnects associated sockets, and clears frontend state. On expiry, disconnect idle sockets as well as rejecting new actions. Track socket IDs by session for revocation.

## Passwords and input

Use asynchronous Node.js `crypto.scrypt` with a unique random salt and stored derivation parameters; do not block the event loop with synchronous hashing. Calibrate a memory-hard configuration on the chosen Render instance before release, benchmark concurrent logins, and use constant-time comparison. Never store plaintext passwords or use a fast general hash alone for passwords.

Proposed password limit: 12–128 characters; accept spaces and do not silently trim passwords. Normalize emails consistently and enforce a unique index. Validate lengths, types, IDs, UTF-8 note size, and unknown properties. Use field-by-field database writes rather than spreading client objects. React must render notes as text; no `dangerouslySetInnerHTML` for user content.

## Authorization

Room membership gates note, version, presence, sync, and operation-status access. Owner status gates invites and restore. Validate referenced versions against the room. User/author IDs come from the session, never from event payloads. Hide owner buttons for usability but enforce all checks server-side.

Invite possession allows an authenticated user to join. Generate unpredictable codes, do not use sequential room IDs as invites, rate-limit redemption, and allow owner rotation. Invitation rotation does not remove members. Only the owner may retrieve the stored code.

## Network and abuse controls

Allow only exact approved frontend origins on HTTP CORS and the Socket.IO transport/handshake. Cover WebSocket upgrades as well as polling; CORS alone is not authorization. Permit the `Authorization` and `Content-Type` headers and the required methods. No cookie credentials are needed under this bearer design. Require HTTPS/WSS in production.

Initial application limits to validate in testing: 10 authentication attempts per 15 minutes per IP, 10 invite attempts per minute per user, and 5 edit events per second per user/room. Bound concurrent sockets, per-room queue depth, and JSON/event payload size (256 KiB transport ceiling, 100 KiB content limit). Return explicit overload errors. Configure proxy-aware client IP handling only for the actual deployment topology; do not blindly trust arbitrary forwarded headers.

## Secrets and data

Keep Atlas credentials and server environment files out of Git. All `VITE_` values are public bundle inputs. Use a dedicated least-privilege database user and separate development/test/production databases. Configure Atlas network access for permitted development and Render egress addresses. Never log session tokens, invites, passwords, database URIs, or note bodies.

Review dependencies and lockfiles before deployment. Access controls must be tested with direct HTTP/event requests, not only through the UI. Password recovery, email verification, account deletion, and abuse administration are unresolved post-MVP features; do not imply production identity completeness.
