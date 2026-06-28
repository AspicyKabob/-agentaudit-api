# Future Work: AgentAudit Edge Ideas

This document captures the product ideas that can move AgentAudit from a solid compliance layer to a differentiated, intelligent compliance platform. The items below are not committed to the current beta roadmap; they are candidates for prioritization based on user feedback, enterprise demand, and engineering capacity.

## Current Position

AgentAudit is already a working guardrail and audit layer for AI agents. It can:

- Evaluate prompts and responses against configurable rules.
- Enforce `block`, `flag`, or `log` actions in real time.
- Maintain audit trails, API keys, and dashboard controls.
- Send transactional alerts and manage billing through Stripe.

The goal of the future work below is to give AgentAudit a clear edge in a crowded market of AI safety and observability tools.

---

## 1. Explainability, Not Just Blocking

**What it is:** When a rule fires, show the user exactly why — the matching span, the rule name, the risk severity, and a suggested safe rewrite.

**Why it gives an edge:** Pure blockers create friction. Developers adopt tools faster when the tool teaches them. Explainability also helps compliance teams produce evidence for auditors.

**Signals of success:** Higher rule adoption, fewer support tickets asking “why was this blocked?”

---

## 2. One-Click Compliance Packs

**What it is:** Pre-built rule packs for common frameworks: SOC 2, HIPAA, GDPR, PCI-DSS, child safety, prompt injection, and finance-specific controls.

**Why it gives an edge:** Most users do not know how to write compliance rules. A “Turn on SOC 2 mode” button removes the activation barrier and makes the product immediately credible to enterprise buyers.

**Signals of success:** New users enable a pack within the first session; enterprise trials reference the packs as a reason for evaluation.

---

## 3. Human-in-the-Loop Review Queue

**What it is:** A dashboard queue for content that is flagged but not auto-blocked. A human reviewer can approve, reject, or escalate the item, and the decision feeds back into rule tuning.

**Why it gives an edge:** Fully automated guardrails are brittle for high-stakes use cases. A review queue makes AgentAudit acceptable to legal, healthcare, finance, and customer-facing teams.

**Signals of success:** Teams set rules to “flag” rather than “block” and use the queue as a daily workflow.

---

## 4. Agent-Aware Tracing

**What it is:** When a violation occurs inside a multi-agent chain (LangGraph, CrewAI, AutoGPT), show the full chain — which agent produced the output, what upstream agents passed in, and where the guardrail intervened.

**Why it gives an edge:** Existing observability tools are request-level. Agent-level causality is the missing piece for debugging compliance failures in compound AI systems.

**Signals of success:** Users can trace a blocked response back to the originating agent and prompt.

---

## 5. Prompt Injection and Adversarial Detection

**What it is:** Detection for jailbreaks, indirect prompt injection, role-play attacks, and data-exfiltration attempts beyond simple PII and keyword matching.

**Why it gives an edge:** PII detection is becoming a commodity. Adversarial robustness is where real security differentiation lives. This is the feature most likely to be cited by security-conscious buyers.

**Signals of success:** A public benchmark or red-team report showing lower false negatives versus keyword-only approaches.

---

## 6. Community Rule Marketplace

**What it is:** A public gallery where users publish, rate, and import compliance rules and packs. Think Terraform Registry or ESLint rules, but for AI guardrails.

**Why it gives an edge:** The marketplace turns AgentAudit into a platform. The best rules become a network effect: more users → more rules → more value for all users.

**Signals of success:** Users spend more time browsing rules than writing their own; third-party vendors publish packs.

---

## 7. Latency and Cost Transparency

**What it is:** Per-rule and per-call metrics showing how much each guardrail adds to inference time and cost. Include breakdowns by rule type, severity, and agent.

**Why it gives an edge:** Enterprises will not deploy guardrails without understanding the overhead. Making the cost visible builds trust and lets users optimize their rule sets.

**Signals of success:** Users disable or optimize high-cost rules based on the dashboard; the metric appears in pricing conversations.

---

## 8. Trust Center, Public Status, and Audit Reports

**What it is:** A public trust center with security whitepapers, penetration-test summaries, a public status page, and downloadable compliance reports for customers to share with their own auditors.

**Why it gives an edge:** For B2B SaaS, procurement and security teams are often the real buyers. A trust center shortens the vendor-review process and signals maturity.

**Signals of success:** Prospects ask fewer one-off security questions; deals move faster after receiving the trust center link.

---

## Additional Candidates

These ideas are worth tracking but are lower priority or more speculative than the eight above.

- **Native Slack Integration:** See full spec below.
- **GitHub OAuth login:** Allow users to sign up and log in with their GitHub account. Reduces onboarding friction for developer-focused teams, and can automatically pull organization name and public email. Implementation needs a backend OAuth flow, a `provider` field on the organization record, email matching / duplicate handling, and an optional "link account" path for existing email users.
- **Data residency / EU deployment:** Offer regional hosting for GDPR-sensitive customers.
- **SLA and enterprise support:** Dedicated success engineer, guaranteed response times, and custom rule development.
- **Built-in model evaluation / red-teaming:** Run automated adversarial test suites against a customer’s agent and report weakness.
- **Fine-grained RBAC:** Organization-level roles, read-only auditors, and approval workflows.
- **Integrations directory:** One-click plugins for LangGraph, AutoGPT, Flowise, n8n, and major LLM providers.
- **Automated API key suspension on repeated violations:** A rule-level option (e.g. `action: "suspend_key_after_n_violations"`) that automatically revokes or suspends an API key once a configurable threshold of compliance violations is reached within a rolling time window. Intended for high-stakes production environments where human review latency is not acceptable. Key suspension state would be visible in the dashboard with a one-click reinstatement flow. Pairs naturally with the Human-in-the-Loop Review Queue (item 3 above) — suspension holds the agent while a human reviewer decides whether to reinstate or permanently revoke.

---

## How to Use This Document

1. **Prioritize by customer signal.** When an enterprise trial asks for one of these items, move it up.
2. **Bundle for launch.** Explainability + compliance packs + trust center would make a strong “enterprise-ready” launch story.
3. **Validate before building.** Each idea should be tested with a lightweight prototype or landing-page test before full engineering investment.

---

## Pricing Tier "Coming Soon" Features

These are the features currently labelled "Coming soon" on the pricing page. Each one is scoped below with what it means to build it, estimated engineering time, infrastructure cost, and the user signal needed to validate it.

### 1. Agent limits (Free: 1 agent / Pro: 10 agents / Business: Unlimited)

**What it is:**
Right now any API key can log events from any number of named agents. This feature means counting distinct `agentId` values per organization per billing period and enforcing a hard cap — blocking or warning when the limit is reached.

**What needs to be built:**
- A counter (database or Redis) tracking unique `agentId`s per organization per billing cycle.
- Middleware that checks the count on every audit submission and returns `429 Quota Exceeded` when the cap is hit.
- A dashboard widget showing agents used vs. allowed.
- Stripe plan metadata or entitlements storing the per-plan limit.

**Build time:** 1–2 weeks  
**Infrastructure cost:** $0 additional  
**Users needed to validate:** 20–50 paying Pro users hitting the 10-agent cap

---

### 2. Log retention (Free: 7-day / Pro: 1-year / Business: 7-year)

**What it is:**
Automatic deletion of audit logs older than the plan's retention window. The 7-year Business tier is relevant for financial and healthcare compliance (SOX, HIPAA).

**What needs to be built:**
- A scheduled background job (cron) that runs nightly and deletes `AuditLog` rows older than the organization's retention window.
- A `retentionDays` field on the organization or plan record.
- A dashboard notice showing "your logs expire in X days."
- For Business/Enterprise: an export-before-delete or cold-storage archival option (S3 or equivalent).

**Build time:** 2–3 weeks (basic deletion) + 2 additional weeks for archival  
**Infrastructure cost:** $50–200/mo in storage at scale  
**Users needed to validate:** Any paying customer; regulated-industry customers (healthcare, finance) will drive this requirement loudest.

---

### 3. Advanced analytics (Business plan)

**What it is:**
A richer dashboard layer on top of the audit log — trend charts, violation rate over time, top offending agents, compliance score by rule, and heatmaps by time of day and day of week.

**What needs to be built:**
- Aggregation queries (or materialized views) on the `AuditLog` table grouping by agent, rule, action, and time bucket.
- A charting library in the dashboard (Chart.js, Recharts, or similar).
- An analytics API endpoint returning pre-aggregated data.
- Optionally: a dedicated analytics database (ClickHouse, Timescale) if query performance degrades at scale.

**Build time:** 2–4 weeks (frontend) + 4–6 additional weeks if a dedicated analytics store is required  
**Infrastructure cost:** $50–300/mo for an analytics database  
**Users needed to validate:** 5–10 Business-tier customers with 50k+ events/month to make the charts meaningful.

---

### 4. SOC 2 Type II Certification

**What it is:**
SOC 2 (System and Organization Controls 2) is a formal third-party audit conducted by a licensed CPA firm that verifies a SaaS company's security, availability, processing integrity, confidentiality, and privacy controls meet the AICPA Trust Service Criteria. Type I is a point-in-time snapshot. Type II covers a 6–12 month observation window and is the version enterprise procurement teams actually require.

**Why it matters:**
Enterprise customers in healthcare, finance, and government cannot sign contracts with vendors who have not completed SOC 2 Type II. It is typically the first hard blocker in a $10k+/year deal. A completed report also shortens vendor review processes from months to days.

**What AgentAudit already has (counts toward SOC 2):**
- Comprehensive audit trails (literally the core product)
- Encryption in transit (TLS) and at rest (PostgreSQL/Railway)
- Row-level data isolation per organization
- API key hashing and rate limiting
- CORS and Helmet.js security headers
- Open-source and independently auditable codebase
- Incident reporting contact already published

**What still needs to be built or documented:**

*Technical controls:*
- Formal penetration test by an approved vendor (~$8–15k)
- Vulnerability scanning pipeline (e.g. Snyk, Dependabot alerts enforced)
- Intrusion detection / anomaly alerting on production infrastructure
- Formal disaster recovery and backup verification process

*Organizational controls (the hard part):*
- Written information security policy, acceptable use policy, and incident response plan
- Employee security awareness training records
- Background check process for all personnel with production access
- Formal access provisioning / deprovisioning process with evidence
- MDM (mobile device management) on all employee devices
- Vendor risk assessments for Railway, Stripe, Resend, and any other sub-processors
- Business continuity and disaster recovery plan (BCP/DRP)
- Regular internal access reviews (quarterly evidence required for Type II)
- Change management process with documented approvals

*Readiness infrastructure:*
- A compliance management tool to collect and store evidence continuously (e.g. Vanta, Drata, Sprinto — $10–20k/yr)
- A public trust center page listing sub-processors, security practices, and the completed report

**Capital required:**

| Item | One-time cost | Annual recurring |
|---|---|---|
| Compliance readiness platform (Vanta / Drata) | — | $10,000–20,000/yr |
| Penetration test (external vendor) | $8,000–15,000 | $8,000–15,000/yr to maintain |
| CPA auditor fees (Type II) | $25,000–50,000 | $20,000–40,000/yr renewal |
| Legal review (BAA templates, DPA, security addendum) | $3,000–8,000 | $1,000–3,000/yr |
| Engineering time (controls implementation) | ~8–12 weeks eng | Ongoing maintenance |
| **Total first-year estimate** | **$46,000–93,000** | **$39,000–78,000/yr** |

Engineering time estimate: 8–12 weeks of a senior engineer's time to implement technical controls, integrate with the compliance platform, and produce evidence artifacts.

**Timeline:**
- Months 1–2: Gap assessment, policy writing, compliance platform onboarded, technical controls implemented
- Months 3–4: Penetration test completed, all controls live and evidence flowing
- Months 5–10: Type II observation window (controls must hold with continuous evidence)
- Months 11–12: Auditor fieldwork and report issuance
- **Total: ~12 months from start to completed Type II report**

**Trigger to start:**
Do not pursue SOC 2 until at least one of these is true:
1. An enterprise prospect ($10k+/yr ARR) has explicitly blocked on it
2. ARR reaches ~$50k (revenue covers first-year cost without strain)
3. A regulated-industry vertical (healthcare, finance, government) becomes a target market

**Build time:** 12 months end-to-end  
**Capital needed:** $46,000–93,000 first year; $39,000–78,000/yr to maintain  
**Users needed to validate:** 1 enterprise prospect explicitly requiring it, or $50k ARR

---

### Recommended build order

| Priority | Feature | Build time | Capital needed | Users to validate |
|---|---|---|---|---|
| 1 | Agent limits | 1–2 weeks | $0 | 20–50 Pro |
| 2 | Log retention | 2–3 weeks + archival | $50–200/mo infra | Any paying |
| 3 | Advanced analytics | 2–4 weeks + analytics DB | $50–300/mo infra | 5–10 Business |
| 4 | SOC 2 Type II | 12 months end-to-end | $46k–93k first year | 1 enterprise prospect or $50k ARR |

**Rationale:** Agent limits first — pure backend, high perceived value for Pro, zero infra cost. Retention second — required for regulated industries and unlocks enterprise conversations. Analytics third — biggest engineering lift; validate demand before committing. SOC 2 last — only pursue when an enterprise deal is blocked on it or ARR supports the cost.

---

---

## Native Slack Integration

### What it is

A first-class Slack integration that goes beyond the current outbound webhook support. Today, users can point their webhook URL at a Slack Incoming Webhook — it works, but it requires the user to set up the webhook manually, there is no Slack-aware formatting, and there is no bidirectional flow. This feature replaces that with a proper Slack App that AgentAudit publishes to the Slack App Directory.

### Current state

Right now: users can set a `webhookUrl` in their org profile. If they point it at a Slack Incoming Webhook URL, alerts will arrive in Slack as plain JSON payloads. There is no Slack-specific formatting, no rich message blocks, no channel routing, and no ability to act on alerts from within Slack.

### What needs to be built

**Backend:**
- Register AgentAudit as a Slack App in the Slack Developer portal (OAuth 2.0, `incoming-webhook` and `chat:write` bot scopes)
- Add a Slack OAuth install flow (`GET /api/v1/integrations/slack/install` → Slack OAuth → `GET /api/v1/integrations/slack/callback`) that stores the workspace's `access_token`, `bot_user_id`, and default `channel_id` on the organization record
- Replace the plain JSON webhook payload with Slack Block Kit messages: an accent-coloured header block, a fields block showing agent name, rule triggered, severity, and action taken, a truncated prompt/response preview in a context block, and a "View in Dashboard" button
- Add per-severity channel routing: organizations can configure a different channel for `critical` vs `warning` alerts
- Add a "Resolve from Slack" action button that calls `PATCH /api/v1/alerts/:id/resolve` directly from the Slack message so on-call engineers do not need to leave Slack
- Add a test-message endpoint (`POST /api/v1/integrations/slack/test`) so users can verify the integration is wired up correctly

**Database:**
- Add `slackAccessToken`, `slackTeamId`, `slackChannelId`, `slackChannelCritical`, `slackChannelWarning` fields to the `Organization` model
- Migrate existing `webhookUrl`-based Slack users (those whose `webhookUrl` starts with `hooks.slack.com`) to the new OAuth flow with a migration guide

**Dashboard:**
- "Connect Slack" button on the Settings → Notifications page that initiates the OAuth flow
- Channel picker once connected
- "Disconnect" button and connection status indicator
- Preview of what the alert messages look like

**Slack App Directory listing:**
- Privacy policy, support contact, and app description
- Pass Slack's app review (typically 1–3 weeks for first submission)

### Why it matters

Slack is where engineering and on-call teams live. A native integration with rich formatting and one-click resolve reduces the time from "alert fired" to "alert resolved" — which is the core value proposition of AgentAudit's alerting feature. Users who have to leave Slack, log into the dashboard, find the alert, and click resolve are users who eventually stop paying attention to alerts.

The current generic webhook works, but it looks like a developer tool, not a product. A proper Slack integration looks like a product.

### Security considerations

- OAuth tokens must be encrypted at rest (same standard as existing API key hashing)
- The "Resolve from Slack" action must use Slack's signed request verification (`X-Slack-Signature` + `X-Slack-Request-Timestamp`) — not trust the incoming payload blindly
- SSRF protection already in place for outbound webhooks applies; the Slack API client bypasses the generic webhook path
- Tokens scoped to minimum required: `incoming-webhook` + `chat:write` only; no reading of Slack messages

### Capital required

| Item | Cost |
|---|---|
| Slack App registration | Free |
| Slack App Directory review | Free (time cost: 1–3 weeks) |
| Engineering time | ~3–4 weeks (backend + dashboard) |
| Additional infrastructure | $0 (no new services needed) |

### Trigger to start

- 20+ users ask for Slack integration via support or feedback
- A Pro/Business deal stalls because the team lives in Slack
- Competitor releases a native Slack integration

**Build time:** 3–4 weeks  
**Capital needed:** $0 direct cost; ~3–4 weeks of engineering time  
**Users needed to validate:** 10–20 users requesting it, or 1 deal blocked on it

---

## Last Updated

June 28, 2026
