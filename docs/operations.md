# Operations and troubleshooting

## Signals

Track readiness failures, authentication failures, active sockets/rooms, queue depth, event acknowledgment latency, transaction errors, restore conflicts, reconnect frequency, and Atlas storage growth. Use structured logs with request/operation IDs and error codes. Never include passwords, raw tokens, invite codes, connection strings, or note contents.

Targets are defined in [requirements](product-requirements.md). Measure on the deployed system before promising capacity or latency.

## Troubleshooting

| Symptom | Check | Recovery |
| --- | --- | --- |
| Client cannot call backend | Public API URL, HTTPS, exact origin, backend readiness | Correct environment and redeploy/rebuild affected service. |
| Socket does not connect | Socket URL/path, token, origin validation, shared HTTP port | Fix configuration; inspect handshake without logging credentials. |
| Cold initial load | Render plan/activity and readiness | Show connecting state; distinguish warm latency from startup delay. |
| Atlas connection fails | Credentials, password encoding, database name, IP access list | Correct secret/network configuration; keep readiness false until connected. |
| Note shows save failure | DB status, transaction error, payload/rate limit | Preserve draft and retry only after determining operation status. |
| Duplicate presence | User/socket mapping and leave cleanup | Deduplicate by user, remove only after final socket closes. |
| Stale note after reconnect | Rejoin snapshot, revision checks, periodic sync | Fetch canonical state before allowing draft submission. |
| History grows too large | Snapshot frequency, note size, database usage | Review quotas and explicitly design retention; do not silently drop history. |
| Deep-link 404 on frontend | Vercel SPA fallback | Add/verify rewrite and redeploy frontend. |

## Incident handling

If persistence is failing, reject new writes with a retryable error and keep saved indicators false. Preserve drafts in open tabs. Diagnose using request/operation IDs. After recovery verify note/latest-version consistency, then ask clients to sync. Do not manually replace current content without creating an auditable version through the controlled service path.

On credential exposure, rotate the affected Atlas credentials, update Render secrets, redeploy, and inspect access evidence. Revoke compromised sessions and disconnect associated sockets. Invite exposure is handled by owner rotation, with the limitation that already joined members remain authorized.

## Backup and recovery

Version history protects against normal editing mistakes; it is stored in the same database and does not protect against database deletion or credential compromise. Confirm backup/export options supported by the chosen Atlas tier. Before a destructive migration, create an authorized encrypted export using supported MongoDB tooling, store it outside the database, and test restoration into a separate database. Keep credentials out of command history.

Do not claim a recovery point/time guarantee until a real restore drill has been measured. A restore drill must check users/rooms/memberships, latest note/version equality, indexes, and application connectivity. Keep any imported sessions revoked when restoring to a test environment.

## Maintenance boundaries

Core retains all history and has no automatic deletion workflow. A retention policy, account deletion, room deletion, member removal, or horizontal scaling needs a documented design change and tests. Before scaling beyond one backend instance, solve shared presence, room event distribution, operation ordering, and transport routing. No extra infrastructure is silently included in the current stack.
