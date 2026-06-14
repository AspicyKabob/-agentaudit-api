import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn((input: any) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input({
        auditLog: { create: jest.fn() },
        complianceRule: { create: jest.fn() },
      });
    }),
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
      deleteMany: jest.fn(),
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

jest.mock('../../src/utils/apiKey', () => ({
  __esModule: true,
  generateApiKey: jest.fn().mockReturnValue('aa_testapikey'),
  hashApiKey: jest.fn().mockReturnValue('testkeyhash'),
}));

import { prisma } from '../../src/db/prisma';
import { PACKS } from '../../src/domains/compliance/compliance.types';

const mockedPrisma = prisma as unknown as {
  organization: any;
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

describe('Compliance Packs API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/compliance-rules/packs', () => {
    it('lists available packs', async () => {
      const { accessToken } = await getAuthTokens();

      const res = await request(app)
        .get('/api/v1/compliance-rules/packs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.map((p: any) => p.id)).toEqual(['hippo', 'finance', 'gdpr']);
    });
  });

  describe('POST /api/v1/compliance-rules/packs', () => {
    it('installs a pack and returns created rules', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([]);
      mockedPrisma.complianceRule.create.mockImplementation((args: any) => ({
        id: `rule-${args.data.name}`,
        ...args.data,
        createdAt: new Date().toISOString(),
      }));

      const res = await request(app)
        .post('/api/v1/compliance-rules/packs')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ packId: 'gdpr' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(PACKS.gdpr.rules.length);
      expect(res.body[0]).toHaveProperty('packId', 'gdpr');
    });

    it('rejects installing an unknown pack', async () => {
      const { accessToken } = await getAuthTokens();

      const res = await request(app)
        .post('/api/v1/compliance-rules/packs')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ packId: 'unknown-pack' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/compliance-rules/packs/installed', () => {
    it('returns installed packs for the organization', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { packId: 'hippo' },
        { packId: 'gdpr' },
      ]);

      const res = await request(app)
        .get('/api/v1/compliance-rules/packs/installed')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.map((p: any) => p.id).sort();
      expect(ids).toEqual(['gdpr', 'hippo']);
    });
  });

  describe('DELETE /api/v1/compliance-rules/packs/:id', () => {
    it('removes an installed pack', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.complianceRule.deleteMany.mockResolvedValueOnce({ count: 3 });

      const res = await request(app)
        .delete('/api/v1/compliance-rules/packs/hippo')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 3 });
    });

    it('rejects removing an unknown pack', async () => {
      const { accessToken } = await getAuthTokens();

      const res = await request(app)
        .delete('/api/v1/compliance-rules/packs/unknown')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('Pack rule evaluation', () => {
    it('flags PII when a pack is installed and an audit log is submitted', async () => {
      await getAuthTokens();

      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce(PACKS.hippo.rules.map((rule, idx) => ({
        id: `rule-${idx}`,
        organizationId: 'org-1',
        name: rule.name,
        ruleType: rule.ruleType,
        condition: rule.condition,
        severity: rule.severity,
        isActive: true,
        packId: 'hippo',
      })));

      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) => ({
        id: 'log-1',
        ...args.data,
        createdAt: new Date().toISOString(),
      }));

      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });

      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValueOnce({ id: 'alert-1', severity: 'critical' });

      const { auditService } = await import('../../src/domains/audit/audit.service');
      const log = await auditService.submit('org-1', {
        action: 'prompt_submitted',
        prompt: 'My SSN is 123-45-6789',
        response: 'Here is your info',
      });

      expect(log.complianceFlags).toContain('CRITICAL_pii_detect_SSN Detection');
    });
  });
});
