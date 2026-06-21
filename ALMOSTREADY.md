# Almost Ready: Public Beta Launch Checklist

This is the living source of truth for launching AgentAudit as a public developer beta. Update it whenever launch work merges or an operational check is completed.

**Target:** Public developer beta

**Last reviewed:** 2026-06-20

**Current recommendation:** The application code is beta-ready. Complete the open launch gates below before actively driving public traffic or enabling paid billing.

**Deferred by owner:** Repeat the Stripe sandbox end-to-end test during the final launch pass, after all non-Stripe gates are complete.

## How to Use This Checklist

- Check an item only when there is evidence: a merged PR, passing test, live response, or dashboard confirmation.
- Add the evidence and date beside operational checks when possible.
- Keep secrets and private dashboard URLs out of this file.
- Reopen a checked item if a later change invalidates its evidence.

## Current Snapshot

- [x] Public API is deployed from current `main` commit `17d4145` (verified 2026-06-20).
- [x] `/health` reports `status: ok` and database `up` (verified 2026-06-20).
- [x] `/mcp/v1/schema` responds successfully (verified 2026-06-20).
- [x] API, Python SDK, and TypeScript SDK CI jobs pass on `main`.
- [x] Production dependency trees report zero known vulnerabilities with `npm audit --omit=dev`.
- [x] Run the full authenticated live smoke test against the production deployment (passed 2026-06-20).
- [ ] Complete the operational, legal, and billing decisions below.

## P0: Public Beta Launch Gates

These items should be complete before announcing the public beta.

### Production Configuration and Data

- [x] Production refuses to boot with placeholder `DATABASE_URL`, `JWT_SECRET`, or `API_KEY_SALT` values.
- [x] Billing refuses to start with incomplete or placeholder Stripe configuration.
- [x] Documentation explains how to generate secrets without committing reusable values.
- [x] Confirm Railway uses unique production values for `JWT_SECRET` and `API_KEY_SALT` (owner-confirmed 2026-06-20).
- [ ] Confirm `FRONTEND_URL` exactly matches the public application origin.
- [x] Confirm all Prisma migrations are applied in production, including enforcement and usage-period migrations (exercised by the live registration, quota, enforcement, and audit-log paths on 2026-06-20).
- [ ] Confirm PostgreSQL backups are enabled and document the restore procedure.
- [ ] Perform one restore drill using non-production data.
- [ ] Decide whether Redis is required for beta traffic; document the accepted Prisma rate-limit fallback if it remains disabled.

### Security and Tenant Isolation

- [x] Customer webhooks require HTTPS and block private, loopback, link-local, metadata, and DNS-rebinding targets.
- [x] User-provided regex rules use RE2 and have a pattern-length limit.
- [x] Custom validators execute in an isolated V8 environment.
- [x] API keys are stored as keyed hashes and raw values are shown only once.
- [x] Unexpected 5xx responses hide internal details and include a request ID.
- [x] Request IDs are emitted in logs and response headers.
- [x] High- and critical-severity npm audit findings are cleared.
- [x] Perform an endpoint-by-endpoint tenant-isolation/IDOR review using two organizations.
- [x] Verify revoked API keys immediately lose access.
- [x] Verify production CORS does not grant access to an unapproved origin.
- [x] Run a secret scan across Git history and rotate anything questionable (779 reachable blobs scanned 2026-06-20; only explicit synthetic config-test values matched).
- [ ] Enable branch protection for `main` with required CI checks and pull-request review.

### Guardrails, Billing, and Quotas

- [x] Python and TypeScript SDKs honor the server's authoritative `enforcementAction`.
- [x] A blocking PII rule returns `enforcementAction: block` in automated tests.
- [x] Stripe checkout accepts only configured price IDs.
- [x] Stripe price-to-plan mapping is deterministic and shared by checkout and webhook handling.
- [x] Quota checks are atomic and usage periods reset deterministically.
- [ ] Choose the beta billing mode: free beta with Stripe disabled, or paid beta with Stripe enabled.
- [x] Standardize published pricing at Pro `$29` / Business `$79` (owner-confirmed 2026-06-20).
- [ ] If billing is enabled, verify live Stripe products and price IDs match the published pricing.
- [ ] **Final launch pass:** If billing is enabled, complete a fresh Stripe sandbox checkout, webhook, plan-change, cancellation, and failed-payment test.
- [ ] If billing is disabled, remove or clearly disable checkout calls-to-action for beta.
- [ ] Verify quota behavior against the production database under concurrent requests.

### Live End-to-End Verification

- [x] Public health endpoint responds successfully.
- [x] Public MCP schema endpoint responds successfully.
- [x] Run `node scripts/smoke-test-live.js https://agentaudit-api-production.up.railway.app` with an intentionally created smoke-test account (passed 2026-06-20).
- [x] Confirm the smoke test creates a blocking SSN rule and receives `enforcementAction: block`.
- [ ] Confirm the resulting audit log appears in the dashboard.
- [x] Confirm smoke-test API keys and compliance rules are cleaned up (cleanup completed without warnings on 2026-06-20).
- [ ] Test registration, login, API-key creation/revocation, and logout manually in the deployed UI.
- [ ] Test dashboard empty, loading, success, and API-error states.
- [ ] Test the critical path on current Chrome, Firefox, Safari, and a mobile viewport.

### Legal, Trust, and Customer Expectations

- [x] README labels the project as a public beta and does not claim SOC 2 or HIPAA certification.
- [ ] Publish a Privacy Policy linked from every public page.
- [ ] Publish Terms of Service linked from every public page.
- [ ] Publish an Acceptable Use Policy covering abusive and unlawful agent activity.
- [ ] Document what customer data is stored, where it is stored, and the current retention/deletion behavior.
- [ ] Provide a customer data-deletion/request process.
- [ ] Review the website's “enterprise security” language against actual controls and certifications.
- [ ] Verify `support@agentaudit.io` and `sales@agentaudit.io` receive mail and have an owner.

## P1: Beta Polish and Developer Experience

These items can run alongside a quiet beta, but should be completed before broader promotion.

### Documentation and Messaging

- [x] README includes a copy/paste flow from registration to a blocked PII audit log.
- [x] Python and TypeScript SDK examples are present.
- [x] LangChain and CrewAI integrations have automated tests.
- [x] A Postman collection is included.
- [ ] Verify the README quickstart against the live deployment from a clean machine.
- [ ] Verify both published SDK packages from clean environments rather than workspace source.
- [x] Update `ROADMAP.md`: LangChain and Postman are implemented, not planned.
- [x] Replace remaining repository `YOUR_USERNAME` placeholders with the public GitHub URL.
- [x] Align deployment, self-hosting, roadmap, and website pricing language at Pro `$29` / Business `$79`.
- [x] Verify every public documentation and social/community link; remove placeholders or dead destinations (verified 2026-06-20; replaced dead docs/template links and removed an invalid Discord invite).
- [x] Replace README's deleted `BEFORELAUNCH.md` link with this checklist.

### Reliability and Observability

- [x] Sentry integration exists and is disabled safely when no DSN is configured.
- [x] Structured logging and request correlation are implemented.
- [x] CI runs lint, build, API tests, Python SDK tests, and TypeScript SDK tests.
- [ ] Configure the production `SENTRY_DSN` and confirm a test exception arrives with release and request context.
- [ ] Configure an external uptime monitor for `/health` and an alert destination.
- [ ] Add alerting for repeated 5xx responses, database failures, and webhook delivery failures.
- [ ] Document the deploy rollback procedure and last-known-good commit.
- [ ] Define an incident owner and a simple public incident communication process.
- [ ] Review the 19 remaining moderate Jest/Istanbul development-only advisories when upstream publishes a non-regressive fix.

### Repository and Release Hygiene

- [x] Stale `Dockerfile.bak` and duplicate SDK directory cruft are absent from `main`.
- [x] Build and test preparation work on Windows and Linux CI.
- [x] Close superseded PR #7 because its `Dockerfile.bak` deletion is already on `main`.
- [x] Add a public bug template that redirects security-sensitive reports away from GitHub issues.
- [x] Add `SECURITY.md` with a private vulnerability-reporting channel.
- [x] Confirm `CHANGELOG.md` reflects the launch build (Unreleased section updated 2026-06-20).
- [ ] Choose the public beta version, create a signed tag/release, and record the deployed commit.

## P2: Post-Launch Hardening

These are important, but they do not block a carefully labeled developer beta.

- [ ] Add configurable retention policies and scheduled deletion.
- [ ] Add tamper-evident audit-log signing or hash chaining.
- [ ] Add formal data-residency options.
- [ ] Add SSO/SCIM and organization-level roles.
- [ ] Add IP allowlisting.
- [ ] Plan and begin SOC 2 readiness work.
- [ ] Add Slack/Teams alert delivery.
- [ ] Add a public status page.
- [ ] Define load targets, run sustained load tests, and publish capacity/scale limits.

## Launch-Day Runbook

- [ ] Freeze non-launch changes.
- [ ] Confirm CI is green on the exact release commit.
- [ ] Confirm migrations and production configuration.
- [ ] Run the authenticated live smoke test.
- [ ] Confirm Sentry, uptime, logs, and alert routing.
- [ ] Confirm support inbox coverage.
- [ ] Verify pricing, checkout mode, legal links, and beta messaging.
- [ ] Record the release tag, deployed commit, operator, and launch time below.
- [ ] Announce the beta.
- [ ] Monitor registration, error rate, latency, database health, and support for the first 24 hours.

## Launch Record

| Field | Value |
|---|---|
| Release tag | Not set |
| Deployed commit | `17d4145` (verified 2026-06-20) |
| Launch date/time | Not set |
| Launch operator | Not set |
| Billing mode | Not decided |
| Rollback commit | Not set |

## Evidence Log

| Date | Evidence |
|---|---|
| 2026-06-20 | Public `/health` returned `status: ok`, version `1.1.0-trace`, commit `17d4145`, database `up`, Redis `disabled`. |
| 2026-06-20 | Public `/mcp/v1/schema` returned `AgentAudit MCP`, version `1.0.0`. |
| 2026-06-20 | PR #17 merged dependency security upgrades; API and both SDK CI jobs passed. |
| 2026-06-20 | Local launch-hardening verification passed lint, build, and 19 API suites / 158 tests. |
| 2026-06-20 | Owner confirmed Railway uses unique production JWT/API-key secrets and approved Pro `$29` / Business `$79` pricing. |
| Prior to 2026-06-20 | Owner completed a Stripe sandbox end-to-end test; a fresh pre-launch recheck remains required. |
| 2026-06-20 | Updated LangChain/Postman/quickstart roadmap status, aligned pricing language, replaced known GitHub placeholders, and closed superseded PR #7. |
| 2026-06-20 | Owner deferred the fresh Stripe sandbox recheck until the final launch pass. |
| 2026-06-20 | Tenant-isolation review added seven contracts and fixed cross-tenant `agentId` attachment on single/batch audit writes. |
| 2026-06-20 | Added revoked-key and production CORS regression tests plus private security-reporting guidance. |
| 2026-06-20 | Authenticated Railway smoke test passed registration, login, API-key creation, blocking SSN enforcement, audit-log querying, and temporary key/rule cleanup. The exercised quota and enforcement paths also confirmed the current production schema. |
| 2026-06-20 | Redacted Git-history scan covered 779 reachable blobs; the only secret-pattern matches were explicit synthetic JWT/salt fixtures in `tests/unit/config.test.ts`. |
| 2026-06-20 | Public-link audit replaced a dead Railway template and unresolved docs domain with working guides, removed an invalid Discord invite, and fixed the final GitHub clone placeholder. |
| 2026-06-20 | Added an Unreleased changelog entry for launch hardening, tenant isolation, security regressions, and public documentation cleanup. |
