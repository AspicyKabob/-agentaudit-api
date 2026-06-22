# AgentAudit API — Railway Deploy Guide

This project is configured for deployment from its GitHub repository using `railway.json` and the included Dockerfile.

## Prerequisites

1. GitHub account with this repo pushed
2. [Railway](https://railway.app) account (free tier available)
3. Stripe account only if paid billing is enabled

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/AspicyKabob/-agentaudit-api.git
git push -u origin main
```

## Step 2: Create Railway Project

1. Go to [railway.app/dashboard](https://railway.app/dashboard)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select `agentaudit-api`
4. Railway auto-detects `railway.json` and `Dockerfile`

## Step 3: Add PostgreSQL

1. In your Railway project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway injects `DATABASE_URL` automatically — no manual config needed

## Step 4: Set Environment Variables

In Railway Dashboard → Settings → Variables, add the required application variables first. Add the Stripe variables only if paid billing is enabled:

| Variable | Value | How to generate |
|----------|-------|---------------|
| `JWT_SECRET` | 64-char hex | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `API_KEY_SALT` | 32-char random | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe CLI or Dashboard |
| `STRIPE_PRICE_FREE` | `price_...` | Create a $0 recurring price in Stripe Products |
| `STRIPE_PRICE_PRO` | `price_...` | Create in Stripe Products |
| `STRIPE_PRICE_BUSINESS` | `price_...` | Create in Stripe Products |
| `STRIPE_PRICE_ENTERPRISE` | `price_...` | Optional — contact-sales tier |

> If `STRIPE_SECRET_KEY` is set, billing is enabled and the **self-serve** price IDs (`STRIPE_PRICE_FREE`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`) plus `STRIPE_WEBHOOK_SECRET` must be real `price_…`/`whsec_…` values. Leaving any of *those* as a placeholder makes the server exit on boot and `/health` will never pass. `STRIPE_PRICE_ENTERPRISE` is optional — Enterprise is contact-sales, so an unset/placeholder value is fine and just disables self-serve enterprise checkout.

## Step 5: Deploy

Railway auto-deploys on every git push. First deploy:

1. Click **"Deploy"** in Railway dashboard
2. Wait for build (~2-3 min)
3. Railway assigns a public URL: `https://agentaudit-api.up.railway.app`

## Step 6: Verify Migrations

`railway.json` runs `prisma migrate deploy` as a Railway pre-deploy command. A migration failure prevents the new deployment from going live. Confirm the pre-deploy command succeeded in the deployment logs; do not run migrations manually after every deploy.

## Step 7: Verify

```bash
curl https://YOUR_RAILWAY_URL/health
curl https://YOUR_RAILWAY_URL/mcp/v1/schema
```

## Custom Domain

1. Railway Dashboard → Settings → Domains
2. Click **"Generate Domain"** or add your own
3. Update `website/index.html` API_BASE_URL to your domain

## Resend Email & Support Mailbox

1. Add Resend variables in Railway → Settings → Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `RESEND_API_KEY` | `re_...` | Resend API dashboard |
| `RESEND_FROM_EMAIL` | `AgentAudit <noreply@agentaudit.online>` | Must be a verified domain in Resend |
| `RESEND_WEBHOOK_SECRET` | Resend webhook secret | Resend Webhooks → Add endpoint |
| `SUPPORT_EMAIL` | `AgentAudit Support <support@agentaudit.online>` | A real mailbox that can receive replies |

2. Verify the domain in Resend and add the DNS records it gives you (typically `SPF`, `DKIM`, and `DMARC`).
3. Add a webhook endpoint in Resend at `https://YOUR_RAILWAY_URL/api/v1/webhooks/resend` and select these events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed`, `email.failed`, `email.delivery_delayed`.
4. Set up a real mailbox for `support@agentaudit.online` so replies work. If you use Cloudflare DNS, the easiest path is **Cloudflare Email Routing**:
   - Cloudflare dashboard → Email → Email Routing
   - Create a catch-all or specific route for `support@agentaudit.online` → forward to your personal email
   - Activate the route and confirm via the verification email
   - Alternatively, use a hosted mailbox provider (Google Workspace, Zoho, Fastmail, etc.).
5. Tell users to add `noreply@agentaudit.online` to their contacts so alerts don't land in junk/spam.

## Monitoring

- Railway has built-in logs and metrics
- Add [UptimeRobot](https://uptimerobot.com) free tier for external health checks
- Add `SENTRY_DSN` env var for error tracking (optional)

## Backups, Restore, and Rollback

Enable daily, weekly, and monthly backups from the PostgreSQL service's **Backups** tab. Follow [the production operations runbook](docs/operations.md) for the non-production restore drill, Redis-disabled beta decision, migration verification, rollback, and incident response.

## Troubleshooting

### Build fails
Check Railway build logs. Common issues:
- `DATABASE_URL` missing → add PostgreSQL service first
- Prisma generate fails → ensure `prisma/schema.prisma` is committed

### 500 on first request
Migrations haven't run. Execute `npx prisma migrate deploy` via Railway shell.

### Stripe webhook fails locally
Use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to https://YOUR_RAILWAY_URL/api/v1/billing/webhook
```
