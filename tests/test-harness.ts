import { PGlite } from '@electric-sql/pglite';
import { execSync } from 'child_process';

let pglite: PGlite;

beforeAll(async () => {
  // Spin up in-memory PostgreSQL
  pglite = new PGlite();

  // Get the connection details (pglite exposes a postgres-like interface)
  const databaseUrl = 'postgresql://postgres:postgres@localhost:5432/postgres';

  // Point Prisma to a temporary database file path for pglite
  // Actually, pglite doesn't use a real TCP port. We need to use the prisma-pglite adapter.
  // For now, let's use a file-based pglite database that Prisma can connect to via postgres-js
  pglite = new PGlite('./.test-pglite-data');

  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';

  // Run migrations
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
}, 60000);

afterAll(async () => {
  await pglite.close();
});
