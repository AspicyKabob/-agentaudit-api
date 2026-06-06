import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  const adapter = (globalThis as any).__prismaPgliteAdapter__;
  if (adapter) {
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = createPrismaClient();
    }
    return (_prisma as any)[prop];
  },
});
