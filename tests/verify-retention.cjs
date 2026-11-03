const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { PrismaPGlite } = require('pglite-prisma-adapter');

Object.assign(process.env, {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/retention_test',
  JWT_SECRET: 'retention_test_secret_0123456789abcdef0123456789',
  API_KEY_SALT: 'retention_test_salt_0123456789abcdef',
  REDIS_ENABLED: 'false', REDIS_URL: '', SENTRY_DSN: '', RESEND_API_KEY: '',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
});

async function main() {
  const db = new PGlite();
  let prisma;
  try {
    const root = path.resolve(__dirname, '../prisma/migrations');
    const directories = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, 'migration.sql'))).sort();
    for (const name of directories) {
      if (name === '20261103000000_add_retention_preference') {
        await db.query('INSERT INTO "Organization" ("id", "name", "email", "password", "updatedAt") VALUES ($1, $2, $3, $4, NOW())', ['existing', 'Existing', 'existing@example.invalid', 'unused']);
      }
      await db.exec(fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8'));
    }
    assert.equal((await db.query('SELECT "retentionDays" FROM "Organization" WHERE "id" = $1', ['existing'])).rows[0].retentionDays, null);
    await assert.rejects(db.query('UPDATE "Organization" SET "retentionDays" = $1 WHERE "id" = $2', [8, 'existing']));
    globalThis.__prismaPgliteAdapter__ = new PrismaPGlite(db);
    require('tsx/cjs');
    ({ prisma } = require('../src/db/prisma.ts'));
    const { authService } = require('../src/domains/auth/auth.service.ts');
    const { hashPassword } = require('../src/utils/password.ts');
    const password = await hashPassword('SyntheticPassword123');
    const a = await prisma.organization.create({ data: { name: 'A', email: 'a@example.invalid', password } });
    const b = await prisma.organization.create({ data: { name: 'B', email: 'b@example.invalid', password } });
    const old = new Date(Date.now() - 31 * 86400000);
    const recent = new Date();
    const log = await prisma.auditLog.create({ data: { organizationId: a.id, action: 'synthetic', complianceFlags: [], createdAt: old } });
    const fresh = await prisma.auditLog.create({ data: { organizationId: a.id, action: 'synthetic', complianceFlags: [], createdAt: recent } });
    await prisma.auditLog.create({ data: { organizationId: b.id, action: 'synthetic', complianceFlags: [], createdAt: old } });
    await prisma.alert.createMany({ data: [
      { organizationId: a.id, auditLogId: log.id, severity: 'warning', message: 'synthetic', createdAt: recent },
      { organizationId: a.id, auditLogId: fresh.id, severity: 'warning', message: 'synthetic', createdAt: old },
      { organizationId: a.id, severity: 'warning', message: 'synthetic', createdAt: old },
      { organizationId: b.id, severity: 'warning', message: 'synthetic', createdAt: old },
    ] });
    const preview = await authService.previewRetention(a.id, 30);
    assert.equal(preview.auditLogs, 1);
    assert.equal(preview.alerts, 2);
    assert.equal(preview.cleanupEnabled, false);
    const indefinite = await authService.previewRetention(a.id, null);
    assert.equal(indefinite.auditLogs, 0);
    assert.equal(indefinite.alerts, 0);
    await assert.rejects(authService.updateRetention(a.id, 7, 'wrong'), { statusCode: 403 });
    for (const retentionDays of [7, 30, 90, null]) {
      assert.deepEqual(await authService.updateRetention(a.id, retentionDays, 'SyntheticPassword123'), { retentionDays, cleanupEnabled: false });
    }
    assert.equal(await prisma.auditLog.count(), 3);
    assert.equal(await prisma.alert.count(), 4);
    const { runRetention } = require('../src/domains/retention/retention.service.ts');
    const { retentionCutoff } = require('../src/domains/retention/retention.filters.ts');
    const boundary = retentionCutoff(30, new Date());
    await prisma.auditLog.create({ data: { organizationId: b.id, action: 'boundary', complianceFlags: [], createdAt: boundary } });
    assert.equal(await prisma.auditLog.count({ where: { organizationId: b.id, createdAt: { lt: boundary } } }), 1);
    await prisma.organization.update({ where: { id: a.id }, data: { retentionDays: 30 } });
    await prisma.alert.createMany({ data: Array.from({ length: 3 }, () => ({
      organizationId: a.id, auditLogId: log.id, severity: 'warning', message: 'synthetic fanout',
    })) });
    const dry = await runRetention({ batchSize: 1, maxBatches: 20 });
    assert.equal(dry.status, 'completed', JSON.stringify(dry));
    assert.equal(dry.candidateAuditLogs, 1);
    assert.equal(dry.candidateAlerts, 5);
    assert.equal(dry.deletedAlerts + dry.deletedAuditLogs, 0);
    assert.equal(await prisma.auditLog.count(), 4);
    assert.equal(await prisma.alert.count(), 7);
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    process.env.RETENTION_DELETE_ENABLED = 'true';
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    await prisma.retentionJobState.update({ where: { id: 'audit-retention' }, data: {
      leaseOwner: 'synthetic-other-worker', leaseExpiresAt: new Date(Date.now() + 60000),
    } });
    assert.equal((await runRetention()).status, 'locked');
    await db.exec('UPDATE "RetentionJobState" SET "leaseExpiresAt" = CURRENT_TIMESTAMP - INTERVAL \'1 second\'');
    const recovered = await runRetention({ maxBatches: 1, batchSize: 1 });
    assert.equal(recovered.status, 'limited', JSON.stringify({ recovered, lease: (await db.query('SELECT CURRENT_TIMESTAMP AS "now", "leaseExpiresAt", "leaseExpiresAt" <= CURRENT_TIMESTAMP AS "expired" FROM "RetentionJobState"')).rows }));
    assert.equal((await prisma.retentionJobState.findUnique({ where: { id: 'audit-retention' } })).leaseOwner, null);
    await prisma.retentionJobState.update({ where: { id: 'audit-retention' }, data: { deletionEnabled: true } });
    await prisma.organization.update({ where: { id: a.id }, data: { retentionDays: 90 } });
    const longer = await runRetention({ dryRun: false });
    assert.equal(longer.status, 'completed', JSON.stringify(longer));
    assert.equal(longer.deletedAlerts + longer.deletedAuditLogs, 0);
    await prisma.organization.update({ where: { id: a.id }, data: { retentionDays: 30 } });
    let stopAfterAlertDelete = true;
    let retryAfterAlertDelete = false;
    prisma.$use(async (params, next) => {
      const result = await next(params);
      if (params.model === 'Alert' && params.action === 'deleteMany') {
        if (stopAfterAlertDelete) {
          stopAfterAlertDelete = false;
          delete process.env.RETENTION_DELETE_ENABLED;
        } else if (retryAfterAlertDelete) {
          retryAfterAlertDelete = false;
          throw Object.assign(new Error('synthetic transaction conflict'), { code: 'P2034' });
        }
      }
      return result;
    });
    const stopped = await runRetention({ dryRun: false, batchSize: 2 });
    assert.equal(stopped.status, 'disabled', JSON.stringify(stopped));
    assert.equal(stopped.deletedAlerts, 0);
    assert.equal(await prisma.alert.count(), 7);
    assert.equal(await prisma.auditLog.count(), 4);
    process.env.RETENTION_DELETE_ENABLED = 'true';
    retryAfterAlertDelete = true;
    const limited = await runRetention({ dryRun: false, batchSize: 1, maxBatches: 1 });
    assert.equal(limited.retries, 1);
    assert.equal(limited.status, 'limited', JSON.stringify(limited));
    assert.equal(limited.deletedAlerts + limited.deletedAuditLogs, 1);
    assert.notEqual(await prisma.auditLog.findUnique({ where: { id: log.id } }), null);
    let deleted = limited.deletedAlerts + limited.deletedAuditLogs;
    for (let pass = 0; pass < 4; pass++) {
      const result = await runRetention({ dryRun: false, batchSize: 1, maxBatches: 20 });
      assert.equal(result.status, 'completed', JSON.stringify(result));
      deleted += result.deletedAlerts + result.deletedAuditLogs;
    }
    assert.equal(deleted, 6);
    assert.equal(await prisma.auditLog.findUnique({ where: { id: log.id } }), null);
    assert.notEqual(await prisma.auditLog.findUnique({ where: { id: fresh.id } }), null);
    assert.equal(await prisma.auditLog.count({ where: { organizationId: b.id } }), 2);
    assert.equal(await prisma.alert.count({ where: { organizationId: b.id } }), 1);
    assert.equal(await prisma.alert.count({ where: { organizationId: a.id } }), 1);
    const finalOrg = await prisma.organization.findUnique({ where: { id: a.id } });
    assert.equal(finalOrg.apiUsed, 0);
    assert.equal(finalOrg.apiQuota, 5000);
    const state = await prisma.retentionJobState.findUnique({ where: { id: 'audit-retention' } });
    assert.notEqual(state.lastSucceededAt, null);
    assert.equal(state.leaseOwner, null);
    assert.equal(state.lastSummary.status, 'completed');
    const later = await prisma.organization.create({ data: { id: 'zz-retention-tenant', name: 'Later', email: 'later@example.invalid', password, retentionDays: 7 } });
    await prisma.auditLog.createMany({ data: [
      { organizationId: a.id, action: 'fairness', complianceFlags: [], createdAt: old },
      { organizationId: a.id, action: 'fairness', complianceFlags: [], createdAt: old },
      { organizationId: later.id, action: 'fairness', complianceFlags: [], createdAt: old },
    ] });
    const firstTenant = await runRetention({ dryRun: false, batchSize: 1, maxBatches: 1 });
    assert.equal(firstTenant.deletedAuditLogs, 1);
    const nextTenant = await runRetention({ dryRun: false, batchSize: 1, maxBatches: 1 });
    assert.equal(nextTenant.deletedAuditLogs, 1);
    assert.equal(await prisma.auditLog.count({ where: { organizationId: later.id } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { organizationId: a.id, createdAt: { lt: boundary } } }), 1);
    assert.equal((await runRetention({ dryRun: false })).status, 'completed');
    const wraparound = await runRetention({ dryRun: false });
    assert.equal(wraparound.status, 'completed');
    assert.equal(wraparound.deletedAuditLogs, 1);
    await prisma.retentionJobState.update({ where: { id: 'audit-retention' }, data: { deletionEnabled: false } });
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    delete process.env.RETENTION_DELETE_ENABLED;
    console.log('PASS: migrations, defaults, constraints, tenant isolation, cutoff boundary, password checks, dry-run pagination, both kill switches, active/expired leases, bounded deletion, policy changes, related alerts, unchanged quotas, and persisted run summary');
  } finally {
    if (prisma) await prisma.$disconnect();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
