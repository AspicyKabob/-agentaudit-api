import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
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

  // Ensure authenticate middleware finds the org on subsequent requests
  mockedPrisma.organization.findUnique.mockResolvedValue({
    id: 'org-1',
    name: 'Test Org',
    email: 'test@example.com',
    password: '$2a$10$mockhash',
    plan: 'free',
  });

  return loginRes.body;
}

describe('Audit API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/audit-logs', () => {
    it('should submit audit log with API key', async () => {
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
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([]);
      mockedPrisma.auditLog.create.mockResolvedValueOnce({
        id: 'log-1',
        organizationId: 'org-1',
        action: 'prompt_submitted',
        prompt: 'What is the weather?',
        response: 'It is sunny.',
        metadata: { model: 'gpt-4', tokens: 150 },
        complianceFlags: [],
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValueOnce({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          prompt: 'What is the weather?',
          response: 'It is sunny.',
          metadata: { model: 'gpt-4', tokens: 150 },
        });

      expect(res.status).toBe(201);
      expect(res.body.action).toBe('prompt_submitted');
      expect(res.body).toHaveProperty('id');
    });

    it('should reject without API key', async () => {
      const res = await request(app)
        .post('/api/v1/audit-logs')
        .send({ action: 'prompt_submitted', prompt: 'What is the weather?' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/audit-logs', () => {
    it('should query audit logs with JWT', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.auditLog.findMany.mockResolvedValueOnce([
        { id: 'log-1', action: 'prompt_submitted', createdAt: new Date().toISOString() },
      ]);
      mockedPrisma.auditLog.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });
  });
});
