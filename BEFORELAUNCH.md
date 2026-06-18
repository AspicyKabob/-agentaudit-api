# Before Launch Checklist

This document tracks the remaining work before AgentAudit should be considered ready for a real production launch.

## Launch Readiness Recommendation

Do not launch with real customer production data until the **Must Fix Before Launch** section is complete.

The codebase is close enough for a controlled demo or private beta, but a compliance/guardrail product has a higher trust bar than a normal SaaS API. Correct blocking behavior, secret safety, SSRF protection, quota accuracy, and repeatable verification need to be solid before charging customers or marketing this as production-ready.

## Must Fix Before Launch

### 1. Production Secret Guard

- Refuse to boot in production when required secrets or URLs are still placeholders.
- At minimum validate:
  - `JWT_SECRET`
  - `API_KEY_SALT`
  - `DATABASE_URL`
  - Stripe secrets and price IDs when billing is enabled
- Production should fail fast instead of silently using known defaults.

### 2. Remove Committed or Generated Secrets From Docs

- Remove generated-looking secrets from `PRODUCTION_CHECKLIST.md`.
- Rotate any value that may have been copied into a real environment.
- Documentation should instruct operators how to generate secrets, not include reusable examples that look production-ready.

### 3. Webhook SSRF Protection

- Customer-configured webhook URLs must not allow requests to internal infrastructure.
- Require `https://`.
- Reject localhost, loopback, private ranges, link-local ranges, and cloud metadata IPs.
- Consider DNS resolution checks or an SSRF-safe fetch wrapper.

### 4. Python SDK Guardrail Correctness

- The Python SDK must use the server's authoritative `enforcementAction`.
- If the API says `block`, SDK callers must receive `allowed=False` regardless of severity label text.
- TypeScript and Python SDK behavior should match.

### 5. Regex ReDoS Protection

- User-provided regex compliance rules must not run unbounded on Node's event loop.
- Use RE2 or evaluate regex rules in an isolated worker with hard timeout limits.
- A malicious or accidental catastrophic regex must not be able to stall all tenants.

### 6. Billing and Quota Correctness

- Enforce a Stripe price allowlist.
- Maintain deterministic `priceId -> plan` mapping.
- Ensure monthly quotas actually reset or are calculated from a billing-period window.
- Make quota checks atomic under concurrent requests.
- Do not charge customers until plan assignment and quota behavior are predictable.

### 7. Lint, Typecheck, and Test Reliability

- Make `npm run lint` actually work by adding/repairing ESLint config.
- Resolve test type drift noted in the review.
- Ensure CI runs build and tests reliably without hiding failures.
- Remove `--passWithNoTests` if tests are required for launch confidence.

## Polish Before Public Beta

### 1. Align Product Messaging

- Make README, roadmap, deployment docs, and pricing language agree.
- Clearly label the product as demo, private beta, public beta, or production SaaS.
- Avoid claiming enterprise readiness before enterprise controls exist.

### 2. Remove Repo Cruft

- Remove stale backup files such as `Dockerfile.bak` if no longer needed.
- Remove or consolidate duplicate SDK directories.
- Keep generated artifacts only when intentionally deployed from the repo.

### 3. Harden Error Responses

- Do not expose raw internal 500 errors to API clients.
- Use stable typed errors with explicit status codes.
- Keep detailed internal errors in logs/observability, not public responses.

### 4. Improve Observability

- Add error tracking such as Sentry or equivalent.
- Add request IDs/correlation IDs.
- Track webhook delivery failures and retry outcomes.
- Add uptime checks and basic production dashboards.

### 5. Tighten First-Run Developer Experience

- Provide one copy/paste quickstart from signup to first audit log.
- Include an obvious PII-blocking example.
- Keep the Postman collection and SDK examples aligned with the deployed API.

## Good Additions, Not Launch Blockers

- Dashboard analytics.
- Slack or Teams alert delivery.
- SOC 2 preparation documentation.
- SSO/SCIM.
- Configurable retention policies.
- Log immutability/hash chaining.
- Public status page.

## Take Away or Defer

- Do not market this as enterprise-compliance-ready until hardening is complete.
- Do not enable production billing until Stripe plan mapping and quotas are fixed.
- Do not prioritize advanced analytics before the guardrail path is unquestionably correct.
- Do not keep duplicate SDK folders or stale backup files in the repo.

## Suggested Launch Sequence

1. **Private Beta**: complete all must-fix items except optional billing if billing remains disabled.
2. **Public Developer Beta**: finish docs, DX polish, observability, and repo cleanup.
3. **Paid Production**: verify billing, quotas, support flows, and operational monitoring.
4. **Enterprise Positioning**: add retention controls, immutability, SSO/SCIM, SOC 2 path, and formal security review.
