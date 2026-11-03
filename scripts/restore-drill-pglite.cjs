/**
 * Offline restore drill — restores a real S3 pg_dump backup (.sql.gz, plain
 * format with --inserts) into an isolated in-memory PGlite PostgreSQL engine.
 *
 * Usage:
 *   node scripts/restore-drill-pglite.cjs <path/to/agentaudit-backup-*.sql.gz>
 *
 * No network, no production connection, no writes outside the process. The
 * restored database is discarded when the script exits.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PGlite } = require('@electric-sql/pglite');

const BACKUP_FILE = process.argv[2];
if (!BACKUP_FILE || !fs.existsSync(BACKUP_FILE)) {
  console.error('Usage: node scripts/restore-drill-pglite.cjs <backup.sql.gz>');
  process.exit(1);
}

const filename = path.basename(BACKUP_FILE);
const tsMatch = filename.match(/agentaudit-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
const backupTime = tsMatch ? new Date(`${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]}T${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}Z`) : null;

function splitStatements(sql) {
  // Strip psql meta commands (\restrict, \unrestrict, etc.) and comments.
  sql = sql.split('\n').filter(l => !/^\\[a-zA-Z]/.test(l)).join('\n');
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
  return sql.split(/;(?:\r?\n|\r|$)/).map(s => s.trim()).filter(s => s.length > 0);
}

// Statements that are harmless for a data-integrity drill on a fresh engine.
const SKIPPABLE = [
  /^SET /i, /^SELECT pg_catalog\.set_config/i, /^CREATE EXTENSION/i,
  /^COMMENT ON /i, /^ALTER .*OWNER TO/i, /^DROP /i,
];
const isSkippable = s => SKIPPABLE.some(re => re.test(s));

async function main() {
  console.log(`Backup: ${filename} (${(fs.statSync(BACKUP_FILE).size / 1024).toFixed(0)} KB gz)`);
  if (backupTime) console.log(`Backup timestamp (from filename): ${backupTime.toISOString()}`);
  const sql = zlib.gunzipSync(fs.readFileSync(BACKUP_FILE)).toString('utf8');
  console.log(`Decompressed: ${(sql.length / 1024 / 1024).toFixed(2)} MB SQL`);
  const statements = splitStatements(sql);
  console.log(`Statements: ${statements.length}`);

  const db = new PGlite();
  let executed = 0, skipped = 0;
  const failures = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await db.exec(stmt + ';');
      executed++;
    } catch (err) {
      if (isSkippable(stmt)) { skipped++; continue; }
      failures.push({ index: i + 1, preview: stmt.slice(0, 120), error: err.message.split('\n')[0] });
    }
  }
  console.log(`Executed: ${executed}, skipped (SET/EXTENSION/etc): ${skipped}, failed: ${failures.length}`);
  for (const f of failures.slice(0, 15)) console.log(`  FAIL #${f.index}: ${f.error} | ${f.preview}`);
  if (failures.length) {
    console.log('\nRestore drill FAILED — statements did not replay cleanly.');
    await db.close();
    process.exit(1);
  }

  const tables = ['Organization', 'ApiKey', 'Agent', 'Policy', 'ComplianceRule', 'AuditLog', 'Alert', 'ComplianceReport', 'EmailDelivery', 'RetentionJobState'];
  console.log('\nRow counts:');
  const counts = {};
  for (const table of tables) {
    try {
      const res = await db.query(`SELECT COUNT(*)::int AS c FROM public."${table}"`);
      counts[table] = res.rows[0].c;
      console.log(`  ${table}: ${res.rows[0].c}`);
    } catch {
      console.log(`  ${table}: (table not present)`);
    }
  }

  const assertions = [];
  assertions.push([counts.Organization > 0, 'Organization has rows']);
  assertions.push([counts.AuditLog > 0, 'AuditLog has rows']);
  const latest = await db.query('SELECT MAX("createdAt") AS m FROM public."AuditLog"');
  const latestAt = latest.rows[0].m;
  console.log(`Latest AuditLog.createdAt: ${latestAt}`);
  if (backupTime) assertions.push([new Date(latestAt) <= backupTime, 'latest audit log predates backup timestamp']);
  const orgs = await db.query('SELECT "id", "name", "plan", "apiUsed", "apiQuota" FROM public."Organization" ORDER BY "id" LIMIT 5');
  console.log(`Organizations (first ${orgs.rows.length}):`, orgs.rows.map(o => `${o.name}[${o.plan}] used=${o.apiUsed}/${o.apiQuota}`).join(', '));
  const schema = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log(`Tables restored: ${schema.rows.map(r => r.table_name).join(', ')}`);

  const failed = assertions.filter(([ok]) => !ok);
  for (const [ok, label] of assertions) console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`);
  await db.close();
  if (failed.length) {
    console.log(`\nRestore drill FAILED (${failed.length} assertions).`);
    process.exit(1);
  }
  console.log('\nRestore drill PASSED: real S3 pg_dump replayed into isolated PGlite, rows and timestamps verified.');
  console.log('Note: PGlite (WASM Postgres) is not managed Railway Postgres — pg_dump connectivity and CREATE DATABASE privileges on the managed instance remain untested.');
}

main().catch(err => { console.error('Restore drill failed:', err.message); process.exit(1); });
