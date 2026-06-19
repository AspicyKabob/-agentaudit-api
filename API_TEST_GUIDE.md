# AgentAudit API Test Guide

Complete manual testing guide for the AgentAudit API. Run these in order with the server started (`npm start`) and PostgreSQL available.

## Prerequisites

```bash
# Start PostgreSQL and apply migrations
npx prisma migrate dev --name init
npm run build
npm start
```

Base URL: `http://localhost:8080`

---

## 1. Health Check

```bash
curl http://localhost:8080/health
```

Expected: `200` with `{ status: "ok", service: "agentaudit-api", version: "1.1.0-trace", commit, dependencies: { database, redis } }`. Returns `503` / `"degraded"` if the database is unreachable.

---

## 2. MCP Schema

```bash
curl http://localhost:8080/mcp/v1/schema
```

---

## 3. Authentication

### Register Organization
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Corp",
    "email": "admin@testcorp.com",
    "password": "SecurePass123"
  }'
```

Expected: `201` with `{ id, name, email, plan, createdAt }`

### Login
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@testcorp.com",
    "password": "SecurePass123"
  }'
```

Expected: `200` with `{ organization: { id, name, email, plan }, accessToken, refreshToken }`

Save the `accessToken` as `$TOKEN` for subsequent requests.

### Get Me
```bash
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with current org details.

---

## 4. API Keys

### Create API Key
```bash
curl -X POST http://localhost:8080/api/v1/auth/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production Agent Key"}'
```

Expected: `201` with `{ id, name, key, createdAt }`. **Save `key` — shown only once.**

Save the key as `$API_KEY`.

### List API Keys
```bash
curl http://localhost:8080/api/v1/auth/api-keys \
  -H "Authorization: Bearer $TOKEN"
```

### Revoke API Key
```bash
curl -X DELETE "http://localhost:8080/api/v1/auth/api-keys/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `204`

---

## 5. Agents

### Create Agent
```bash
curl -X POST http://localhost:8080/api/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Bot",
    "type": "langchain",
    "description": "Handles customer inquiries",
    "config": { "model": "gpt-4", "temperature": 0.7 }
  }'
```

Expected: `201`. Save returned `id` as `$AGENT_ID`.

### List Agents
```bash
curl http://localhost:8080/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"
```

### Get Agent
```bash
curl "http://localhost:8080/api/v1/agents/$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Update Agent
```bash
curl -X PATCH "http://localhost:8080/api/v1/agents/$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'
```

### Delete Agent
```bash
curl -X DELETE "http://localhost:8080/api/v1/agents/$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `204`

---

## 6. Audit Logs

### Submit with API Key (agent-facing)
```bash
curl -X POST http://localhost:8080/api/v1/audit-logs \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "prompt_submitted",
    "prompt": "What are your refund policies?",
    "response": "We offer 30-day refunds...",
    "metadata": { "model": "gpt-4", "tokens": 250, "latency_ms": 1200 }
  }'
```

Expected: `201` with the created log.

### Query with JWT (dashboard)
```bash
curl "http://localhost:8080/api/v1/audit-logs?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with `{ data: [...], pagination }`.

### Export JSON
```bash
curl "http://localhost:8080/api/v1/audit-logs/export?format=json" \
  -H "Authorization: Bearer $TOKEN" \
  --output audit-logs.json
```

### Export CSV
```bash
curl "http://localhost:8080/api/v1/audit-logs/export?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  --output audit-logs.csv
```

---

## 7. Compliance Rules

### Create PII Rule (blocks SSNs)
```bash
curl -X POST http://localhost:8080/api/v1/compliance-rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block SSNs",
    "ruleType": "pii_detect",
    "condition": { "patterns": ["ssn"] },
    "severity": "critical",
    "actionOverride": "block"
  }'
```

Expected: `201`. Save `id` as `$RULE_ID`. Valid `ruleType` values: `pii_detect`, `keyword_match`, `rate_limit`, `regex_match`, `sentiment_analysis`, `custom_validator`.

### Verify the rule blocks PII
```bash
curl -X POST http://localhost:8080/api/v1/audit-logs \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"prompt_submitted","prompt":"account?","response":"Your SSN is 123-45-6789"}'
```

Expected: `201` with `"enforcementAction": "block"` and `"complianceFlags": ["CRITICAL_pii_detect_Block SSNs"]`.

### List Rules
```bash
curl http://localhost:8080/api/v1/compliance-rules \
  -H "Authorization: Bearer $TOKEN"
```

### Update Rule
```bash
curl -X PATCH "http://localhost:8080/api/v1/compliance-rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

### Delete Rule
```bash
curl -X DELETE "http://localhost:8080/api/v1/compliance-rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `204`

---

## 8. Alerts

### List Alerts
```bash
curl "http://localhost:8080/api/v1/alerts?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Resolve Alert
```bash
curl -X PATCH "http://localhost:8080/api/v1/alerts/{alertId}/resolve" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `200`

---

## 9. Reports

### Generate Report
```bash
curl -X POST http://localhost:8080/api/v1/reports \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q3 Compliance Report",
    "format": "json",
    "dateRangeStart": "2024-07-01T00:00:00Z",
    "dateRangeEnd": "2024-09-30T23:59:59Z"
  }'
```

Expected: `201`. Save `id` as `$REPORT_ID`.

### List Reports
```bash
curl http://localhost:8080/api/v1/reports \
  -H "Authorization: Bearer $TOKEN"
```

### Get Report
```bash
curl "http://localhost:8080/api/v1/reports/$REPORT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete Report
```bash
curl -X DELETE "http://localhost:8080/api/v1/reports/$REPORT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `204`

---

## 10. Billing

### Get Subscription Status
```bash
curl http://localhost:8080/api/v1/billing/subscription \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with `{ status, plan }`

### Create Checkout Session
```bash
curl -X POST http://localhost:8080/api/v1/billing/checkout-session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priceId":"price_placeholder_pro"}'
```

Expected: `200` with `{ sessionId, url }`

### Create Customer Portal Session
```bash
curl -X POST http://localhost:8080/api/v1/billing/portal-session \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with `{ url }`

---

## 11. Documentation

- Swagger UI: `http://localhost:8080/docs`
- OpenAPI JSON: `http://localhost:8080/docs.json`

---

## Common Issues

### Database connection error
Ensure PostgreSQL is running and `DATABASE_URL` in `.env` is correct.

### 401 Unauthorized
- Check `Authorization: Bearer <token>` header is present and valid.
- For API-key endpoints, use `X-API-Key: <key>`.

### 409 Conflict
Email already exists. Use a unique email for registration tests.

### 400 Validation Failed
Request body doesn't match Zod schema. Check required fields and types.

---

## Full Integration Test Script

```bash
#!/bin/bash
set -e

BASE="http://localhost:8080"

# 1. Health
curl -sf "$BASE/health" > /dev/null && echo "✅ Health"

# 2. Register
curl -sf -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"Password123"}' > /dev/null \
  && echo "✅ Register"

# 3. Login
TOKEN=$(curl -sf -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123"}' | jq -r '.accessToken')
echo "✅ Login (token received)"

# 4. Me
curl -sf "$BASE/api/v1/auth/me" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "✅ Me"

# 5. API Key
API_KEY=$(curl -sf -X POST "$BASE/api/v1/auth/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Key"}' | jq -r '.key')
echo "✅ API Key created"

# 6. Submit Audit Log
curl -sf -X POST "$BASE/api/v1/audit-logs" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"test","prompt":"hello","response":"world"}' > /dev/null \
  && echo "✅ Audit log submitted"

# 7. Query Audit Logs
curl -sf "$BASE/api/v1/audit-logs" -H "Authorization: Bearer $TOKEN" > /dev/null \
  && echo "✅ Audit logs queried"

# 8. Create Agent
AGENT=$(curl -sf -X POST "$BASE/api/v1/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Agent","type":"langchain"}' | jq -r '.id')
echo "✅ Agent created"

# 9. List Agents
curl -sf "$BASE/api/v1/agents" -H "Authorization: Bearer $TOKEN" > /dev/null \
  && echo "✅ Agents listed"

# 10. Delete Agent
curl -sf -X DELETE "$BASE/api/v1/agents/$AGENT" -H "Authorization: Bearer $TOKEN" > /dev/null \
  && echo "✅ Agent deleted"

echo "All manual checks passed!"
```

Requires `jq` for JSON parsing.
