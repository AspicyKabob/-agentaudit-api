#!/usr/bin/env node

const { randomUUID } = require('crypto');

const DEFAULT_TIMEOUT_MS = 15000;
const FAKE_SSN = '123-45-6789';

const baseUrl = normalizeBaseUrl(
  process.env.SMOKE_BASE_URL || process.env.BASE_URL || process.argv[2]
);

if (!baseUrl) {
  console.error('Missing live API base URL. Set SMOKE_BASE_URL=https://your-app.example.com or pass it as the first argument.');
  process.exit(1);
}

const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const randomSuffix = randomUUID().slice(0, 8);
const email = process.env.SMOKE_EMAIL || `agentaudit-smoke+${runId}-${randomSuffix}@example.com`;
const password = process.env.SMOKE_PASSWORD || `SmokeTest-${randomSuffix}-Pass123`;
const orgName = process.env.SMOKE_ORG_NAME || `AgentAudit Smoke ${runId}`;
const skipRegister = process.env.SMOKE_SKIP_REGISTER === '1';

async function main() {
  const cleanup = [];

  try {
    await runSmokeTest(cleanup);
  } finally {
    await cleanupResources(cleanup);
  }
}

async function runSmokeTest(cleanup) {
  console.log(`Smoke testing ${baseUrl}`);
  console.log(`Using organization email: ${email}`);

  await step('health check', async () => {
    const body = await request('/health');
    assert(body.status === 'ok', `expected health status ok, got ${JSON.stringify(body)}`);
  });

  await step('MCP schema check', async () => {
    const body = await request('/mcp/v1/schema');
    assert(body.name, `expected MCP schema name, got ${JSON.stringify(body)}`);
  });

  if (!skipRegister) {
    await step('register organization', async () => {
      const body = await request('/api/v1/auth/register', {
        method: 'POST',
        body: { name: orgName, email, password },
        expectedStatuses: [201, 409],
      });
      if (body?.error && !String(body.error).toLowerCase().includes('email')) {
        throw new Error(`registration failed unexpectedly: ${JSON.stringify(body)}`);
      }
    });
  }

  const accessToken = await step('login organization', async () => {
    const body = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert(body.accessToken, `expected accessToken, got ${JSON.stringify(body)}`);
    return body.accessToken;
  });

  const apiKey = await step('create API key', async () => {
    const body = await request('/api/v1/auth/api-keys', {
      method: 'POST',
      token: accessToken,
      body: { name: `Smoke Test ${runId}` },
    });
    assert(body.key, `expected one-time API key, got ${JSON.stringify(body)}`);
    if (body.id) {
      cleanup.push(() => request(`/api/v1/auth/api-keys/${body.id}`, { method: 'DELETE', token: accessToken, expectedStatuses: [204] }));
    }
    return body.key;
  });

  await step('create blocking SSN rule', async () => {
    const body = await request('/api/v1/compliance-rules', {
      method: 'POST',
      token: accessToken,
      body: {
        name: `Smoke Block SSN ${runId}`,
        ruleType: 'pii_detect',
        condition: { patterns: ['ssn'] },
        severity: 'critical',
        actionOverride: 'block',
      },
    });
    assert(body.id, `expected compliance rule id, got ${JSON.stringify(body)}`);
    cleanup.push(() => request(`/api/v1/compliance-rules/${body.id}`, { method: 'DELETE', token: accessToken, expectedStatuses: [204] }));
  });

  const auditLog = await step('submit blocked audit log', async () => {
    const body = await request('/api/v1/audit-logs', {
      method: 'POST',
      apiKey,
      body: {
        action: 'smoke_test_block_ssn',
        prompt: 'Run a production smoke test for PII blocking.',
        response: `This is fake test data. SSN: ${FAKE_SSN}`,
        metadata: { smokeTest: true, runId },
      },
    });
    assert(body.id, `expected audit log id, got ${JSON.stringify(body)}`);
    assert(body.enforcementAction === 'block', `expected enforcementAction=block, got ${body.enforcementAction}`);
    assert(Array.isArray(body.complianceFlags) && body.complianceFlags.length > 0, `expected compliance flags, got ${JSON.stringify(body)}`);
    return body;
  });

  await step('query audit logs', async () => {
    const body = await request('/api/v1/audit-logs?action=smoke_test_block_ssn&limit=5', {
      token: accessToken,
    });
    const logs = Array.isArray(body.data) ? body.data : [];
    assert(logs.some((log) => log.id === auditLog.id), `expected query results to include audit log ${auditLog.id}`);
  });

  console.log('\nSmoke test passed. Guardrail path is working against the live API.');
}

async function cleanupResources(cleanup) {
  for (const clean of cleanup.reverse()) {
    try {
      await clean();
    } catch (err) {
      console.warn(`cleanup warning: ${redact(err.message || err)}`);
    }
  }
}

function normalizeBaseUrl(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
}

async function step(name, fn) {
  process.stdout.write(`- ${name}... `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (err) {
    console.log('failed');
    throw err;
  }
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    token,
    apiKey,
    expectedStatuses,
  } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const statuses = expectedStatuses || (method === 'POST' ? [200, 201] : [200]);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!statuses.includes(response.status)) {
      throw new Error(`${method} ${path} returned ${response.status}: ${redact(JSON.stringify(parsed))}`);
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(value) {
  return String(value)
    .replace(/agentaudit_[A-Za-z0-9._-]+/g, 'agentaudit_<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/"accessToken":"[^"]+"/g, '"accessToken":"<redacted>"')
    .replace(/"refreshToken":"[^"]+"/g, '"refreshToken":"<redacted>"')
    .replace(/"key":"[^"]+"/g, '"key":"<redacted>"');
}

main().catch((err) => {
  console.error(`\nSmoke test failed: ${redact(err.stack || err.message || err)}`);
  process.exit(1);
});
