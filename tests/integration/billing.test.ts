import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();
const agent = request.agent(app);

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: any) => cb({
      auditLog: { create: jest.fn() },
    })),
    rateLimit: {
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn(),
    },
    agent: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    apiKey: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    complianceRule: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    complianceReport: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    alert: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/utils/stripe', () => ({
  stripe: null,
  ensureStripeConfigured: jest.fn(() => { throw new Error('Billing is not configured'); }),
}));

import { prisma } from '../../src/db/prisma';

const mockedPrisma = prisma as unknown as {
  organization: any;
  agent: any;
  apiKey: any;
  auditLog: any;
  complianceRule: any;
  alert: any;
};

async function registerAndLogin(email: string, password: string) {
  mockedPrisma.organization.findUnique.mockResolvedValueOnce(null);
  mockedPrisma.organization.create.mockResolvedValueOnce({
    id: 'org-1',
    name: 'Billing Test',
    email,
    plan: 'free',
    createdAt: new Date().toISOString(),
  });

  await agent.post('/api/v1/auth/register').send({ name: 'Billing Test', email, password });

  mockedPrisma.organization.findUnique.mockResolvedValueOnce({
    id: 'org-1',
    name: 'Billing Test',
    email,
    password: '$2a$10$mockhash',
    plan: 'free',
  });

  const loginRes = await agent.post('/api/v1/auth/login').send({ email, password });

  mockedPrisma.organization.findUnique.mockResolvedValue({
    id: 'org-1',
    name: 'Billing Test',
    email,
    password: '$2a$10$mockhash',
    plan: 'free',
  });

  return loginRes.body.accessToken as string;
}

describe('Billing Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/billing/subscription → 503 when billing not configured', async () => {
    const token = await registerAndLogin('billing1@example.com', 'Password123');

    const res = await agent
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('inactive');
    expect(res.body.reason).toBe('Billing not configured');
  });

  it('POST /api/v1/billing/checkout-session → 400 when billing not configured', async () => {
    const token = await registerAndLogin('billing2@example.com', 'Password123');

    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      plan: 'free',
      stripeCustomerId: null,
    });

    const res = await agent
      .post('/api/v1/billing/checkout-session')
      .set('Authorization', `Bearer ${token}`)
      .send({ priceId: 'price_test' });

    expect([400, 503]).toContain(res.status);
  });
});
