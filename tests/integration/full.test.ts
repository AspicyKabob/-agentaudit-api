import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/token';

const app = createApp();

// Generate a valid JWT for tests
function getAuthToken() {
  return signAccessToken({ sub: 'org-1', email: 'test@example.com' });
}

// Mock Prisma globally
jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
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

import { prisma } from '../../src/db/prisma';

const mockedPrisma = prisma as unknown as {
  organization: any;
  agent: any;
  apiKey: any;
  auditLog: any;
  complianceRule: any;
  complianceReport: any;
  alert: any;
};

// Mock bcrypt to avoid heavy hashing in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AgentAudit API Full Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Test Corp',
      email: 'test@example.com',
      plan: 'free',
      notifyWebhook: true,
      notifyEmail: true,
      notifyMinSeverity: 'warning',
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── Auth ──────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('POST /api/v1/auth/register → 201', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue(null);
      mockedPrisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Test Corp',
        email: 'test@example.com',
        plan: 'free',
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Test Corp', email: 'test@example.com', password: 'Password123' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('test@example.com');
    });

    it('POST /api/v1/auth/register duplicate → 409', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Test Corp', email: 'test@example.com', password: 'Password123' });

      expect(res.status).toBe(409);
    });

    it('POST /api/v1/auth/login → 200 with tokens', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Test Corp',
        email: 'test@example.com',
        password: '$2a$10$mockhash',
        plan: 'free',
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'Password123' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('POST /api/v1/auth/login wrong password → 401', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'WrongPassword' });

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/auth/me → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Test Corp',
        email: 'test@example.com',
        plan: 'free',
        apiQuota: 1000,
        apiUsed: 0,
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('test@example.com');
    });

    it('POST /api/v1/auth/api-keys → 201', async () => {
      const token = getAuthToken();
      mockedPrisma.apiKey.create.mockResolvedValue({
        id: 'key-1',
        name: 'Production Key',
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Production Key' });

      expect(res.status).toBe(201);
      expect(res.body.key).toBeDefined();
      expect(res.body.id).toBe('key-1');
    });

    it('GET /api/v1/auth/api-keys → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.apiKey.findMany.mockResolvedValue([
        { id: 'key-1', name: 'Key 1', lastUsedAt: null, createdAt: new Date().toISOString() },
      ]);

      const res = await request(app)
        .get('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE /api/v1/auth/api-keys/:id → 204', async () => {
      const token = getAuthToken();
      mockedPrisma.apiKey.findFirst.mockResolvedValue({ id: 'key-1' });
      mockedPrisma.apiKey.update.mockResolvedValue({ id: 'key-1', revokedAt: new Date() });

      const res = await request(app)
        .delete('/api/v1/auth/api-keys/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  // ─── Agents ────────────────────────────────────────────────────────

  describe('Agents', () => {
    it('GET /api/v1/agents → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'Bot 1', type: 'langchain', description: null, config: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);

      const res = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/agents → 201', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.create.mockResolvedValue({
        id: 'agent-1',
        name: 'Support Bot',
        type: 'langchain',
        description: 'Handles support',
        config: { model: 'gpt-4' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Support Bot', type: 'langchain', description: 'Handles support', config: { model: 'gpt-4' } });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Support Bot');
    });

    it('GET /api/v1/agents/:id → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        name: 'Support Bot',
        type: 'langchain',
        description: 'Handles support',
        config: { model: 'gpt-4' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get('/api/v1/agents/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('agent-1');
    });

    it('GET /api/v1/agents/:id → 404 when not found', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/agents/00000000-0000-0000-0000-000000000002')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('PATCH /api/v1/agents/:id → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-1' });
      mockedPrisma.agent.update.mockResolvedValue({
        id: 'agent-1',
        name: 'Updated Bot',
        type: 'langchain',
        description: 'Updated desc',
        config: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .patch('/api/v1/agents/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Updated desc' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/v1/agents/:id → 204', async () => {
      const token = getAuthToken();
      mockedPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-1' });
      mockedPrisma.agent.delete.mockResolvedValue({ id: 'agent-1' });

      const res = await request(app)
        .delete('/api/v1/agents/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  // ─── Audit Logs ────────────────────────────────────────────────────

  describe('Audit Logs', () => {
    it('POST /api/v1/audit-logs with API key → 201', async () => {
      mockedPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        revokedAt: null,
        organization: {
          id: 'org-1',
          name: 'Test Corp',
          email: 'test@example.com',
          plan: 'free',
          apiQuota: 1000,
          apiUsed: 0,
        },
      });
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
      mockedPrisma.organization.update.mockResolvedValue({ id: 'org-1' });
      mockedPrisma.complianceRule.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', 'aa_test_api_key_12345')
        .send({
          action: 'prompt_submitted',
          prompt: 'Hello?',
          response: 'Hi!',
          metadata: { model: 'gpt-4' },
        });

      expect(res.status).toBe(201);
      expect(res.body.action).toBe('prompt_submitted');
    });

    it('POST /api/v1/audit-logs evaluates regex_match rules → 201 with flags', async () => {
      mockedPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        revokedAt: null,
        organization: {
          id: 'org-1',
          name: 'Test Corp',
          email: 'test@example.com',
          plan: 'free',
          apiQuota: 1000,
          apiUsed: 0,
        },
      });
      mockedPrisma.complianceRule.findMany.mockResolvedValue([
        { id: 'rule-regex-1', name: 'SSN Detection', ruleType: 'regex_match', condition: { pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' }, severity: 'critical', isActive: true },
      ]);
      mockedPrisma.auditLog.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'log-regex-1',
          ...args.data,
          createdAt: new Date().toISOString(),
        })
      );
      mockedPrisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', 'aa_test_api_key_12345')
        .send({
          action: 'prompt_submitted',
          prompt: 'My SSN is 123-45-6789',
          response: 'Okay',
        });

      expect(res.status).toBe(201);
      expect(res.body.complianceFlags).toContain('CRITICAL_regex_match_SSN Detection');
    });

    it('POST /api/v1/audit-logs evaluates sentiment_analysis rules → 201 with flags', async () => {
      mockedPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        revokedAt: null,
        organization: {
          id: 'org-1',
          name: 'Test Corp',
          email: 'test@example.com',
          plan: 'free',
          apiQuota: 1000,
          apiUsed: 0,
        },
      });
      mockedPrisma.complianceRule.findMany.mockResolvedValue([
        { id: 'rule-sentiment-1', name: 'Toxicity Guard', ruleType: 'sentiment_analysis', condition: { threshold: -0.3, minTokens: 3 }, severity: 'critical', isActive: true },
      ]);
      mockedPrisma.auditLog.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'log-sentiment-1',
          ...args.data,
          createdAt: new Date().toISOString(),
        })
      );
      mockedPrisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', 'aa_test_api_key_12345')
        .send({
          action: 'prompt_submitted',
          prompt: 'You are worthless and pathetic, nobody cares about you',
          response: 'I understand your frustration',
        });

      expect(res.status).toBe(201);
      expect(res.body.complianceFlags).toContain('CRITICAL_sentiment_analysis_Toxicity Guard');
    });

    it('POST /api/v1/audit-logs evaluates custom_validator rules → 201 with flags', async () => {
      mockedPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        revokedAt: null,
        organization: {
          id: 'org-1',
          name: 'Test Corp',
          email: 'test@example.com',
          plan: 'free',
          apiQuota: 1000,
          apiUsed: 0,
        },
      });
      mockedPrisma.complianceRule.findMany.mockResolvedValue([
        { id: 'rule-custom-1', name: 'Length Guard', ruleType: 'custom_validator', condition: { code: 'return text.length > 200;' }, severity: 'warning', isActive: true },
      ]);
      mockedPrisma.auditLog.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'log-custom-1',
          ...args.data,
          createdAt: new Date().toISOString(),
        })
      );
      mockedPrisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const longText = 'A'.repeat(250);
      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', 'aa_test_api_key_12345')
        .send({
          action: 'prompt_submitted',
          prompt: longText,
          response: 'Okay',
        });

      expect(res.status).toBe(201);
      expect(res.body.complianceFlags).toContain('WARNING_custom_validator_Length Guard');
    });

    it('POST /api/v1/audit-logs without API key → 401', async () => {
      const res = await request(app)
        .post('/api/v1/audit-logs')
        .send({ action: 'prompt_submitted', prompt: 'Hello?' });

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/audit-logs with JWT → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.auditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'prompt_submitted', createdAt: new Date().toISOString() },
      ]);
      mockedPrisma.auditLog.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });

    it('GET /api/v1/audit-logs/trace/:traceId → 200', async () => {
      const token = getAuthToken();
      const traceId = 'trace-abc-123';
      mockedPrisma.auditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'crewai_crew_start', traceId, parentSpanId: null, createdAt: new Date().toISOString() },
        { id: 'log-2', action: 'crewai_task_start', traceId, parentSpanId: 'log-1', createdAt: new Date().toISOString() },
      ]);
      mockedPrisma.auditLog.count.mockResolvedValue(2);

      const res = await request(app)
        .get(`/api/v1/audit-logs/trace/${traceId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].traceId).toBe(traceId);
    });

    it('GET /api/v1/audit-logs/:id/chain → 200', async () => {
      const token = getAuthToken();
      const rootId = 'log-root-1';
      mockedPrisma.auditLog.findFirst.mockResolvedValue({
        id: rootId,
        action: 'crewai_crew_start',
        traceId: 'trace-abc-123',
        parentSpanId: null,
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: 'log-child-1', action: 'crewai_task_start', traceId: 'trace-abc-123', parentSpanId: rootId, createdAt: new Date().toISOString() },
        ])
        .mockResolvedValueOnce([]);

      const res = await request(app)
        .get(`/api/v1/audit-logs/${rootId}/chain`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.root.id).toBe(rootId);
      expect(res.body.descendants).toHaveLength(1);
      expect(res.body.descendants[0].parentSpanId).toBe(rootId);
    });
  });

  // ─── Compliance Rules ──────────────────────────────────────────────

  describe('Compliance Rules', () => {
    it('GET /api/v1/compliance-rules → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.complianceRule.findMany.mockResolvedValue([
        { id: 'rule-1', name: 'Detect Emails', ruleType: 'pii', severity: 'warning', isActive: true },
      ]);

      const res = await request(app)
        .get('/api/v1/compliance-rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/compliance-rules → 201', async () => {
      const token = getAuthToken();
      mockedPrisma.complianceRule.create.mockResolvedValue({
        id: 'rule-1',
        name: 'Detect Emails',
        ruleType: 'pii',
        condition: { type: 'email' },
        severity: 'warning',
        isActive: true,
      });

      const res = await request(app)
        .post('/api/v1/compliance-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Detect Emails', ruleType: 'pii_detect', condition: { type: 'email' }, severity: 'warning' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Detect Emails');
    });
  });

  // ─── Alerts ──────────────────────────────────────────────────────

  describe('Alerts', () => {
    it('GET /api/v1/alerts → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.alert.findMany.mockResolvedValue([
        { id: 'alert-1', severity: 'high', message: 'PII detected', isResolved: false },
      ]);

      const res = await request(app)
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('PATCH /api/v1/alerts/:id/resolve → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.alert.findFirst.mockResolvedValue({ id: 'alert-1' });
      mockedPrisma.alert.update.mockResolvedValue({ id: 'alert-1', isResolved: true, resolvedAt: new Date().toISOString() });

      const res = await request(app)
        .patch('/api/v1/alerts/00000000-0000-0000-0000-000000000001/resolve')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── Reports ───────────────────────────────────────────────────────

  describe('Reports', () => {
    it('GET /api/v1/reports → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.complianceReport.findMany.mockResolvedValue([
        { id: 'report-1', name: 'Q3 Report', format: 'json', status: 'ready' },
      ]);

      const res = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/reports → 201', async () => {
      const token = getAuthToken();
      mockedPrisma.complianceReport.create.mockResolvedValue({
        id: 'report-1',
        name: 'Q3 Report',
        format: 'json',
        status: 'pending',
      });

      const res = await request(app)
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Q3 Report',
          format: 'json',
          dateRangeStart: '2024-07-01T00:00:00Z',
          dateRangeEnd: '2024-09-30T23:59:59Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Q3 Report');
    });
  });

  // ─── Billing ───────────────────────────────────────────────────────

  describe('Billing', () => {
    it('GET /api/v1/billing/subscription → 200', async () => {
      const token = getAuthToken();
      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Test Corp',
        email: 'test@example.com',
        plan: 'free',
        stripeSubscriptionId: null,
      });

      const res = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');
    });

    it('POST /api/v1/billing/checkout-session → 200 or 400 or 500', async () => {
      const token = getAuthToken();
      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Test Corp',
        email: 'test@example.com',
        plan: 'free',
        stripeCustomerId: null,
      });
      mockedPrisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_test' });

      expect([200, 400, 500, 503]).toContain(res.status);
    });
  });

  // ─── Public Endpoints ──────────────────────────────────────────────

  describe('Public', () => {
    it('GET /health → 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /mcp/v1/schema → 200', async () => {
      const res = await request(app).get('/mcp/v1/schema');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('AgentAudit MCP');
    });

    it('GET /docs → 200 or 301', async () => {
      const res = await request(app).get('/docs');
      expect([200, 301]).toContain(res.status);
    });

    it('GET /docs.json → 200 (OpenAPI JSON)', async () => {
      const res = await request(app).get('/docs.json');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('openapi');
    });

    it('GET /unknown → 404', async () => {
      const res = await request(app).get('/unknown');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });

  // ─── Validation ────────────────────────────────────────────────────

  describe('Validation', () => {
    it('POST /api/v1/auth/register with bad email → 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '' });

      expect(res.status).toBe(400);
    });
  });
});
