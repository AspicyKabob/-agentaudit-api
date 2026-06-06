import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

let pglite: PGlite | null = null;
let testPrisma: PrismaClient | null = null;

export async function createTestDatabase(): Promise<PrismaClient> {
  if (testPrisma) return testPrisma;

  pglite = new PGlite();

  // Apply all migrations from the migrations folder
  const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const migrationFolders = fs
      .readdirSync(migrationsDir)
      .filter((dir) => fs.statSync(path.join(migrationsDir, dir)).isDirectory())
      .sort();

    for (const folder of migrationFolders) {
      const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        // Execute each statement separately to handle potential errors
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const stmt of statements) {
          try {
            await pglite.exec(stmt + ';');
          } catch (e) {
            // Ignore errors for statements that may already exist (idempotent)
            console.warn(`Migration statement skipped: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  const adapter = new PrismaPGlite(pglite);
  testPrisma = new PrismaClient({ adapter });
  await testPrisma.$connect();

  return testPrisma;
}

export async function closeTestDatabase(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
  if (pglite) {
    await pglite.close();
    pglite = null;
  }
}
