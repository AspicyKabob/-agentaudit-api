# Deployment Guide

## Quick Deploy Options

### Option 1: Self-Host with Docker (Recommended for Control)

Deploy AgentAudit on your own infrastructure in under 5 minutes:

```bash
cp .env.example .env
# Generate secrets and fill in .env
docker-compose up -d
docker-compose exec api npx prisma migrate deploy
```

See [docs/self-hosting.md](docs/self-hosting.md) for the complete guide including:
- Docker Compose setup
- Bare-metal / VPS deployment
- Reverse proxy & SSL configuration
- Updating and troubleshooting

### Option 2: Railway (Managed Platform)

See [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) for detailed Railway-specific instructions.

**Quick steps:**
1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your AgentAudit repo
5. Add PostgreSQL database (Railway provides this)
6. Set environment variables in Railway dashboard
7. Deploy!

**Cost:** Free tier available. Pro ~$5/month.

### Option 3: Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Click "New Web Service" → "Build and deploy from a Git repository"
4. Select repo, set build command: `npm install && npx prisma generate && npm run build`
5. Set start command: `npm start`
6. Add PostgreSQL database
7. Deploy!

### Option 4: Vercel (Static Website Only)

Vercel can host the **static website** (`website/` folder), but **not** the Node.js API backend — Vercel's serverless model does not support persistent TCP connections to PostgreSQL required by Prisma. Deploy the API on Railway, Render, or Docker and point the website's `API_BASE` to that URL.

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import project
4. Set framework preset to "Other"
5. Set root directory to `website`
6. Set build command: *(none — static files)*
7. Set output directory: `website`
8. Deploy!

**Important:** You still need a separate backend deployment (Railway/Render/Docker) for the API.

## Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars, random |
| `API_KEY_SALT` | Yes | Random salt for API key hashing |
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Defaults to 8080 |
| `FRONTEND_URL` | Yes (prod) | Public frontend origin — required for CORS |
| `REDIS_URL` | No | Enables distributed rate limiting across multiple API instances |

See `.env.example` for the complete list including optional Stripe billing variables.

## Domain Setup

1. Buy domain: `agentaudit.online` (or your choice)
2. Add A record pointing to your server IP
3. Set `CNAME` for `www` subdomain
4. Configure SSL (Let's Encrypt free)

## SSL with Let's Encrypt (Docker)

```bash
# Using Traefik or Nginx proxy
# Automatic SSL certificates
# See docs/self-hosting.md for full Nginx/Caddy/Traefik examples
```

## Monitoring (Post-Deploy)

- Uptime: [uptimerobot.com](https://uptimerobot.com) (free)
- Logs: Railway/Render have built-in log streaming
- Errors: Sentry integration (add `SENTRY_DSN` env var)
- Analytics: Plausible or Simple Analytics for website

## Database Migrations

Railway runs `npx prisma migrate deploy` in the pre-deploy phase through `railway.json`. Other providers must run the same command before switching traffic to the new application version.

See [Production Operations](docs/operations.md) for backup, restore, rollback, and incident procedures.

## Scaling Checklist

- [ ] Read replicas for PostgreSQL
- [ ] Redis caching layer
- [ ] CDN for static assets (CloudFlare)
- [ ] Load balancer (if multi-region)
- [ ] Rate limiting middleware
