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

### Recommended build order

| Priority | Feature | Build time | Infra cost/mo | Users to validate |
|---|---|---|---|---|
| 1 | Agent limits | 1–2 weeks | $0 | 20–50 Pro |
| 2 | Log retention | 2–3 weeks + archival | $50–200 | Any paying |
| 3 | Advanced analytics | 2–4 weeks + analytics DB | $50–300 | 5–10 Business |

**Rationale:** Agent limits first — pure backend, high perceived value for Pro, zero infra cost. Retention second — required for regulated industries and unlocks enterprise conversations. Analytics last — biggest engineering lift; validate demand before committing.

---

## Last Updated

June 23, 2026
