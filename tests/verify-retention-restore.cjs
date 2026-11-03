const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { PrismaPGlite } = require('pglite-prisma-adapter');

const syntheticUrl = 'postgresql://synthetic:synthetic@127.0.0.1:1/retention_restore_test';
Object.assign(process.env, {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal', DATABASE_URL: syntheticUrl,
  JWT_SECRET: 'restore_test_secret_0123456789abcdef0123456789',
  API_KEY_SALT: 'restore_test_salt_0123456789abcdef',
  REDIS_ENABLED: 'false', REDIS_URL: '', SENTRY_DSN: '', RESEND_API_KEY: '',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', RETENTION_DELETE_ENABLED: 'false',
});

async function businessRows(db) {
  const rows = {};
  for (const table of ['Organization', 'AuditLog', 'Alert']) {
    rows[table] = (await db.query(`SELECT * FROM "${table}" ORDER BY "id"`)).rows;
  }
  return rows;
}

async function main() {
  const source = new PGlite();
  let restored;
  let prisma;
  try {
    const root = path.resolve(__dirname, '../prisma/migrations');
    for (const name of fs.readdirSync(root).sort()) {
      const file = path.join(root, name, 'migration.sql');
      if (fs.existsSync(file)) await source.exec(fs.readFileSync(file, 'utf8'));
    }
    for (const [id, retentionDays, apiUsed] of [
      ['a-shorter', 90, 123], ['b-longer', 7, 456], ['c-indefinite', null, 789], ['d-deleted', null, 111],
    ]) {
      await source.query('INSERT INTO "Organization" ("id", "name", "email", "password", "retentionDays", "apiUsed", "updatedAt") VALUES ($1, $1, $2, $3, $4, $5, NOW())',
        [id, `${id}@example.invalid`, 'synthetic-unused-password', retentionDays, apiUsed]);
    }
    const age = days => new Date(Date.now() - days * 86400000).toISOString();
    for (const [id, organizationId, days] of [
      ['a-expired', 'a-shorter', 20], ['a-fresh', 'a-shorter', 2],
      ['b-retained', 'b-longer', 20], ['b-expired', 'b-longer', 100], ['b-fresh', 'b-longer', 2],
      ['c-old', 'c-indefinite', 400], ['d-old', 'd-deleted', 400],
    ]) {
      await source.query('INSERT INTO "AuditLog" ("id", "organizationId", "action", "complianceFlags", "createdAt") VALUES ($1, $2, $1, ARRAY[]::text[], $3)', [id, organizationId, age(days)]);
    }
    for (const [id, organizationId, auditLogId, days] of [
      ['a-associated-expired', 'a-shorter', 'a-expired', 2],
      ['a-standalone-expired', 'a-shorter', null, 20],
      ['a-associated-retained', 'a-shorter', 'a-fresh', 20],
      ['a-standalone-fresh', 'a-shorter', null, 2],
      ['b-associated-expired', 'b-longer', 'b-expired', 2],
      ['b-associated-retained', 'b-longer', 'b-retained', 100],
      ['c-standalone-old', 'c-indefinite', null, 400],
      ['d-associated-old', 'd-deleted', 'd-old', 400],
    ]) {
      await source.query('INSERT INTO "Alert" ("id", "organizationId", "auditLogId", "severity", "message", "createdAt") VALUES ($1, $2, $3, $4, $1, $5)', [id, organizationId, auditLogId, 'warning', age(days)]);
    }
    await source.exec(`INSERT INTO "RetentionJobState" ("id", "deletionEnabled", "leaseOwner", "leaseExpiresAt", "dryRunCursor", "executionCursor")
      VALUES ('audit-retention', true, 'synthetic-stale-worker', CURRENT_TIMESTAMP + INTERVAL '1 day', 'zz-stale-cursor', 'zz-stale-cursor')`);
    const atBackup = await businessRows(source);
    const archive = await source.dumpDataDir('gzip');
    assert.ok(archive.size > 0);
    const recoveryEvidence = {
      deletedOrganizationIds: ['d-deleted'],
      preferences: [{ id: 'a-shorter', days: 7 }, { id: 'b-longer', days: 90 }],
    };
    await source.transaction(async tx => {
      for (const preference of recoveryEvidence.preferences) await tx.query('UPDATE "Organization" SET "retentionDays" = $1 WHERE "id" = $2', [preference.days, preference.id]);
      for (const id of recoveryEvidence.deletedOrganizationIds) await tx.query('DELETE FROM "Organization" WHERE "id" = $1', [id]);
      await tx.exec('UPDATE "RetentionJobState" SET "deletionEnabled" = false, "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "dryRunCursor" = NULL, "executionCursor" = NULL');
    });
    assert.equal((await source.query('SELECT "deletionEnabled" FROM "RetentionJobState"')).rows[0].deletionEnabled, false);
    const reconciled = await businessRows(source);
    restored = new PGlite({ loadDataDir: archive });
    await restored.waitReady;
    assert.deepEqual(await businessRows(restored), atBackup);
    assert.notDeepEqual(atBackup, reconciled);
    assert.equal((await restored.query('SELECT "deletionEnabled" FROM "RetentionJobState"')).rows[0].deletionEnabled, true);
    globalThis.__prismaPgliteAdapter__ = new PrismaPGlite(restored);
    require('tsx/cjs');
    ({ prisma } = require('../src/db/prisma.ts'));
    const { runRetention } = require('../src/domains/retention/retention.service.ts');
    assert.equal(process.env.DATABASE_URL, syntheticUrl);
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    assert.equal((await runRetention()).status, 'locked');
    assert.deepEqual(await businessRows(restored), atBackup);
    await restored.exec(`UPDATE "RetentionJobState" SET "deletionEnabled" = false,
      "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "dryRunCursor" = NULL, "executionCursor" = NULL, "lastSummary" = NULL`);
    await restored.transaction(async tx => {
      for (const preference of recoveryEvidence.preferences) await tx.query('UPDATE "Organization" SET "retentionDays" = $1 WHERE "id" = $2', [preference.days, preference.id]);
      for (const id of recoveryEvidence.deletedOrganizationIds) await tx.query('DELETE FROM "Organization" WHERE "id" = $1', [id]);
    });
    assert.deepEqual(await businessRows(restored), reconciled);
    const quotaBefore = (await restored.query('SELECT "id", "apiUsed", "apiQuota" FROM "Organization" ORDER BY "id"')).rows;
    const preview = await runRetention({ batchSize: 2, maxBatches: 30 });
    assert.equal(preview.status, 'completed', JSON.stringify(preview));
    assert.equal(preview.candidateAuditLogs, 2);
    assert.equal(preview.candidateAlerts, 3);
    assert.equal(preview.deletedAuditLogs + preview.deletedAlerts, 0);
    assert.deepEqual(await businessRows(restored), reconciled);
    process.env.RETENTION_DELETE_ENABLED = 'true';
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    await restored.exec('UPDATE "RetentionJobState" SET "deletionEnabled" = true');
    process.env.RETENTION_DELETE_ENABLED = 'false';
    assert.equal((await runRetention({ dryRun: false })).status, 'disabled');
    process.env.RETENTION_DELETE_ENABLED = 'true';
    let deleted = 0;
    for (let pass = 0; pass < 20; pass++) {
      const result = await runRetention({ dryRun: false, batchSize: 1, maxBatches: 2 });
      assert.ok(['limited', 'completed'].includes(result.status), JSON.stringify(result));
      assert.ok(result.deletedAuditLogs + result.deletedAlerts <= 2);
      deleted += result.deletedAuditLogs + result.deletedAlerts;
      if (result.status === 'completed' && deleted === 5) break;
    }
    assert.equal(deleted, 5);
    assert.deepEqual((await restored.query('SELECT "id" FROM "AuditLog" ORDER BY "id"')).rows.map(row => row.id), ['a-fresh', 'b-fresh', 'b-retained', 'c-old']);
    assert.deepEqual((await restored.query('SELECT "id" FROM "Alert" ORDER BY "id"')).rows.map(row => row.id), ['a-associated-retained', 'a-standalone-fresh', 'b-associated-retained', 'c-standalone-old']);
    assert.deepEqual((await restored.query('SELECT "id", "apiUsed", "apiQuota" FROM "Organization" ORDER BY "id"')).rows, quotaBefore);
    const clean = await runRetention({ batchSize: 2, maxBatches: 30 });
    assert.equal(clean.status, 'completed');
    assert.equal(clean.candidateAuditLogs + clean.candidateAlerts, 0);
    assert.equal((await prisma.retentionJobState.findUnique({ where: { id: 'audit-retention' } })).leaseOwner, null);
    await restored.exec('UPDATE "RetentionJobState" SET "deletionEnabled" = false');
    process.env.RETENTION_DELETE_ENABLED = 'false';
    assert.deepEqual(await businessRows(source), reconciled);
    console.log('PASS: synthetic in-memory PGlite archive/restore, stale state quarantine, external fixture reconciliation, full dry-run, bounded re-expiration, tenant isolation, unchanged quotas, and disabled final switches. Not a Railway/S3 backup recovery test.');
  } finally {
    process.env.RETENTION_DELETE_ENABLED = 'false';
    if (prisma) await prisma.$disconnect();
    if (restored) await restored.close();
    await source.close();
  }
}
main().catch(error => { console.error('Synthetic retention restore verification failed:', error); process.exitCode = 1; });
