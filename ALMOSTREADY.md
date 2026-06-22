# Almost Ready: Public Beta Launch Checklist

This is the living source of truth for launching AgentAudit as a public developer beta. Update it whenever launch work merges or an operational check is completed.

**Target:** Public developer beta

**Last reviewed:** 2026-06-21

**Current recommendation:** The application code is beta-ready. Complete the open launch gates below before actively driving public traffic or enabling paid billing.

**Deferred by owner:** Repeat the Stripe sandbox end-to-end test during the final launch pass, after all non-Stripe gates are complete.

## How to Use This Checklist

- Check an item only when there is evidence: a merged PR, passing test, live response, or dashboard confirmation.
- Add the evidence and date beside operational checks when possible.
- Keep secrets and private dashboard URLs out of this file.
- Reopen a checked item if a later change invalidates its evidence.

## Current Snapshot

- [x] Public API is deployed from current `main` commit `4261b7c` (verified 2026-06-21).
- [x] `/health` reports `status: ok` and database `up` (verified 2026-06-21).
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
- [x] Document the PostgreSQL backup and restore procedure.
- [ ] Confirm daily, weekly, and monthly PostgreSQL backups are enabled in Railway.
- [ ] Perform one restore drill using non-production data.
- [x] Keep Redis optional for beta and document the accepted Prisma rate-limit fallback plus enablement triggers.

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
- [ ] Enable branch protection for `main` with required CI checks and pull-request review (GitHub reported the branch unprotected on 2026-06-21).

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
- [ ] Verify `support@agentaudit.online` and `sales@agentaudit.online` receive mail and have an owner.

### Transactional Email and Critical Alerts

- [x] Verify the sending domain in Resend and publish valid SPF, DKIM, and DMARC records (domain `agentaudit.online` verified in Resend after adding Hostinger DNS records).
- [x] Configure production `RESEND_API_KEY` and `RESEND_FROM_EMAIL` with a verified sender domain; keep credentials only in Railway (verified locally with `RESEND_FROM_EMAIL=AgentAudit <noreply@agentaudit.online>`; must be set in Railway before next deploy).
- [~] Set and verify a monitored reply-to/support address instead of relying on an unmonitored sender (reply-to is now `support@agentaudit.online` via `SUPPORT_EMAIL`; verify mailbox works).
- [ ] Send a real welcome email from production registration and verify delivery, rendering, plain-text fallback, links, and reply behavior in at least Gmail and Outlook.
- [x] Add and test billing emails for subscription activation, plan change, cancellation, successful renewal, failed payment, and recovery after a failed payment (implemented 2026-06-21; dedupe keys prevent retries from duplicating messages).
- [x] Ensure Stripe webhook retries cannot create duplicate billing emails and every message reflects the committed database state (dedupe keys on `EmailDelivery` + webhook reads committed DB state).
- [x] Send immediate high/critical audit-alert emails only when the organization's email preference and minimum severity allow them (preferences exist in `Organization` and are toggled from the dashboard; severity threshold is now compared correctly).
- [x] Verify single and batch audit submissions produce equivalent alert-email behavior without duplicate notifications.
- [x] Add provider delivery-event handling for delivered, bounced, complained, and suppressed messages; expose failures in logs/monitoring without logging message bodies or secrets (implemented 2026-06-21 via `/api/v1/webhooks/resend`).
- [ ] Define retry and dead-letter behavior for transient email failures so fire-and-forget delivery does not silently lose critical alerts.
- [ ] Add rate limiting or aggregation for alert-email bursts to prevent inbox flooding during a noisy rule or incident.
- [ ] Keep customer prompts/responses, API keys, tokens, and other sensitive payloads out of email subjects and bodies by default.
- [ ] Add automated tests for welcome, billing, audit-alert, preference, deduplication, and provider-failure paths.

## P1: Beta Polish and Developer Experience

These items can run alongside a quiet beta, but should be completed before broader promotion.

### Documentation and Messaging

- [x] README includes a copy/paste flow from registration to a blocked PII audit log.
- [x] Python and TypeScript SDK examples are present.
- [x] LangChain and CrewAI integrations have automated tests.
- [x] A Postman collection is included.
- [ ] Verify the README quickstart against the live deployment from a clean machine.
- [x] Install both published SDK packages from clean environments and verify their primary imports (PyPI `1.0.4`, npm `1.0.2`; checked 2026-06-21).
- [ ] Publish new Python and TypeScript SDK versions containing authoritative `enforcementAction` parsing, then re-verify the installed artifacts.
- [x] Update `ROADMAP.md`: LangChain and Postman are implemented, not planned.
- [x] Replace remaining repository `YOUR_USERNAME` placeholders with the public GitHub URL.
- [x] Align deployment, self-hosting, roadmap, and website pricing language at Pro `$29` / Business `$79`.
- [ ] Re-verify every public documentation and social/community link; remove remaining `href="#"` placeholders and references to missing social/metadata assets.
- [x] Replace README's deleted `BEFORELAUNCH.md` link with this checklist.

### UI and Documentation Experience

- [ ] Define one documentation information architecture for the curated `docs.html` guide and Swagger `/docs`; make their roles and navigation explicit.
- [ ] Add persistent docs navigation with active section state, stable deep links, previous/next navigation, and a useful mobile layout.
- [ ] Add documentation search covering authentication, audit logs, guardrails, agents, alerts, billing, SDKs, errors, rate limits, and webhooks.
- [ ] Add copy buttons and verified request/response examples for every critical endpoint in curl, Python, and TypeScript.
- [ ] Document error bodies, request IDs, pagination, rate-limit headers, quota errors, idempotency expectations, and webhook retry behavior.
- [ ] Ensure documentation examples match the published SDK versions and the production API rather than workspace-only behavior.
- [ ] Replace missing Open Graph/social preview assets and verify page titles, descriptions, canonical URLs, and share previews on every public page.
- [ ] Remove placeholder Twitter/Discord controls or connect them to destinations owned by AgentAudit.
- [ ] Make navigation, pricing, calls-to-action, and authentication state consistent across home, features, integrations, pricing, security, docs, and dashboard pages.
- [ ] Replace dashboard messages such as “check console (F12)” with actionable in-product errors, retry controls, and support/request-ID context.
- [ ] Polish dashboard empty, loading, success, partial-failure, offline, expired-session, and permission-denied states.
- [ ] Add an onboarding path from registration to API-key creation, SDK installation, first audit event, first rule, and verified alert delivery.
- [ ] Give destructive actions clear confirmation, progress, success, and recovery states; preserve keyboard focus when dialogs close.
- [ ] Complete a WCAG 2.2 AA-oriented accessibility pass: semantic landmarks, labels, keyboard navigation, visible focus, contrast, reduced motion, and screen-reader announcements.
- [ ] Verify responsive layouts at phone, tablet, laptop, and wide-desktop sizes, including docs tables/code blocks and dashboard panels.
- [ ] Test the critical UI path on current Chrome, Firefox, Safari, and Edge; record browser-specific defects.
- [ ] Establish a lightweight visual-regression baseline for public pages, docs, authentication, and dashboard states.
- [ ] Measure and improve Core Web Vitals, asset weight, font loading, layout shift, and perceived loading performance.

### Email Preferences, Activity Summaries, and Digests

- [ ] Add clear dashboard controls for immediate audit alerts, minimum severity, billing/account notices, and optional activity summaries.
- [ ] Keep mandatory transactional/security notices separate from optional summaries and promotional mail.
- [ ] Let users choose daily, weekly, or disabled activity summaries plus timezone and delivery day/time.
- [ ] Design overview emails with total audits, blocked/flagged/logged counts, violation rate, top rules, top agents, trend versus the prior period, and dashboard deep links.
- [ ] Define zero-activity, partial-data, delayed-job, and unusually high-volume digest behavior.
- [ ] Generate digest metrics from tenant-scoped aggregate queries and verify totals against the dashboard for the same period.
- [ ] Add a scheduler/worker with idempotent send records so restarts and retries cannot duplicate a digest.
- [ ] Include one-click preference management and standards-compliant unsubscribe handling for optional email categories.
- [ ] Test HTML and plain-text digest templates across desktop/mobile Gmail, Outlook, and Apple Mail with accessible headings and link text.
- [ ] Track digest delivery and engagement at an aggregate level without exposing customer audit content to the email provider.

### Reliability and Observability

- [x] Sentry integration exists and is disabled safely when no DSN is configured.
- [x] Structured logging and request correlation are implemented.
- [x] CI runs lint, build, API tests, Python SDK tests, and TypeScript SDK tests.
- [ ] Configure the production `SENTRY_DSN` and confirm a test exception arrives with release and request context.
- [ ] Configure an external uptime monitor for `/health` and an alert destination.
- [ ] Add alerting for repeated 5xx responses, database failures, and webhook delivery failures.
- [x] Document the deploy rollback procedure and database compatibility boundary.
- [x] Record current last-known-good production commit `4261b7c` (authenticated smoke test passed 2026-06-21; re-confirm during the launch-day runbook).
- [x] Define an interim incident owner and a simple public incident communication process.
- [x] Resolve Dependabot alerts #1 and #2 by eliminating `js-yaml <= 4.1.1` from both `package-lock.json` and `sdk/typescript/package-lock.json` (development scope; patched in `4.2.0`).
- [x] Verify the `js-yaml` override/upgrade does not regress ESLint, Jest, Istanbul coverage tooling, API tests, or TypeScript SDK tests (verified 2026-06-21; `npm run verify` and SDK audit both clean).
- [ ] Re-run root and TypeScript SDK dependency audits and confirm GitHub closes both Dependabot alerts without dismissing them as ignored risk.
- [ ] Review any remaining moderate Jest/Istanbul development-only advisories when upstream publishes a non-regressive fix.

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
| Deployed commit | `4261b7c` (verified 2026-06-21) |
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
| 2026-06-21 | Added the production operations runbook for Railway backups, a non-production restore drill, forward-only rollback, Redis-disabled beta mode, and incident response. Migrations now run in Railway's pre-deploy phase. |
| 2026-06-21 | Clean installs of PyPI `agentaudit-client` 1.0.4 and npm `agentaudit-client` 1.0.2 imported successfully, but registry artifacts predate the authoritative `enforcementAction` fix; fresh SDK releases remain required. |
| 2026-06-21 | Railway `/health` served merged commit `bf77911` with database `up` and Redis `disabled`; all three GitHub checks passed on that commit. GitHub reported `main` is not protected. |
| 2026-06-21 | Authenticated production smoke test passed on `bf77911` after the fixed rate-limit window rolled over. The preceding 429s exposed shared limiter counters; this branch isolates auth, general, and audit namespaces with regression coverage. |
| 2026-06-21 | Production-operations verification passed lint, build, and 21 API suites / 160 tests; local Markdown links and Railway deployment configuration also validated. |
| 2026-06-21 | Dependabot reported two open moderate development-only `js-yaml` alerts: #1 in `package-lock.json` and #2 in `sdk/typescript/package-lock.json`; vulnerable range `<=4.1.1`, patched in `4.2.0`. |
| 2026-06-21 | UI/email inventory confirmed welcome and immediate audit-alert templates exist, while production sender verification, billing lifecycle mail, delivery events/retries, digest scheduling, and several docs/dashboard polish paths remain open. |
| 2026-06-21 | PR #19 merged as `4261b7c`; all three CI jobs passed, Railway served the commit with database `up`, and the authenticated smoke test passed with the rate-limit isolation fix deployed. |
| 2026-06-21 | Resolved both `js-yaml` alerts with `js-yaml@4.2.0` overrides; dashboard error states and loading UI hardened; added billing email templates, `EmailDelivery` tracking, Stripe-webhook deduplication, and a signed Resend delivery-status webhook. Production and local smoke tests passed. Resend domain `agentaudit.online` created and DNS records generated; awaiting DNS publication. |
| 2026-06-21 | Resend domain `agentaudit.online` verified in Hostinger DNS; local smoke test with `RESEND_API_KEY` confirmed welcome and audit-alert emails are accepted by Resend and tracked as `sent` in the `EmailDelivery` table. |
