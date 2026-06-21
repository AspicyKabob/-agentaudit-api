# Self-Hosting AgentAudit

Deploy AgentAudit on your own infrastructure. You control your data, your stack, and your compliance pipeline.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Docker Compose)](#quick-start-docker-compose)
3. [Docker Compose Reference](#docker-compose-reference)
4. [Bare-Metal / VPS](#bare-metal--vps)
5. [Configuration](#configuration)
6. [Optional Features](#optional-features)
   - [Billing](#billing)
   - [Background Workers](#background-workers)
   - [Redis](#redis)
7. [Reverse Proxy & SSL](#reverse-proxy--ssl)
8. [Updating](#updating)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** 20+ (bare-metal only)
- **PostgreSQL** 15+ (or use the Docker Compose stack)
- **npm** or **Docker & Docker Compose**
- 1 GB RAM minimum (2 GB recommended)
- Domain name (for production)

---

## Quick Start (Docker Compose)

The fastest way to self-host is with Docker Compose.

```bash
# 1. Clone the repository
git clone https://github.com/AspicyKabob/-agentaudit-api.git
cd agentaudit-api

# 2. Create environment file
cp .env.example .env

# 3. Generate secrets and update .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# Paste the outputs into .env as JWT_SECRET and API_KEY_SALT

# 4. Start the stack
docker-compose up -d

# 5. Run database migrations
docker-compose exec api npx prisma migrate deploy

# 6. Verify
curl http://localhost:8080/health
curl http://localhost:8080/mcp/v1/schema
```

Services:
- **API** — http://localhost:8080
- **PostgreSQL** — localhost:5432
- **Redis** — (internal only, no exposed port)
- **Worker** — (internal only, processes background jobs)

---

## Docker Compose Reference

The `docker-compose.yml` defines four services:

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| `api` | Built from `Dockerfile` | `8080:8080` | Main API server |
| `db` | `postgres:15-alpine` | `5432:5432` | PostgreSQL database |
| `redis` | `redis:7-alpine` | (none) | Job queue / caching |
| `worker` | Built from `Dockerfile` | (none) | Background worker |

### Volumes

- `postgres_data` — Persistent PostgreSQL storage
- `redis_data` — Persistent Redis storage

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

**Required:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@db:5432/agentaudit?schema=public` |
| `JWT_SECRET` | 64-character hex secret for JWT signing | (generate with crypto) |
| `API_KEY_SALT` | 32-character hex salt for API key hashing | (generate with crypto) |
| `NODE_ENV` | Runtime environment | `production` |

**Optional:**

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `8080` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `JWT_ACCESS_EXPIRATION` | JWT access token TTL | `15m` |
| `JWT_REFRESH_EXPIRATION` | JWT refresh token TTL | `7d` |

See `.env.example` for the complete list including Stripe billing variables.

---

## Bare-Metal / VPS

If you prefer to run directly on a server without Docker:

### 1. Install Prerequisites

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y postgresql-15 redis-server nodejs npm

# macOS (with Homebrew)
brew install postgresql@15 redis node
```

### 2. Set Up PostgreSQL

```bash
# Create database and user
sudo -u postgres psql -c "CREATE DATABASE agentaudit;"
sudo -u postgres psql -c "CREATE USER agentaudit WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE agentaudit TO agentaudit;"
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://agentaudit:your_secure_password@localhost:5432/agentaudit?schema=public
#   JWT_SECRET=...
#   API_KEY_SALT=...
```

### 4. Install Dependencies and Build

```bash
npm ci
npx prisma generate
npm run build
```

### 5. Run Migrations

```bash
npx prisma migrate deploy
```

### 6. Start the Server

```bash
npm start
# Or with a process manager:
# pm2 start dist/server.js --name agentaudit-api
```

### 7. (Optional) Start Redis

```bash
sudo systemctl start redis-server
# Only needed if using background workers
```

---

## Configuration

### Disabling Billing

To run a fully free, self-hosted instance without Stripe:

1. Leave ALL `STRIPE_*` variables empty in `.env`.
2. Restart the API.
3. All new signups are automatically on the **free** plan with no subscription limits.

### First Admin / Organization

There is no separate "admin" concept. The first user who registers via the landing page or API becomes an organization with full access to create agents, rules, and audit logs.

```bash
# Register via API
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "My Org", "email": "admin@example.com", "password": "SecurePass123!"}'
```

### Custom Compliance Rules

Self-hosted instances support all 5 rule types:

1. **PII Detection** — Built-in SSN, email, credit card, phone patterns
2. **Keyword Matching** — Forbidden word lists
3. **Rate Limiting** — Request thresholds per time window
4. **Regex Matching** — Custom regular expressions
5. **Sentiment Analysis** — Toxicity and negativity detection
6. **Custom Validators** — User-defined JavaScript functions (sandboxed)

Rules are created via the API or dashboard:

```bash
curl -X POST http://localhost:8080/api/v1/compliance-rules \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block Internal IDs",
    "ruleType": "regex_match",
    "condition": { "pattern": "\\bINT-[A-Z]{3}-\\d{6}\\b" },
    "severity": "critical"
  }'
```

### Batch Logging

For high-throughput agents, submit up to 100 audit log entries in a single request:

```bash
curl -X POST http://localhost:8080/api/v1/audit-logs/batch \
  -H "X-API-Key: aa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '[
    {"action": "llm_start", "prompt": "Hello", "metadata": {"model": "gpt-4"}},
    {"action": "llm_end", "response": "Hi there", "metadata": {"tokens": 12}}
  ]'
```

Response:
```json
{
  "data": [{"id": "...", "action": "llm_start", ...}],
  "processed": 2,
  "errors": 0
}
```

### Framework Integrations

Self-hosted instances support the same drop-in integrations as the managed service:

| Framework | Pattern | Import |
|-----------|---------|--------|
| **CrewAI** | Observer callback | `from agentaudit import AgentAuditObserver` |
| **LangChain** | Callback handler | `from agentaudit import AgentAuditCallbackHandler` |
| **AutoGPT** | Decorator + context manager | `from agentaudit import AgentAuditAutoGPT` |
| **OpenAI** | Wrapped client | `from agentaudit import AgentAuditOpenAI` |

All integrations ship in the `agentaudit-client` Python SDK and wrap the same retrying `AgentAudit` client. Pass `base_url` to the SDK (or set the `AGENTAUDIT_BASE_URL` environment variable) to point to your self-hosted instance:

```python
from agentaudit import AgentAudit

audit = AgentAudit(
    api_key="aa_your_key_here",
    base_url="https://your-domain.com/api/v1"
)
```

```typescript
import { AgentAudit } from 'agentaudit-client';

const audit = new AgentAudit({
  apiKey: 'aa_your_key_here',
  baseUrl: 'https://your-domain.com/api/v1'
});
```

---

## Optional Features

### Billing

Billing is **optional** for self-hosting. To enable:

1. Create a [Stripe](https://stripe.com) account.
2. Create products and prices for the Free ($0 recurring), Pro, and Business tiers. Enterprise is contact-sales — create a price for it only if you want self-serve enterprise checkout.
3. Copy the price IDs into `.env` (the self-serve IDs below are required once `STRIPE_SECRET_KEY` is set; `STRIPE_PRICE_ENTERPRISE` is optional):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_FREE=price_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_PRICE_BUSINESS=price_...
   # Optional (contact-sales tier):
   # STRIPE_PRICE_ENTERPRISE=price_...
   ```
4. Create a Stripe webhook endpoint pointing to `https://your-domain/api/v1/billing/webhook`.
5. Restart the API.

### Background Workers

Background workers handle report generation and other async tasks. They require Redis.

In Docker Compose, the `worker` service is included by default.

For bare-metal:

```bash
# Start the worker
node dist/worker.js
# Or with PM2
pm2 start dist/worker.js --name agentaudit-worker
```

### Redis

Redis is only required for background workers. The main API server does not need Redis.

---

## Reverse Proxy & SSL

For production, put AgentAudit behind a reverse proxy with SSL.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name agentaudit.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name agentaudit.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### Caddy (Simpler)

```caddyfile
agentaudit.yourdomain.com {
    reverse_proxy localhost:8080
}
```

### Traefik (Docker-native)

See `docker-compose.prod.yml` (add Traefik labels to the `api` service).

---

## Updating

### Docker Compose

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up --build -d

# Run migrations
docker-compose exec api npx prisma migrate deploy
```

### Bare-Metal

```bash
git pull origin main
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
pm2 restart agentaudit-api
```

---

## Troubleshooting

### `Connection refused` to database

- Ensure PostgreSQL is running.
- Check `DATABASE_URL` matches your setup.
- For Docker: the hostname should be `db`, not `localhost`.

### Migrations fail

```bash
# Check connection
npx prisma db pull

# Reset (WARNING: drops all data)
npx prisma migrate reset
```

### Stripe webhook errors

- Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard.
- Ensure the webhook URL is publicly accessible (not localhost).
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:8080/api/v1/billing/webhook`

### 500 errors after deploy

- Check logs: `docker-compose logs -f api` or `pm2 logs agentaudit-api`.
- Verify all required environment variables are set.
- Ensure migrations have run: `npx prisma migrate deploy`.

### Performance issues

- Add `REDIS_URL` and run the worker service for async jobs.
- Enable PostgreSQL connection pooling (PgBouncer).
- Use a CDN for the static website assets.

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Nginx /   │──────▶│  AgentAudit │──────▶│  PostgreSQL  │
│   Caddy     │      │    API      │      │   (data)     │
└─────────────┘      └─────────────┘      └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  (optional  │
                    │   for jobs) │
                    └─────────────┘
```

---

## Community & Support

- **GitHub Issues**: https://github.com/AspicyKabob/-agentaudit-api/issues
- **Documentation**: https://agentaudit-api-production.up.railway.app/docs
- **License**: MIT

---

*Last updated: 2024*
