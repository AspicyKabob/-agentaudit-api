# AgentAudit API

A production-ready REST API for AI agent audit logging and compliance monitoring.

## Features

- **Agent Management**: Register and manage AI agents (LangChain, CrewAI, AutoGPT, custom)
- **Audit Logging**: Submit structured audit logs with prompts, responses, and metadata
- **Compliance Rules**: Configure rules for PII detection, keyword matching, rate limiting, regex matching, sentiment analysis, and custom validators
- **Compliance Reports**: Generate and download audit reports (JSON, CSV)
- **Alert System**: Real-time compliance violation alerts
- **MCP Compatible**: Machine-consumable API schema for AI agents
- **API Key Authentication**: Service-to-service authentication for agents
- **JWT Authentication**: Dashboard authentication for organizations
- **Self-Hostable**: Deploy on your own infrastructure with Docker or bare-metal

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

### API Endpoints

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
| `GET /api/v1/compliance-rules` | JWT | List rules |
| `POST /api/v1/compliance-rules` | JWT | Create rule |
| `GET /api/v1/reports` | JWT | List reports |
| `POST /api/v1/reports` | JWT | Generate report |
| `GET /api/v1/alerts` | JWT | List alerts |
| `PATCH /api/v1/alerts/:id/resolve` | JWT | Resolve alert |
| `GET /mcp/v1/schema` | Public | MCP schema |

### Example: Submitting an Audit Log

```bash
curl -X POST http://localhost:3000/api/v1/audit-logs \
  -H "X-API-Key: aa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "prompt_submitted",
    "prompt": "Analyze customer feedback for Q3",
    "response": "The analysis shows positive sentiment...",
    "metadata": {
      "model": "gpt-4",
      "tokens": 250,
      "latency_ms": 1200
    }
  }'
```

### Example: Querying Audit Logs

```bash
curl -X GET "http://localhost:3000/api/v1/audit-logs?page=1&limit=10" \
  -H "Authorization: Bearer your_jwt_token_here"
```

### Compliance Rules

The API supports six types of compliance rules:

1. **PII Detection**: Automatically detects social security numbers, emails, credit cards, phone numbers
2. **Keyword Matching**: Flags prompts/responses containing specific keywords
3. **Rate Limiting**: Alerts when agent exceeds configured request thresholds
4. **Regex Matching**: Custom regular expression patterns for any text format
5. **Sentiment Analysis**: Flags overly negative, toxic, or hostile text in prompts/responses
6. **Custom Validators**: User-defined JavaScript functions evaluated in a sandboxed environment

### Self-Hosting

Deploy AgentAudit on your own infrastructure:

```bash
# Quick start with Docker Compose
cp .env.example .env
# Edit .env with your secrets
docker-compose up -d
docker-compose exec api npx prisma migrate deploy
```

See [docs/self-hosting.md](docs/self-hosting.md) for full guides covering Docker, bare-metal, reverse proxies, SSL, and configuration options.

### Running Tests

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | Secret for JWT signing | - |
| `JWT_ACCESS_EXPIRATION` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiry | `7d` |
| `API_KEY_SALT` | Salt for API key hashing | - |
| `LOG_LEVEL` | Logging level | `info` |

## License

MIT
