# AgentAudit API

A production-ready REST API for AI agent audit logging, real-time guardrails, and compliance monitoring.

## Features

- **Real-Time Guardrails**: Block PII, forbidden keywords, and policy violations before they reach users — not just log them after the fact
- **Agent-to-Agent Audit Trails**: Distributed tracing for multi-agent workflows. Track CrewAI crews, LangChain chains, and custom agents with trace IDs and parent-child span linking
- **6 Compliance Rule Types**: PII detection, keyword matching, rate limiting, regex matching, sentiment analysis, and custom sandboxed validators
- **Compliance Reports**: Generate and download audit reports (JSON, CSV) for any date range
- **Alert System**: Real-time compliance violation alerts
- **SDKs**: Drop-in Python and TypeScript SDKs with one-line integration
- **CrewAI Integration**: Automatic task-level auditing with built-in guardrails and trace tracking
- **MCP Compatible**: Machine-consumable API schema for AI agents
- **Self-Hostable**: Deploy on your own infrastructure with Docker or bare-metal
- **API Key + JWT Authentication**: Service-to-service auth for agents, dashboard auth for organizations

## Tech Stack

- Node.js 20+ with TypeScript
- Express.js
- Prisma ORM with PostgreSQL
- Zod for validation
- Jest + Supertest for testing
- Pino for logging

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

The API will be available at `http://localhost:8080`

### Deploy to Railway (One-Click)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/agentaudit)

Or deploy manually:
```bash
git clone https://github.com/AspicyKabob/-agentaudit-api.git
cd -agentaudit-api
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
npm start
```

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/auth/register` | Public | Create organization |
| `POST /api/v1/auth/login` | Public | Authenticate |
| `GET /api/v1/auth/me` | JWT | Get current org |
| `POST /api/v1/auth/api-keys` | JWT | Generate API key |
| `GET /api/v1/agents` | JWT | List agents |
| `POST /api/v1/agents` | JWT | Register agent |
| `POST /api/v1/audit-logs` | API Key | Submit audit log |
| `GET /api/v1/audit-logs` | JWT | Query audit logs |
| `GET /api/v1/audit-logs/export` | JWT | Export logs |
| `GET /api/v1/audit-logs/trace/:traceId` | JWT | Query logs by trace ID |
| `GET /api/v1/audit-logs/:id/chain` | JWT | Reconstruct agent chain |
| `GET /api/v1/compliance-rules` | JWT | List rules |
| `POST /api/v1/compliance-rules` | JWT | Create rule |
| `GET /api/v1/reports` | JWT | List reports |
| `POST /api/v1/reports` | JWT | Generate report |
| `GET /api/v1/alerts` | JWT | List alerts |
| `PATCH /api/v1/alerts/:id/resolve` | JWT | Resolve alert |
| `GET /mcp/v1/schema` | Public | MCP schema |

### Example: Submitting an Audit Log with Trace

```bash
curl -X POST https://agentaudit-api-production.up.railway.app/api/v1/audit-logs \
  -H "X-API-Key: aa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "crewai_task_end",
    "prompt": "Research AI compliance",
    "response": "Key regulations include...",
    "traceId": "trace-abc-123",
    "parentSpanId": "log-parent-456",
    "metadata": {
      "model": "gpt-4",
      "crew": "Research Crew",
      "task_id": "task_001"
    }
  }'
```

### Example: Querying a Trace

```bash
curl -X GET "https://agentaudit-api-production.up.railway.app/api/v1/audit-logs/trace/trace-abc-123" \
  -H "Authorization: Bearer your_jwt_token_here"
```

### Example: Reconstructing an Agent Chain

```bash
curl -X GET "https://agentaudit-api-production.up.railway.app/api/v1/audit-logs/log-parent-456/chain" \
  -H "Authorization: Bearer your_jwt_token_here"
```

## SDKs

### Python SDK

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

### TypeScript SDK

```bash
npm install @agentaudit/sdk
```

```typescript
import { AgentAudit } from '@agentaudit/sdk';

const audit = new AgentAudit({ apiKey: 'aa_your_key_here' });

// Real-time guardrail
const result = await audit.guardrail({
  action: 'prompt_submitted',
  prompt: 'User: My SSN is 123-45-6789',
  response: 'Here is your account info...'
});

if (!result.allowed) {
  throw new Error(`Blocked: ${result.violations.join(', ')}`);
}

// Log with trace support
await audit.log({
  action: 'crewai_task_end',
  traceId: 'trace-abc-123',
  parentSpanId: 'log-parent-456',
  response: 'Task completed successfully'
});
```

## CrewAI Integration

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

## Compliance Rules

The API supports six types of compliance rules:

1. **PII Detection**: Automatically detects social security numbers, emails, credit cards, phone numbers
2. **Keyword Matching**: Flags prompts/responses containing specific keywords
3. **Rate Limiting**: Alerts when agent exceeds configured request thresholds
4. **Regex Matching**: Custom regular expression patterns (500-char max for ReDoS protection)
5. **Sentiment Analysis**: Flags overly negative, toxic, or hostile text using AFINN-165 dictionary
6. **Custom Validators**: User-defined JavaScript functions evaluated in a sandboxed `vm.runInNewContext` with 100ms timeout

## Self-Hosting

Deploy AgentAudit on your own infrastructure:

```bash
# Quick start with Docker Compose
cp .env.example .env
# Edit .env with your secrets
docker-compose up -d
docker-compose exec api npx prisma migrate deploy
```

See [docs/self-hosting.md](docs/self-hosting.md) for full guides covering Docker, bare-metal, reverse proxies, SSL, and configuration options.

## Running Tests

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | Secret for JWT signing | - |
| `JWT_ACCESS_EXPIRATION` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiry | `7d` |
| `API_KEY_SALT` | Salt for API key hashing | - |
| `LOG_LEVEL` | Logging level | `info` |
| `STRIPE_SECRET_KEY` | Stripe secret (for billing) | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | - |

## License

MIT
