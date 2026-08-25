/**
 * Restore drill script
 *
 * Verifies that a pg_dump backup can be restored to a temporary database.
 *
 * Usage:
 *   DATABASE_URL=<railway-postgres-url> node scripts/restore-drill.js <path/to/backup.sql.gz>
 *
 * The script:
 *   1. Connects to the Postgres server using DATABASE_URL
 *   2. Creates a temporary database named restore_drill_<timestamp>
 *   3. Restores the gzipped SQL dump into it (one statement at a time)
 *   4. Prints row counts for core tables
 *   5. Drops the temporary database
 */

const fs = require('fs');
const zlib = require('zlib');
const { Client } = require('pg');
const { parse: parseConnectionString, toClientConfig } = require('pg-connection-string');

const BACKUP_FILE = process.argv[2];
const DATABASE_URL = process.env.DATABASE_URL;

if (!BACKUP_FILE || !DATABASE_URL) {
  console.error('Usage: DATABASE_URL=<url> node scripts/restore-drill.js <backup.sql.gz>');
  process.exit(1);
}

if (!fs.existsSync(BACKUP_FILE)) {
  console.error(`Backup file not found: ${BACKUP_FILE}`);
  process.exit(1);
}

function stripPsqlMetaCommands(sql) {
  return sql.split('\n')
    .filter(line => !/^\\[a-zA-Z]/.test(line))
    .join('\n');
}

function stripComments(sql) {
  // Remove /* ... */ block comments.
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove -- line comments.
  sql = sql.replace(/^\s*--.*$/gm, '');
  return sql;
}

function splitStatements(sql) {
  sql = stripComments(sql);
  // Split on semicolons followed by line endings (or EOF). pg_dump emits
  // one statement terminator per line, and statements themselves do not
  // contain ';' at end of a line except the terminator.
  const parts = sql.split(/;(?:\r?\n|\r|$)/);
  return parts
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tempDbName = `restore_drill_${timestamp}`;

  // Parse the connection string so we can reuse it with a different database.
  const baseConfig = toClientConfig(parseConnectionString(DATABASE_URL));

  console.log(`Connecting to ${baseConfig.host}:${baseConfig.port || 5432} as ${baseConfig.user}`);

  // Step 1: Create temp database
  const adminClient = new Client({ ...baseConfig, database: baseConfig.database });
  await adminClient.connect();

  console.log(`Creating temporary database: ${tempDbName}`);
  await adminClient.query(`CREATE DATABASE "${tempDbName}"`);
  await adminClient.end();

  // Step 2: Restore backup into temp database
  const restoreConfig = { ...baseConfig, database: tempDbName };
  const restoreClient = new Client(restoreConfig);
  await restoreClient.connect();

  console.log('Decompressing backup...');
  const compressed = fs.readFileSync(BACKUP_FILE);
  let sql = zlib.gunzipSync(compressed).toString('utf8');
  console.log(`Decompressed size: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);

  sql = stripPsqlMetaCommands(sql);

  const statements = splitStatements(sql);
  const BATCH_SIZE = 200;
  console.log(`Restoring ${statements.length} SQL statements in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE).map(s => s + ';').join('\n');
    try {
      await restoreClient.query(batch);
    } catch (err) {
      console.error(`Restore failed at batch starting at statement ${i + 1}:`);
      console.error(err.message);
      console.error('Batch start:', batch.slice(0, 200));
      await restoreClient.end();
      await cleanup(baseConfig, tempDbName);
      process.exit(1);
    }
    if (i + BATCH_SIZE <= statements.length) {
      console.log(`  ${Math.min(i + BATCH_SIZE, statements.length)}/${statements.length} statements restored`);
    }
  }
  console.log('Restore complete.');

  // Step 3: Row counts on core tables
  const dbCheck = await restoreClient.query('SELECT current_database() AS db');
  console.log('\nConnected to database:', dbCheck.rows[0].db);

  const tables = ['Organization', 'ApiKey', 'AuditLog', 'ComplianceRule', 'Alert', 'Agent', 'ComplianceReport'];
  console.log('Row counts:');
  for (const table of tables) {
    try {
      const res = await restoreClient.query(`SELECT COUNT(*) FROM public."${table}"`);
      console.log(`  ${table}: ${String(res.rows[0].count)}`);
    } catch (err) {
      console.log(`  ${table}: error - ${err.message}`);
    }
  }

  await restoreClient.end();

  // Step 4: Clean up temp database
  await cleanup(baseConfig, tempDbName);

  console.log('\nRestore drill passed.');
}

async function cleanup(baseConfig, dbName) {
  const dropClient = new Client({ ...baseConfig, database: baseConfig.database });
  await dropClient.connect();
  console.log(`Dropping temporary database: ${dbName}`);
  await dropClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await dropClient.end();
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
