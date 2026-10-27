const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const { PGlite } = require('@electric-sql/pglite');
const { PrismaPGlite } = require('pglite-prisma-adapter');

async function main() {
  assert(process.argv.slice(2).every((arg) => arg === '--quick'), 'Only --quick is supported; this runner never accepts a remote target.');
  const quick = process.argv.includes('--quick');
  Object.assign(process.env, {
    NODE_ENV: 'test', LOG_LEVEL: 'fatal',
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/isolated_load_test',
    JWT_SECRET: randomBytes(32).toString('hex'), API_KEY_SALT: randomBytes(32).toString('hex'),
    REDIS_ENABLED: 'false', REDIS_URL: '', SENTRY_DSN: '', RESEND_API_KEY: '',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
  });
  const db = new PGlite();
  let server;
  let prisma;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  try {
    const migrations = path.resolve(__dirname, '../prisma/migrations');
    for (const directory of fs.readdirSync(migrations).sort()) {
      const file = path.join(migrations, directory, 'migration.sql');
      if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
    }
    globalThis.__prismaPgliteAdapter__ = new PrismaPGlite(db);
    require('tsx/cjs');
    ({ prisma } = require('../src/db/prisma.ts'));
    const { hashApiKey } = require('../src/utils/apiKey.ts');
    const { initRateLimiters } = require('../src/middleware/rateLimit.middleware.ts');
    const { createApp } = require('../src/app.ts');
    const tenants = [];
    for (let i = 0; i < 8; i += 1) {
      const org = await prisma.organization.create({ data: {
        name: `Synthetic load tenant ${i}`, email: `load-${i}@example.invalid`,
        password: randomBytes(32).toString('hex'), apiQuota: 100000,
        notifyEmail: false, notifyWebhook: false,
      } });
      const key = `aa_${randomBytes(24).toString('hex')}`;
      await prisma.apiKey.create({ data: { organizationId: org.id, name: 'Synthetic local key', keyHash: hashApiKey(key) } });
      await prisma.complianceRule.create({ data: {
        organizationId: org.id, name: 'Block synthetic SSNs', ruleType: 'pii_detect',
        condition: { patterns: ['ssn'] }, severity: 'critical', actionOverride: 'block',
      } });
      await prisma.auditLog.createMany({ data: Array.from({ length: 10 }, () => ({
        organizationId: org.id, action: 'load_seed', complianceFlags: [], response: 'Synthetic seed record',
      })) });
      tenants.push({ id: org.id, key });
    }
    await initRateLimiters();
    server = await new Promise((resolve) => {
      const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    let sequence = 0;
    let successfulWrites = 0;
    let blockedWrites = 0;
    let readRequests = 0;
    let peakRss = process.memoryUsage().rss;
    const memorySampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
    memorySampler.unref();
    loop.enable();

    async function stage(name, rate, seconds) {
      const started = performance.now();
      const durationMs = seconds * 1000;
      const pending = new Set();
      const latencies = [];
      const statuses = {};
      let errors = 0;
      let dropped = 0;
      let offered = 0;
      let maxSchedulerLagMs = 0;
      async function send(index, scheduledAt) {
        const tenant = tenants[Math.floor(index / 10) % tenants.length];
        const query = index % 10 === 0;
        const blocked = !query && index % 4 === 0;
        const requestId = `local-load-${index}`;
        const headers = { 'X-API-Key': tenant.key, 'X-Request-Id': requestId, 'Content-Type': 'application/json' };
        if (query) readRequests += 1;
        try {
          const response = await fetch(`${base}/api/v1/audit-logs${query ? '?limit=10' : ''}`, {
            method: query ? 'GET' : 'POST', headers,
            ...(query ? {} : { body: JSON.stringify({
              action: 'local_load_test', traceId: `local-trace-${index}`,
              prompt: 'Synthetic load test input', response: blocked ? 'Synthetic SSN: 123-45-6789' : 'Synthetic clean output',
              metadata: { source: 'isolated-load-test', padding: 'x'.repeat(512) },
            }) }),
            signal: AbortSignal.timeout(10000),
          });
          statuses[response.status] = (statuses[response.status] || 0) + 1;
          const body = await response.json();
          assert.equal(response.status, query ? 200 : 201);
          assert.equal(response.headers.get('x-request-id'), requestId);
          if (query) {
            assert(body.data.every((log) => log.organizationId === tenant.id), 'Tenant isolation mismatch');
          } else {
            assert.equal(body.enforcementAction, blocked ? 'block' : 'allow');
            successfulWrites += 1;
            if (blocked) blockedWrites += 1;
          }
        } catch {
          errors += 1;
        } finally {
          latencies.push(performance.now() - scheduledAt);
        }
      }
      while (performance.now() - started < durationMs) {
        const due = started + offered * 1000 / rate;
        if (due > performance.now()) await sleep(due - performance.now());
        if (performance.now() - started >= durationMs) break;
        offered += 1;
        const index = sequence++;
        if (pending.size >= 16) { dropped += 1; continue; }
        maxSchedulerLagMs = Math.max(maxSchedulerLagMs, performance.now() - due);
        const work = send(index, due).finally(() => pending.delete(work));
        pending.add(work);
      }
      await Promise.all(pending);
      latencies.sort((a, b) => a - b);
      const percentile = (p) => Math.round((latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] || 0) * 100) / 100;
      const result = {
        name, offeredRps: rate, durationSeconds: seconds, offered, completed: latencies.length,
        achievedRps: Math.round(latencies.length / ((performance.now() - started) / 1000) * 100) / 100,
        errors, dropped, statuses, maxSchedulerLagMs: Math.round(maxSchedulerLagMs),
        p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
      };
      result.passed = errors === 0 && dropped === 0 && (name === 'warmup' || (result.p95Ms < 500 && result.p99Ms < 1500));
      console.log(JSON.stringify({ stage: result }));
      return result;
    }

    const stages = [
      await stage('warmup', 2, quick ? 2 : 10),
      await stage('sustained', 5, quick ? 5 : 120),
      await stage('burst', 10, quick ? 3 : 30),
    ];
    const remainingReads = Math.max(0, 200 - readRequests);
    for (let i = 0; i <= remainingReads; i += 1) {
      const response = await fetch(`${base}/api/v1/audit-logs?agentId=not-a-uuid`, {
        headers: { 'X-API-Key': tenants[0].key }, signal: AbortSignal.timeout(10000),
      });
      await response.arrayBuffer();
      assert.equal(response.status, i < remainingReads ? 400 : 429, 'Read limiter contract mismatch');
      if (i === remainingReads) {
        assert.equal(response.headers.get('ratelimit-limit'), '200');
        assert(response.headers.get('retry-after'));
      }
    }
    const persisted = await prisma.auditLog.count();
    const usage = await prisma.organization.aggregate({ _sum: { apiUsed: true } });
    const alerts = await prisma.alert.count();
    assert.equal(persisted, 80 + successfulWrites, 'Persisted log count mismatch');
    assert.equal(usage._sum.apiUsed, successfulWrites, 'Quota accounting mismatch');
    assert.equal(alerts, blockedWrites, 'Blocked-event alert count mismatch');
    clearInterval(memorySampler);
    loop.disable();
    const result = {
      mode: quick ? 'quick' : 'sustained', timestamp: new Date().toISOString(),
      environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length },
      database: 'Fresh in-memory PGlite with repository migrations; not production PostgreSQL capacity',
      workload: '8 synthetic tenants, one SSN-blocking rule each, 90% single writes / 10% queries, 512-byte metadata padding',
      limits: 'Real Prisma-backed per-IP rate limiters enabled; all requests use loopback',
      peakRssMiB: Math.round(peakRss / 1024 / 1024), eventLoopP99Ms: Math.round(loop.percentile(99) / 10000) / 100,
      stages, readRateLimitVerified: true, persisted, successfulWrites, blockedWrites, alerts,
      quotaAccountingVerified: true, tenantIsolationVerified: true, passed: stages.every((item) => item.passed),
    };
    console.log(JSON.stringify(result, null, 2));
    return result.passed;
  } finally {
    loop.disable();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (prisma) await prisma.$disconnect();
    await db.close();
    delete globalThis.__prismaPgliteAdapter__;
  }
}

main().then((passed) => { process.exitCode = passed ? 0 : 1; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
