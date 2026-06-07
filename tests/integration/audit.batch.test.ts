import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: any) => cb(prisma)),
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

import { prisma } from '../../src/db/prisma';

const mockedPrisma = prisma as unknown as {
  organization: any;
  agent: any;
  apiKey: any;
  auditLog: any;
  complianceRule: any;
  alert: any;
};

async function getAuthTokens() {
  mockedPrisma.organization.findUnique.mockResolvedValueOnce(null);
  mockedPrisma.organization.create.mockResolvedValueOnce({
    id: 'org-1',
    name: 'Test Org',
    email: 'test@example.com',
    plan: 'free',
    createdAt: new Date().toISOString(),
  });

  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test Org', email: 'test@example.com', password: 'Password123' });

  mockedPrisma.organization.findUnique.mockResolvedValueOnce({
    id: 'org-1',
    name: 'Test Org',
    email: 'test@example.com',
    password: '$2a$10$mockhash',
    plan: 'free',
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'test@example.com', password: 'Password123' });

  mockedPrisma.organization.findUnique.mockResolvedValue({
    id: 'org-1',
    name: 'Test Org',
    email: 'test@example.com',
    password: '$2a$10$mockhash',
    plan: 'free',
  });

  return loginRes.body;
}

describe('Audit Batch API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/audit-logs/batch', () => {
    it('should submit multiple audit logs in a single batch', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.apiKey.create.mockResolvedValueOnce({
        id: 'key-1',
        name: 'Test Key',
        createdAt: new Date().toISOString(),
      });

      const apiKeyRes = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Key' });

      mockedPrisma.apiKey.findUnique.mockResolvedValueOnce({
        id: 'key-1',
        organizationId: 'org-1',
        revokedAt: null,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          email: 'test@example.com',
          plan: 'free',
          apiQuota: 1000,
          apiUsed: 0,
          notifyWebhook: false,
          notifyEmail: false,
        },
      });

      mockedPrisma.complianceRule.findMany.mockResolvedValue([]);
      mockedPrisma.auditLog.create.mockResolvedValue({
        id: 'log-1',
        organizationId: 'org-1',
        action: 'prompt_submitted',
        prompt: 'Hello?',
        response: 'Hi!',
        metadata: { model: 'gpt-4' },
        complianceFlags: [],
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValueOnce({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs/batch')
        .set('X-API-Key', apiKeyRes.body.key)
        .send([
          { action: 'prompt_submitted', prompt: 'Hello?', response: 'Hi!', metadata: { model: 'gpt-4' } },
          { action: 'prompt_submitted', prompt: 'How are you?', response: 'Good!', metadata: { model: 'gpt-4' } },
        ]);

      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(2);
    });
  });
});
