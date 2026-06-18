# Production Launch Checklist

## Immediate Actions (estimated time: 15 minutes)

### 1. Push to GitHub (2 min)
```bash
cd ~/OneDrive/Desktop/NEWAPI
git remote add origin https://github.com/YOUR_USERNAME/agentaudit-api.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Railway (3 min)
1. Go to https://railway.app/dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `agentaudit-api`
4. Railway auto-builds from `Dockerfile`

### 3. Add PostgreSQL (1 min)
- In Railway project: "New" → "Database" → "Add PostgreSQL"
- Don't configure `DATABASE_URL` manually — Railway injects it

### 4. Environment Variables (5 min)

| Variable | Value | Status |
|----------|-------|--------|
| `JWT_SECRET` | Generate with `openssl rand -hex 32` — set in Railway only, never commit | 🔲 Generate |
| `API_KEY_SALT` | Generate with `openssl rand -hex 16` — set in Railway only, never commit | 🔲 Generate |
| `NODE_ENV` | `production` | ✅ Auto-set |
| `FRONTEND_URL` | `https://your-railway-domain.up.railway.app` | 🔲 After deploy |
| `STRIPE_SECRET_KEY` | `sk_live_...` | 🔲 Get from Stripe |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | 🔲 Get from Stripe |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | 🔲 After Stripe setup |
| `STRIPE_PRICE_PRO` | `price_...` | 🔲 Create in Stripe |
| `STRIPE_PRICE_BUSINESS` | `price_...` | 🔲 Create in Stripe |
| `STRIPE_PRICE_ENTERPRISE` | `price_...` | 🔲 Create in Stripe |

### 5. Stripe Setup (~5 min)
1. Create account at https://dashboard.stripe.com/register
2. Create products + recurring prices for Pro ($99), Business ($499), Enterprise (custom)
3. Copy Price IDs to env vars
4. Create webhook endpoint: `https://YOUR_URL/api/v1/billing/webhook`
5. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

### 6. Test Live API (1 min)
```bash
curl https://YOUR_RAILWAY_URL/health
curl https://YOUR_RAILWAY_URL/mcp/v1/schema
```

## Post-Deploy
- [ ] Create your first org via the website
- [ ] Generate an API key
- [ ] Install the Python SDK: `pip install agentaudit-client`
- [ ] Submit first audit log
- [ ] Check the dashboard for logs
