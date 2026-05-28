<div align="center">

# 🛡️ AgentAudit API

**Real-time guardrails for AI agents. Block PII, policy violations, and risky outputs before they reach users.**

[<img src="https://img.shields.io/badge/version-1.1.0--trace-blue?style=flat-square">](https://agentaudit-api-production.up.railway.app/health)
[<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square">](LICENSE)
[<img src="https://img.shields.io/badge/deploy-Railway-purple?style=flat-square">](https://railway.app/template/agentaudit)
[<img src="https://img.shields.io/badge/status-online-brightgreen?style=flat-square">](https://agentaudit-api-production.up.railway.app/health)

[<img src="https://img.shields.io/badge/Python_SDK-pip%20install%20agentaudit-3776AB?style=for-the-badge&logo=python&logoColor=white">](https://pypi.org/project/agentaudit/)
[<img src="https://img.shields.io/badge/TypeScript_SDK-npm%20i%20@agentaudit/sdk-3178C6?style=for-the-badge&logo=npm&logoColor=white">](https://www.npmjs.com/package/@agentaudit/sdk)

</div>

---

## ✨ Why AgentAudit?

Most AI compliance tools **log violations after they happen**. AgentAudit **blocks them in real-time** — before your agent's output ever reaches a user.

| What Others Do | What AgentAudit Does |
|----------------|----------------------|
| Log PII after it's sent | Block PII **before** delivery |
| Alert on policy violations | **Prevent** policy violations |
| Post-hoc audit reports | Real-time guardrail with audit trails |
| Manual compliance review | One-line SDK, zero config |

---

## 🚀 Live Demo

**API Base URL:** `https://agentaudit-api-production.up.railway.app`

**Landing Page:** [agentaudit-api-production.up.railway.app](https://agentaudit-api-production.up.railway.app/)

**Trace Visualizer:** [agentaudit-api-production.up.railway.app/trace-visualizer.html](https://agentaudit-api-production.up.railway.app/trace-visualizer.html)

Try the interactive demo — paste some text with a fake SSN and watch it get flagged instantly.

---

## 📸 Screenshots

<div align="center">

### Landing Page
![Landing Page](https://via.placeholder.com/800x450/030712/6366f1?text=Landing+Page+Preview)

### Trace Visualizer
![Trace Visualizer](https://via.placeholder.com/800x450/030712/a855f7?text=Trace+Visualizer+Preview)

### API Playground
![API Playground](https://via.placeholder.com/800x450/030712/10b981?text=API+Playground+Preview)

</div>

> **Note:** Replace placeholder images with actual screenshots once available.

- [Features](#-features)
- [Architecture](#%EF%B8%8F-architecture)
- [Quick Start](#-quick-start)
- [SDKs](#-sdks)
- [CrewAI Integration](#-crewai-integration)
- [Compliance Rules](#-compliance-rules)
- [API Reference](#-api-reference)
- [Self-Hosting](#-self-hosting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Features

### Core
- 🚫 **Real-Time Guardrails** — Block violations before delivery, not after
- 🔗 **Agent-to-Agent Audit Trails** — Distributed tracing with `traceId` + `parentSpanId`
- 📊 **6 Compliance Rule Types** — PII, keywords, rate limits, regex, sentiment, custom validators
- 🔔 **Webhook Alerts** — Async delivery to your endpoint on every violation
- 📈 **Compliance Reports** — Export JSON/CSV for any date range

### Integrations
- 🤖 **CrewAI** — Drop-in `AgentAuditObserver` with `guard=True`
- 🔗 **LangChain** — Callback integration
- 🤖 **AutoGPT** — Compatible via API
- 🔌 **OpenAI** — Request/response interception

### DevEx
- 🐍 **Python SDK** — `pip install agentaudit`
- 📘 **TypeScript SDK** — `npm install @agentaudit/sdk`
- 🐳 **Self-Hostable** — Docker, Railway, bare-metal
- 🔑 **API Key + JWT** — Service-to-service + dashboard auth

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   CrewAI    │────▶│  Guardrail   │────▶│  Audit Log  │
│   Agent     │     │  (Real-time) │     │  + Trace    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  Compliance  │
                    │    Rules     │
                    │  (PII/Key/   │
                    │  Regex/etc)  │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Alerts +   │
                    │   Webhooks   │
                    └──────────────┘
```

### Tech Stack
- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (Prisma ORM)
- **Validation:** Zod
- **Testing:** Jest + Supertest
- **Logging:** Pino

---

## ⚡ Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+

### 1. Clone & Install

```bash
git clone https://github.com/AspicyKabob/-agentaudit-api.git
cd -agentaudit-api
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Database Setup

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Start Development

```bash
npm run dev
# API available at http://localhost:8080
```

### Deploy to Railway (One-Click)

[<img src="https://railway.app/button.svg" alt="Deploy on Railway" width="150">](https://railway.app/template/agentaudit)

---

## 📦 SDKs

### Python

```bash
pip install agentaudit
```

```python
from agentaudit import AgentAudit

audit = AgentAudit(api_key="aa_your_key_here")

# Real-time guardrail
result = audit.guardrail(
    action="prompt_submitted",
    prompt="User: My SSN is 123-45-6789",
    response="Here is your account info..."
)

if not result.allowed:
    raise ValueError(f"Blocked: {result.violations}")

# Log with trace support
audit.log(
    action="crewai_task_end",
    trace_id="trace-abc-123",
    parent_span_id="log-parent-456",
    response="Task completed successfully"
)
```

### TypeScript

```bash
npm install @agentaudit/sdk
```

```typescript
import { AgentAudit } from '@agentaudit/sdk';

const audit = new AgentAudit({ apiKey: 'aa_your_key_here' });

const result = await audit.guardrail({
  action: 'prompt_submitted',
  prompt: 'User: My SSN is 123-45-6789',
  response: 'Here is your account info...'
});

if (!result.allowed) {
  throw new Error(`Blocked: ${result.violations.join(', ')}`);
}

await audit.log({
  action: 'crewai_task_end',
  traceId: 'trace-abc-123',
  parentSpanId: 'log-parent-456',
  response: 'Task completed successfully'
});
```

---

## 🤖 CrewAI Integration

```python
from crewai import Crew, Agent, Task
from agentaudit_crewai import AgentAuditObserver

observer = AgentAuditObserver(
    api_key="aa_your_key_here",
    crew_name="Research Crew",
    guard=True  # Enable real-time blocking
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    callbacks=[observer]
)

result = crew.kickoff()
# All tasks automatically audited with trace IDs
# Violations blocked before delivery
```

---

## 🛡️ Compliance Rules

| Rule Type | What It Does | Example |
|-----------|--------------|---------|
| **PII Detection** | Detects SSN, email, credit cards, phone numbers | `123-45-6789` → blocked |
| **Keyword Matching** | Flags specific keywords | "password", "secret" |
| **Rate Limiting** | Alerts on request thresholds | >100 req/min |
| **Regex Matching** | Custom patterns (500-char max for ReDoS protection) | `/\b\d{3}-\d{2}-\d{4}\b/` |
| **Sentiment Analysis** | Flags toxic/hostile text | AFINN-165 dictionary |
| **Custom Validators** | Sandbox JS functions | `vm.runInNewContext`, 100ms timeout |

### Pre-Built Rule Packs

- 🏥 **Healthcare (HIPAA)** — SSN, PHI, Medical IDs, HIPAA keywords
- 💰 **Finance (SOX/PCI)** — Credit cards, bank accounts, insider trading, SOX keywords
- 🔒 **Data Protection (GDPR/CCPA)** — Emails, phone numbers, addresses, GDPR keywords

---

## 📚 API Reference

### Authentication

| Header | Value |
|--------|-------|
| `X-API-Key` | `aa_...` — Service-to-service |
| `Authorization` | `Bearer jwt_token` — Dashboard |

### Key Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | Public | Create organization |
| `POST` | `/api/v1/auth/login` | Public | Authenticate |
| `GET` | `/api/v1/auth/me` | JWT | Get current org |
| `POST` | `/api/v1/auth/api-keys` | JWT | Generate API key |
| `POST` | `/api/v1/audit-logs` | API Key | Submit audit log |
| `GET` | `/api/v1/audit-logs` | JWT | Query logs |
| `GET` | `/api/v1/audit-logs/trace/:traceId` | JWT | Query by trace |
| `GET` | `/api/v1/audit-logs/:id/chain` | JWT | Reconstruct chain |
| `GET` | `/api/v1/compliance-rules` | JWT | List rules |
| `POST` | `/api/v1/compliance-rules` | JWT | Create rule |
| `GET` | `/api/v1/alerts` | JWT | List alerts |
| `PATCH` | `/api/v1/alerts/:id/resolve` | JWT | Resolve alert |

### Example: Submit with Trace

```bash
curl -X POST https://agentaudit-api-production.up.railway.app/api/v1/audit-logs \
  -H "X-API-Key: aa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "crewai_task_end",
    "traceId": "trace-abc-123",
    "parentSpanId": "log-parent-456",
    "response": "Task completed successfully",
    "metadata": {
      "model": "gpt-4",
      "crew": "Research Crew",
      "task_id": "task_001"
    }
  }'
```

### Example: Query Trace

```bash
curl -X GET "https://agentaudit-api-production.up.railway.app/api/v1/audit-logs/trace/trace-abc-123" \
  -H "Authorization: Bearer your_jwt_token_here"
```

### Example: Reconstruct Chain

```bash
curl -X GET "https://agentaudit-api-production.up.railway.app/api/v1/audit-logs/log-parent-456/chain" \
  -H "Authorization: Bearer your_jwt_token_here"
```

---

## 🐳 Self-Hosting

### Docker Compose (Recommended)

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your secrets

# Start services
docker-compose up -d

# Run migrations
docker-compose exec api npx prisma migrate deploy
```

See [docs/self-hosting.md](docs/self-hosting.md) for full guides covering:
- Docker deployment
- Bare-metal setup
- Reverse proxies (nginx, Caddy)
- SSL/TLS configuration
- Environment variables reference

---

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for JWT signing | — |
| `JWT_ACCESS_EXPIRATION` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiry | `7d` |
| `API_KEY_SALT` | Salt for API key hashing | — |
| `LOG_LEVEL` | Logging level | `info` |
| `STRIPE_SECRET_KEY` | Stripe secret (for billing) | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | — |

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

---

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contribute

```bash
# Fork and clone
git clone https://github.com/your-username/-agentaudit-api.git
cd -agentaudit-api

# Install dependencies
npm install

# Create a branch
git checkout -b feature/my-feature

# Run tests
npm test

# Commit and push
git commit -m "feat: add my feature"
git push origin feature/my-feature
```

---

## 🔒 Security

- API keys are hashed with bcrypt + salt
- JWT tokens with configurable expiration
- Rate limiting on auth and audit endpoints
- Regex patterns limited to 500 chars (ReDoS protection)
- Custom validators sandboxed with `vm.runInNewContext` + 100ms timeout

Report security issues privately to: security@agentaudit.dev

---

## 📜 License

MIT © [AgentAudit](https://github.com/AspicyKabob/-agentaudit-api)

---

<div align="center">

**[🌐 Website](https://agentaudit-api-production.up.railway.app/) · [📖 Docs](https://agentaudit-api-production.up.railway.app/) · [🐦 Twitter](https://twitter.com/agentaudit) · [💬 Discord](https://discord.gg/agentaudit)**

Built with ❤️ for the AI agent community

</div>
