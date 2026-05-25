import { jest } from '@jest/globals';
import { prisma } from '../src/db/prisma';

jest.setTimeout(30000);

afterAll(async () => {
  await prisma.$disconnect();
});
