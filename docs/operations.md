# Production Operations Runbook

This runbook covers the AgentAudit public beta deployment on Railway. Keep credentials, database URLs, customer data, and private dashboard links out of incident notes and GitHub issues.

## Operating Decisions for Beta

- PostgreSQL is the system of record.
- Railway runs `prisma migrate deploy` as a pre-deploy command. A failed migration blocks the new deployment before it serves traffic.
- Database migrations are forward-only. Application rollback never implies database rollback.
- Redis is optional for beta. Production may remain on the shared Prisma rate-limit store while traffic is low and the database has capacity.
- The launch operator recorded in `ALMOSTREADY.md` is the incident commander. The repository owner is the interim incident commander until that field is set.

## PostgreSQL Backup Policy

Inspect Railway native volume backups on the PostgreSQL service; enabling schedules or creating snapshots requires explicit approval and an eligible Railway plan:

1. Open the PostgreSQL service, then **Backups**.
2. Verify and record the actual daily, weekly, monthly, and manual snapshot settings. Do not enable additional schedules without approving their retention window and cost.
3. If the plan permits and the operator approves, create a fresh manual backup before a potentially destructive migration; do not treat the old manual snapshot as current recovery coverage.
4. Record the latest successful backup timestamp in the launch record without copying private dashboard URLs.

Railway's current documented native retention is 6 days for daily snapshots, 27 days for weekly snapshots, and 89 days for monthly snapshots. These are provider capabilities, not evidence that any schedule is enabled on this project's volumes. Native restores are limited to the same Railway project and environment. See [Railway Backups](https://docs.railway.com/volumes/backups) for current provider behavior and limits.

The independent logical-backup workflow runs daily with a 30-day pruning target. Read-only review found the latest five runs successful; run `41414677304` completed on 2026-11-02 at 08:40:07 UTC with upload, verification, and pruning steps successful. This is not proof that all historical object versions or native snapshots expired. Do not promise a universal 30-day maximum.

Read-only live Railway review confirmed **No backup schedule** on production Postgres. The Backups tab lists one manual snapshot, **Pre-Security-Patch Backup**, created **2026-08-23 06:31:10.928 UTC**, displayed as **121 MB**. Its presence is not a restore-integrity test. Railway reports that upgrading to Pro is required to create new native backups, configure automatic schedules, or enable point-in-time recovery. No upgrade, backup creation, restore, or deletion was performed.

The production volume inventory returned one volume, `postgres-volume`, attached to Postgres at `/var/lib/postgresql/data`, with 500 MB provisioned and approximately 131 MB used. No additional/unmounted production volumes were returned by that inventory. This is scoped to the production environment, not other environments or external copies. Automated recovery coverage currently relies on the separate GitHub Actions → S3 logical exports, not native schedules.

Read-only AWS review of `agentaudit-backups` in `us-east-1` found **Bucket Versioning disabled**, **Object Lock disabled**, **no lifecycle rules**, **no replication rules**, and bucket **Block all public access on**. The bucket's `postgres/` prefix displayed exactly 30 logical backup objects at 2026-11-03 18:26 UTC, with filenames ranging from `agentaudit-backup-2026-10-05T07-59-17Z.sql.gz` through `agentaudit-backup-2026-11-03T08-51-14Z.sql.gz`. Metadata names only were inspected; backup contents were not downloaded or restored. With Versioning disabled there are no S3 object versions to inspect.

Subsequent approved configuration change on 2026-11-03: lifecycle rule `expire-backups-30d` was created — enabled, scoped to prefix `postgres/`, current objects expire 30 days after creation, and incomplete multipart uploads are deleted after 7 days. Verified in the rule detail view. S3 now independently enforces the 30-day limit even if the GitHub Actions pruning step fails. Expired-object-delete-marker and noncurrent-version actions are absent because Versioning is disabled.

A real-backup restore drill passed on 2026-11-03: the latest S3 object `agentaudit-backup-2026-11-03T08-51-14Z.sql.gz` (719.6 KB gzip, 2.12 MB plain SQL, dumped by pg_dump 18.6) was downloaded via the AWS console, verified with `gunzip -t`, and replayed into an isolated in-memory PGlite engine via `node scripts/restore-drill-pglite.cjs`. All 6,934 statements executed with zero failures; restored tables included Organization (46), ApiKey (31), AuditLog (4956), Alert (16), ComplianceReport (9), EmailDelivery (40), plus `_prisma_migrations`. The restored `RetentionJobState` table was absent, confirming retention migrations are not yet deployed to production. The downloaded dump was deleted after verification. PGlite is not managed Railway Postgres, so the managed-restore path was additionally exercised on 2026-11-03 via `DATABASE_URL=<public-proxy-url> node scripts/restore-drill.js`: the same S3 object restored into a temporary `restore_drill_*` database on the actual managed Railway Postgres (all 6,934 statements, identical row counts), and the temp database was dropped. The retained manual Railway snapshot `c938e9d9` was deleted with owner approval on 2026-11-03 via `volumeInstanceBackupDelete`; the backup list is now empty and recovery relies on the daily S3 `pg_dump` exports.

Follow-up resolved on 2026-11-03: the stale `AuditLog` newest date reflects zero usage, not a broken write path. Railway request logs showed no `/audit-logs` traffic at all (only health checks and unmatched bot requests). A live end-to-end smoke test confirmed the full pipeline: register (201) → login → API-key creation (201) → `POST /api/v1/audit-logs` (201, row written at 18:42:19 UTC) → `GET /api/v1/audit-logs` returned the new row → self-serve `DELETE /api/v1/auth/organization` (204) removed the synthetic account and subsequent auth returned 401. AuditLog writes are functioning in production; the gap is genuinely absence of user traffic.

Before enabling age-based audit cleanup, the operator must approve the disposition of the old Railway manual snapshot. A lifecycle rule or additional hard-limit is optional but requires explicit approval before creation. Do not delete snapshots or object versions to satisfy the policy without explicit approval.

### Optional logical export

For an independent logical backup, use `pg_dump` from a trusted workstation with Railway's public PostgreSQL connection string supplied through the process environment. Do not place the URL directly in shell history or commit the dump.

```powershell
$env:DATABASE_URL = '<Railway public PostgreSQL URL>'
pg_dump --format=custom --no-owner --no-acl --file=agentaudit-backup.dump $env:DATABASE_URL
Remove-Item Env:DATABASE_URL
```

Store the dump in an encrypted, access-controlled location and delete local copies after upload.

## Non-Production Restore Drill

Never use production customer data for a drill.

1. Create or select a non-production Railway environment with its own PostgreSQL volume.
2. Insert a unique marker record and trigger a manual native backup.
3. Change or remove the marker after the backup completes.
4. In the PostgreSQL service's **Backups** tab, restore the dated backup.
5. Review Railway's staged volume change, then deploy it.
6. Verify the original marker returned and the later change did not.
7. Run `npx prisma migrate status` and the authenticated smoke test against the non-production API.
8. Record the date, operator, backup timestamp, recovery duration, and result in the evidence log.

Restoring a Railway backup stages a replacement volume and redeploys the service when applied. The original volume remains unmounted, and newer backups remain on that original volume; they are not automatically deleted. Include these retained copies in the backup inventory and review the staged change before deploying it.

## Retention and Restore Safety Gate

Audit retention preferences support `null`, 7, 30, or 90 days on every plan. Cleanup remains disabled and unscheduled. Before publishing the revised policies, have the owner review the corrected email/backup claims and approve a prominent notice to existing users; do not silently replace earlier retention promises. No notifications have been sent by this work. Production deletion requires explicit approval after a dry run; both `RETENTION_DELETE_ENABLED` and `RetentionJobState.deletionEnabled` must permit it. A saved preference alone is not activation.

A restored database can resurrect deleted accounts, old retention preferences, pending notifications, job leases, and saved traversal cursors. Restoring and immediately exposing the API is not safe:

1. Restore only into an isolated, access-controlled environment with customer traffic, email/webhook delivery, and cleanup scheduling blocked. Never run `scripts/restore-drill.js` against production data: its SQL error diagnostics can include source data, and it creates and drops a database.
2. Keep the environment deletion switch off. With explicit approval for database state changes, also disable the restored database deletion flag and reset stale leases and traversal progress before any retention run. Restored `dryRunCursor` and `executionCursor` values are not a trustworthy starting point for a new full scan.
3. Reconcile account deletions and retention changes made after the backup using authoritative incident/support records. Do not infer deleted accounts or newer preferences from an older snapshot. There is currently no implemented out-of-backup deletion ledger; if reliable reconciliation evidence is unavailable, keep the restored database isolated and escalate to the owner.
4. Run a full, bounded dry-run traversal using the current UTC time, continuing through `limited` results. Verify reconciled preferences, tenant isolation, counts, unchanged quotas, and notification suppression. Dry-run alone does not remove restored data.
5. Obtain explicit approval for necessary reconciliation/cleanup deletions, perform controlled batches in isolation, and verify expired/deleted data is no longer served before routing customer traffic. Re-enable delivery or scheduling only after checking that restored queues cannot resend old notifications. Record sanitized evidence and check retained backup copies separately.

A local synthetic recovery exercise now passes via `npm run test:retention:restore` and is included in `npm run test:retention`. It creates an in-memory PGlite database, applies repository migrations, archives its PGDATA into an in-memory gzip blob, mutates the source with synthetic post-backup changes, and restores that archive into a separate in-memory database. It verifies exact restored business rows, resurrected account/policy state, stale enabled flags/leases/cursors, manual reconciliation from an outside-the-archive fixture, dry-run non-deletion, both kill switches, bounded re-expiration, retained records, unchanged quotas, and final disabled switches. All source and restored data is synthetic, no remote database or email/webhook service is used, and the archive is not written to disk.

The exercise removed two expired audit logs and three expired alerts after separately reconciling the synthetic deleted organization. It is a local embedded-database test, not a pg_dump/psql restore, S3 object-integrity check, Railway native restore, durable deletion-ledger implementation, or managed PostgreSQL recovery test. S3 configuration evidence and an approved non-production recovery exercise of the actual backup format remain rollout gates, not completed production verification.

### Email delivery retention discrepancy

No scheduled 90-day cleanup exists for `EmailDelivery`. Account deletion removes existing organization-linked rows but may create a new deletion-confirmation delivery record afterward. Public policies now state this limitation rather than claiming automatic removal. A separate email-retention implementation must address deduplication/replay windows, pending retries, deletion-confirmation records, provider-held data, bounded execution, and tests before a 90-day guarantee can be reinstated. Do not include email rows in the audit cleanup engine implicitly.

## Deploy and Migration Verification

For each production deploy:

1. Confirm CI is green on the exact commit.
2. Confirm Railway's pre-deploy migration command exits successfully.
3. Confirm the new deployment passes `/health` before it receives traffic.
4. Verify `/health` reports the expected commit and `database: up`.
5. Run the authenticated smoke test for a release or migration-bearing deploy.

Do not run `prisma migrate resolve` as a routine deployment step. It is a one-time recovery command that requires investigating the failed migration and choosing `--applied` or `--rolled-back` deliberately.

## Application Rollback

Railway can restore a previously successful deployment's image and custom variables from the service's **Deployments** tab. See [Railway Deployment Actions](https://docs.railway.com/deployments/deployment-actions).

1. Record the failing commit, deployment ID, symptoms, and start time.
2. Identify the last deployment that passed health and the authenticated smoke test.
3. Check whether the failing release applied a database migration.
4. If the prior application version is compatible with the current schema, choose **Rollback** from that deployment's action menu.
5. Verify `/health`, `/mcp/v1/schema`, login, audit submission, and logs after Railway switches traffic.
6. Record the restored commit and resolution time in the incident notes and launch evidence log.

If the old application is not compatible with the new schema, do not improvise a schema downgrade. Roll forward with a compatibility fix. Restore a database backup only for confirmed data corruption or loss, under the incident commander's direction.

## Redis-Disabled Beta Mode

When `REDIS_ENABLED` is not `true` or `REDIS_URL` is empty/unavailable, startup selects the Prisma rate-limit store. It provides a shared 15-minute counter through PostgreSQL, so limits remain consistent across API replicas.

Accepted beta tradeoffs:

- Rate-limited requests add PostgreSQL writes.
- The limiter fails open if its database write fails; it does not turn a database incident into a blanket 429 outage.
- `/health` reports Redis as `disabled`; this is expected and is not a degraded state.
- Monthly organization quotas remain separate and are reserved atomically in PostgreSQL.

Enable Redis before sustained high traffic, significant PostgreSQL limiter load, or background-worker deployment. Set both `REDIS_ENABLED=true` and `REDIS_URL`, redeploy, and confirm `/health` reports `redis: up`.

## Incident Response

### Severity

- **SEV-1:** security breach, confirmed cross-tenant exposure, data loss, or total production outage.
- **SEV-2:** major customer path unavailable, repeated 5xx responses, billing/webhook failure, or severe degradation.
- **SEV-3:** limited defect with a workaround and no security or data-integrity impact.

### Response

1. The incident commander opens a private working note and assigns severity.
2. Preserve request IDs, timestamps, affected endpoints, deployment commit, and sanitized logs.
3. Contain the issue: pause promotion, disable the affected optional feature, or roll back when schema-compatible.
4. For an ongoing customer-visible SEV-1/SEV-2 incident, publish a sanitized GitHub issue and update it at least every 60 minutes until resolved.
5. Never publish secrets, customer payloads, access tokens, private email addresses, or exploit details.
6. After recovery, record root cause and follow-up work. Publish a sanitized summary for SEV-1 incidents.

Security reports follow `SECURITY.md`, not the public incident issue flow.

## Monitoring Verification

- `/health` runs database and active-Redis probes concurrently, with a two-second deadline per probe. An unavailable database or active Redis store returns HTTP 503. Disabled Redis is expected when PostgreSQL backs the rate limiters.
- Health responses are not cached and include `checkedAt`, the deployed commit, and an `X-Request-Id`. Credential-free cross-origin GETs are supported only for this public health endpoint; authenticated API CORS remains restricted.
- Request-completion logs contain the request ID, method, route template, status, duration, and aborted flag, not request bodies, query strings, or authorization headers. Search Railway logs by request ID when investigating a failed request.
- Unexpected errors reach Sentry with request/release context. Routine 4xx errors are excluded. Request data, user data, breadcrumbs, and extras are stripped before Sentry transport. Do not put secrets or customer content into exception messages.
- Outbound customer-webhook HTTP/transport failures and exhausted email retries are covered by automated tests. A healthy `/health` response does not verify either delivery provider.

For a read-only production check, run `node scripts/verify-monitoring.js`. For an explicitly approved notification test, dispatch **Verify production monitoring** with `send_event=true`. The workflow uses the GitHub `SENTRY_DSN` secret and sends one synthetic event through the compiled application's capture helper. It records the event ID and transport acceptance without printing the DSN. HTTP acceptance is not proof of alert-rule execution or mailbox delivery: confirm the event's production environment, release, request tags, alert-rule firing, and inbox receipt separately. Do not repeat the event merely because a notification has not arrived yet.

UptimeRobot remains the external `/health` monitor. Reconfirm its interval, failed-check threshold, alert destination, and a recent test/recovery notification in the owner dashboard before launch. Do not deliberately take production offline for this test.

## Independent Public Status Page

The standalone status site is hosted separately from Railway using GitHub Pages:

https://aspicykabob.github.io/-agentaudit-api/

The same page is available at `/status.html` on the application. `npm run status:build` creates a `dist-status` bundle containing only `index.html` and `status.js`; the Pages workflow publishes only that bundle. It does not publish the dashboard, API source, environment files, or customer data. The GitHub Pages deployment uses its own hosting, but still depends on GitHub and the user's network.

The page polls the public production health endpoint every 30 seconds while visible, times out after five seconds, and marks results older than 60 seconds unknown. It never treats a missing, stale, malformed, or failed health response as green. It shows database/active-Redis connectivity only, not a comprehensive feature test. Historical uptime and incident history are not inferred from browser checks. Publish sanitized incident updates in GitHub Issues and link them from support responses.

## Beta Load Targets and Capacity Evidence

Run `npm run load:quick` to verify the runner or `npm run load:local` for the complete local profile. These commands always create a new in-memory PGlite database, apply repository migrations, bind an ephemeral loopback port, and discard that database on exit. They do not read `.env`, accept a remote target, disable the rate limiters, send email/webhooks, or access production data. The embedded adapter is pinned to a Prisma-compatible version.

The local profile uses eight synthetic tenants, one SSN-blocking rule each, 80 seed records, and a 90% single-write / 10% query workload with 512-byte metadata padding:

| Stage | Offered rate | Duration | Acceptance target |
| --- | --- | --- | --- |
| Warmup | 2 requests/second | 10 seconds | No errors or dropped work |
| Sustained local regression target | 5 requests/second | 120 seconds | p95 < 500 ms, p99 < 1,500 ms, zero errors or dropped work |
| Short burst | 10 requests/second | 30 seconds | Same latency/error targets |

Latency includes scheduler delay from the intended request start, and the runner caps in-flight work at 16 rather than silently building an unlimited queue. It reports scheduler lag, status counts, p50/p95/p99, process peak RSS, and event-loop delay. It also verifies persisted counts, exact quota usage, expected block decisions and alerts, tenant ownership of queried rows, and a real HTTP 429 with `Retry-After` at the 200-read limit. A failed acceptance target exits unsuccessfully.

**These are local test targets, not a production throughput promise or SLA.** PGlite shares the local process and serializes database work; this does not measure Railway CPU, managed PostgreSQL storage/pool capacity, network latency, Redis, multi-replica behavior, large datasets, or batch transactions. The HTTP client also shares the benchmark process, so CPU/scheduler contention affects results.

Current API budgets are per-IP (IPv6 subnet grouping applies), in separate 15-minute buckets: 1,000 single submissions, 500 batch requests, 200 audit reads, 200 general API requests excluding audit-log routes, and five failed login/register attempts. Clients sharing a gateway share these budgets across API keys. A 5-request/second test lasting two minutes does not authorize that rate indefinitely: 1,000 single requests per 900 seconds averages about 1.11 requests/second within that bucket. Monthly quotas apply separately. Do not raise or bypass limits to make a benchmark pass.

Before publishing production scale limits, run at least one full rate-limit window against an isolated staging environment with production-like PostgreSQL, instance sizing, storage, dataset size, and Redis mode. Cover single writes, reads, batches, quota exhaustion, and recovery; collect database CPU, query/pool latency, connection usage, and application memory. Record exact commit, resource sizes, dataset/rule counts, error budget, and p95/p99. Keep the production-capacity gate open until that evidence exists.

### Local measurement log

- 2026-10-27, Windows / Node 24.15.0 / Intel Core 5 120U: initial sustained run completed 594 of 600 offered requests with zero HTTP/contract errors but six dropped requests, p95 1,142 ms and p99 3,468 ms. The later 10-request/second burst passed. This run did not meet the target; scheduler-lag reporting and latency measurement from the intended start were subsequently added. No production load was generated.
- 2026-10-27 20:34 UTC, same local machine and unchanged acceptance targets: corrected-metrics rerun passed. Sustained 5 requests/second for 120 seconds completed 600/600 requests, p95 72.43 ms, p99 167.76 ms, maximum scheduler lag 43 ms. The 10-request/second, 30-second burst completed 300/300, p95 61.39 ms, p99 85.18 ms. All stages had zero errors/dropped work. Across warmup and measured stages: 828 successful writes, 908 persisted logs including 80 seeds, 184 blocked events/alerts, exact quota accounting, tenant-owned query results, and a verified 200-read/15-minute HTTP 429 boundary. Peak process RSS was 491 MiB and event-loop p99 was 37.09 ms. These are local embedded-database measurements only; managed PostgreSQL/staging capacity remains unverified.
