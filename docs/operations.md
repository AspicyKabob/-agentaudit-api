# Production Operations Runbook

This runbook covers the AgentAudit public beta deployment on Railway. Keep credentials, database URLs, customer data, and private dashboard links out of incident notes and GitHub issues.

## Operating Decisions for Beta

- PostgreSQL is the system of record.
- Railway runs `prisma migrate deploy` as a pre-deploy command. A failed migration blocks the new deployment before it serves traffic.
- Database migrations are forward-only. Application rollback never implies database rollback.
- Redis is optional for beta. Production may remain on the shared Prisma rate-limit store while traffic is low and the database has capacity.
- The launch operator recorded in `ALMOSTREADY.md` is the incident commander. The repository owner is the interim incident commander until that field is set.

## PostgreSQL Backup Policy

Enable Railway native volume backups on the PostgreSQL service:

1. Open the PostgreSQL service, then **Backups**.
2. Enable daily, weekly, and monthly schedules.
3. Trigger one manual backup before launch and before any potentially destructive migration.
4. Record the latest successful backup timestamp in the launch record without copying private dashboard URLs.

Railway currently retains native daily backups for 6 days, weekly backups for 1 month, and monthly backups for 3 months. Native restores are limited to the same Railway project and environment. See [Railway Backups](https://docs.railway.com/volumes/backups) for current provider behavior and limits.

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

Restoring a Railway backup swaps the mounted volume and redeploys the service. It can also remove backups newer than the selected restore point. Review the staged change before deploying it.

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
