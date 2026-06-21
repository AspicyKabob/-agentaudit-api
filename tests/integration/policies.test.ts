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
        policy: { create: jest.fn() },
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
    policy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    agentPolicy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
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
    policyVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
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

const mockedPrisma = prisma as unknown as {
  $transaction: any;
  organization: any;
  agent: any;
  apiKey: any;
  auditLog: any;
  complianceRule: any;
  policy: any;
  policyVersion: any;
  agentPolicy: any;
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

describe('Policies API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset implementations that accumulate mockResolvedValueOnce queues across tests.
    mockedPrisma.complianceRule.findMany.mockReset();
    mockedPrisma.auditLog.create.mockReset();
    mockedPrisma.alert.create.mockReset();
    mockedPrisma.agentPolicy.findMany.mockReset();
    mockedPrisma.agent.findMany.mockReset();
    mockedPrisma.agent.findMany.mockResolvedValue([
      { id: '00000000-0000-0000-0000-000000000003' },
    ]);
    mockedPrisma.agent.findFirst.mockReset();
    mockedPrisma.policyVersion.findFirst.mockReset();
    mockedPrisma.policyVersion.findMany.mockReset();
    mockedPrisma.policyVersion.create.mockReset();
  });

  describe('GET /api/v1/policies', () => {
    it('lists policies', async () => {
      const { accessToken } = await getAuthTokens();
      mockedPrisma.policy.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/v1/policies')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/v1/policies', () => {
    it('creates an empty policy', async () => {
      const { accessToken } = await getAuthTokens();
      mockedPrisma.policy.create.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000001',
        organizationId: 'org-1',
        name: 'Custom Policy',
        description: 'My policy',
        isActive: true,
        sourcePackId: null,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Custom Policy', description: 'My policy' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Custom Policy');
    });
  });

  describe('GET /api/v1/policies/:id', () => {
    it('returns policy with rules and agents', async () => {
      const { accessToken } = await getAuthTokens();
      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000001',
        organizationId: 'org-1',
        name: 'Custom Policy',
        rules: [],
        agentPolicies: [],
      });

      const res = await request(app)
        .get('/api/v1/policies/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('POST /api/v1/policies/clone-pack', () => {
    it('clones a pre-built pack into a policy', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.create.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000002',
        organizationId: 'org-1',
        name: 'HIPAA Clone',
        description: 'Cloned pack',
        sourcePackId: 'hippo',
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.complianceRule.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: `rule-${args.data.name}`,
          ...args.data,
          createdAt: new Date().toISOString(),
        })
      );

      const res = await request(app)
        .post('/api/v1/policies/clone-pack')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'HIPAA Clone', description: 'Cloned pack', packId: 'hippo' });

      expect(res.status).toBe(201);
      expect(res.body.rules).toHaveLength(3);
      expect(res.body.sourcePackId).toBe('hippo');
    });
  });

  describe('POST /api/v1/policies/:id/agents', () => {
    it('assigns a policy to an agent', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({         id: '00000000-0000-0000-0000-000000000001', organizationId: 'org-1' });
      mockedPrisma.agent.findFirst.mockResolvedValueOnce({         id: '00000000-0000-0000-0000-000000000003', organizationId: 'org-1' });
      mockedPrisma.agentPolicy.upsert.mockResolvedValueOnce({         id: 'ap-1',
        agentId: '00000000-0000-0000-0000-000000000003',
        policyId: '00000000-0000-0000-0000-000000000001',
      });

      const res = await request(app)
        .post('/api/v1/policies/00000000-0000-0000-0000-000000000001/agents')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ agentId: '00000000-0000-0000-0000-000000000003' });

      expect(res.status).toBe(201);
      expect(res.body.agentId).toBe('00000000-0000-0000-0000-000000000003');
    });
  });

  describe('DELETE /api/v1/policies/:id/agents', () => {
    it('removes a policy from an agent', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.agentPolicy.findFirst.mockResolvedValueOnce({         id: 'ap-1',
        agentId: '00000000-0000-0000-0000-000000000003',
        policyId: '00000000-0000-0000-0000-000000000001',
      });
      mockedPrisma.agentPolicy.delete.mockResolvedValueOnce({});

      const res = await request(app)
        .delete('/api/v1/policies/00000000-0000-0000-0000-000000000001/agents')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ agentId: '00000000-0000-0000-0000-000000000003' });

      expect(res.status).toBe(204);
    });
  });

  describe('Policy-scoped rule evaluation', () => {
    it('evaluates only rules from policies assigned to the agent', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([{ policyId: '00000000-0000-0000-0000-000000000002' }]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { id: 'rule-ssn', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, policy: { mode: 'flag', priority: 0 } },
      ]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
        });

      expect(res.status).toBe(201);
      expect(res.body.complianceFlags).toContain('CRITICAL_pii_detect_SSN Detection');
    });

    it('returns enforcementAction block when a block-mode policy is triggered', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([{ policyId: '00000000-0000-0000-0000-000000000002' }]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { id: 'rule-ssn', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, actionOverride: null, policy: { mode: 'block', priority: 10 } },
      ]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('block');
      expect(res.body.complianceFlags).toContain('CRITICAL_pii_detect_SSN Detection');
    });

    it('resolves conflicting policy actions by priority and restrictiveness', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([
        { policyId: '00000000-0000-0000-0000-000000000002' },
        { policyId: '00000000-0000-0000-0000-000000000003' },
      ]);

      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { id: 'rule-ssn', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, actionOverride: null, policy: { mode: 'flag', priority: 0 } },
        { id: 'rule-ssn-dup', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000003', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, actionOverride: null, policy: { mode: 'block', priority: 5 } },
      ]);

      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('block');
    });

    it('honors a rule actionOverride over the policy mode', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([{ policyId: '00000000-0000-0000-0000-000000000002' }]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { id: 'rule-ssn', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, actionOverride: 'log', policy: { mode: 'block', priority: 10 } },
      ]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('log');
      expect(res.body.complianceFlags).toContain('CRITICAL_pii_detect_SSN Detection');
    });

    it('skips policy rules when agent type condition does not match', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agent.findFirst.mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000003', type: 'langchain' });
      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([
        { policyId: '00000000-0000-0000-0000-000000000002', policy: { conditions: { agentTypes: ['crewai'] } } },
      ]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('allow');
      expect(res.body.complianceFlags).toHaveLength(0);
    });

    it('applies policy rules when metadata conditions match', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agent.findFirst.mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000003', type: 'custom' });
      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([
        { policyId: '00000000-0000-0000-0000-000000000002', policy: { conditions: { metadata: [{ key: 'env', operator: 'eq', value: 'production' }] } } },
      ]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([
        { id: 'rule-ssn', organizationId: 'org-1', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] }, severity: 'critical', isActive: true, actionOverride: null, policy: { mode: 'block', priority: 0 } },
      ]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        email: 'test@example.com',
        notifyWebhook: false,
        notifyEmail: false,
        notifyMinSeverity: 'warning',
      });
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
      mockedPrisma.alert.create.mockResolvedValue({ id: 'alert-1', severity: 'critical' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
          metadata: { env: 'production' },
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('block');
      expect(res.body.complianceFlags).toContain('CRITICAL_pii_detect_SSN Detection');
    });

    it('skips policy rules when metadata conditions do not match', async () => {
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

      mockedPrisma.apiKey.findUnique.mockResolvedValue({
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

      mockedPrisma.agent.findFirst.mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000003', type: 'custom' });
      mockedPrisma.agentPolicy.findMany.mockResolvedValueOnce([
        { policyId: '00000000-0000-0000-0000-000000000002', policy: { conditions: { metadata: [{ key: 'env', operator: 'eq', value: 'production' }] } } },
      ]);
      mockedPrisma.complianceRule.findMany.mockResolvedValueOnce([]);
      mockedPrisma.auditLog.create.mockImplementationOnce((args: any) =>
        Promise.resolve({ id: 'log-1', ...args.data, createdAt: new Date().toISOString() })
      );
      mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKeyRes.body.key)
        .send({
          action: 'prompt_submitted',
          agentId: '00000000-0000-0000-0000-000000000003',
          prompt: 'My SSN is 123-45-6789',
          response: 'Here is your info',
          metadata: { env: 'staging' },
        });

      expect(res.status).toBe(201);
      expect(res.body.enforcementAction).toBe('allow');
      expect(res.body.complianceFlags).toHaveLength(0);
    });
  });

  describe('GET /api/v1/policies/:id/analytics', () => {
    it('returns detailed analytics for a policy', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000002',
        organizationId: 'org-1',
        name: 'Production Guard',
        mode: 'block',
        priority: 10,
        agentPolicies: [],
      });

      mockedPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-1',
          organizationId: 'org-1',
          agentId: '00000000-0000-0000-0000-000000000003',
          action: 'prompt_submitted',
          enforcementAction: 'block',
          violationDetails: [
            { ruleId: 'rule-ssn', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', severity: 'critical' },
          ],
          createdAt: new Date(),
          agent: { id: '00000000-0000-0000-0000-000000000003', name: 'Researcher' },
        },
        {
          id: 'log-2',
          organizationId: 'org-1',
          agentId: null,
          action: 'prompt_submitted',
          enforcementAction: 'allow',
          violationDetails: [],
          createdAt: new Date(),
          agent: null,
        },
      ]);

      const res = await request(app)
        .get('/api/v1/policies/00000000-0000-0000-0000-000000000002/analytics')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.policyId).toBe('00000000-0000-0000-0000-000000000002');
      expect(res.body.policyName).toBe('Production Guard');
      expect(res.body.totalAudits).toBe(1);
      expect(res.body.totalViolations).toBe(1);
      expect(res.body.blockCount).toBe(1);
      expect(res.body.ruleBreakdown).toHaveLength(1);
      expect(res.body.ruleBreakdown[0].ruleName).toBe('SSN Detection');
    });

    it('returns 404 when policy is not found', async () => {
      const { accessToken } = await getAuthTokens();
      mockedPrisma.policy.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/policies/00000000-0000-0000-0000-000000000999/analytics')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/policies/:id/versions', () => {
    it('creates a manual policy version', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000001',
        organizationId: 'org-1',
        name: 'Custom Policy',
        description: 'My policy',
        mode: 'flag',
        priority: 0,
        conditions: null,
        rules: [],
      });
      mockedPrisma.policyVersion.findFirst.mockResolvedValueOnce(null);
      mockedPrisma.policyVersion.create.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000010',
        policyId: '00000000-0000-0000-0000-000000000001',
        versionNumber: 1,
        name: 'Manual Snapshot',
        description: 'My policy',
        mode: 'flag',
        priority: 0,
        restoredFromId: null,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/policies/00000000-0000-0000-0000-000000000001/versions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Manual Snapshot' });

      expect(res.status).toBe(201);
      expect(res.body.versionNumber).toBe(1);
      expect(res.body.name).toBe('Manual Snapshot');
    });
  });

  describe('GET /api/v1/policies/:id/versions', () => {
    it('lists policy versions', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000001',
        organizationId: 'org-1',
      });
      mockedPrisma.policyVersion.findMany.mockResolvedValueOnce([
        {
          id: '00000000-0000-0000-0000-000000000011',
          policyId: '00000000-0000-0000-0000-000000000001',
          versionNumber: 2,
          name: 'v2',
          description: null,
          mode: 'block',
          priority: 10,
          restoredFromId: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: '00000000-0000-0000-0000-000000000010',
          policyId: '00000000-0000-0000-0000-000000000001',
          versionNumber: 1,
          name: 'v1',
          description: null,
          mode: 'flag',
          priority: 0,
          restoredFromId: null,
          createdAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app)
        .get('/api/v1/policies/00000000-0000-0000-0000-000000000001/versions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].versionNumber).toBe(2);
    });
  });

  describe('GET /api/v1/policies/:id/versions/:versionId', () => {
    it('returns a specific version with rules', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policyVersion.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000011',
        policyId: '00000000-0000-0000-0000-000000000001',
        versionNumber: 2,
        name: 'v2',
        description: null,
        mode: 'block',
        priority: 10,
        conditions: null,
        rules: [{ id: 'rule-1', name: 'SSN Detection', ruleType: 'pii_detect', severity: 'critical' }],
        restoredFromId: null,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get('/api/v1/policies/00000000-0000-0000-0000-000000000001/versions/00000000-0000-0000-0000-000000000011')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.versionNumber).toBe(2);
      expect(res.body.rules).toHaveLength(1);
    });
  });

  describe('POST /api/v1/policies/:id/versions/:versionId/restore', () => {
    it('restores a policy from a previous version', async () => {
      const { accessToken } = await getAuthTokens();

      const restoredVersionId = '00000000-0000-0000-0000-000000000012';
      const versionId = '00000000-0000-0000-0000-000000000011';
      const policyId = '00000000-0000-0000-0000-000000000001';

      mockedPrisma.policyVersion.findFirst.mockResolvedValueOnce({
        id: versionId,
        policyId,
        versionNumber: 2,
        name: 'v2',
        description: null,
        mode: 'block',
        priority: 10,
        conditions: null,
        rules: [{ id: 'rule-1', name: 'SSN Detection', ruleType: 'pii_detect', severity: 'critical' }],
        restoredFromId: null,
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: policyId,
        organizationId: 'org-1',
        name: 'v2',
        mode: 'block',
        priority: 10,
      });
      let txResolve: any;
      mockedPrisma.policyVersion.findFirst.mockResolvedValueOnce({
        id: versionId,
        policyId,
        versionNumber: 2,
        name: 'v2',
        description: null,
        mode: 'block',
        priority: 10,
        conditions: null,
        rules: [{ id: 'rule-1', name: 'SSN Detection', ruleType: 'pii_detect', severity: 'critical' }],
        restoredFromId: null,
        createdAt: new Date().toISOString(),
      });
      mockedPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          policy: {
            update: jest.fn().mockResolvedValue({
              id: policyId,
              organizationId: 'org-1',
              name: 'v2',
              mode: 'block',
              priority: 10,
            }),
          },
          complianceRule: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({ id: 'rule-1' }) },
        };
        return await fn(tx);
      });
      mockedPrisma.policyVersion.findFirst.mockResolvedValueOnce(null);
      mockedPrisma.policyVersion.create.mockResolvedValueOnce({
        id: restoredVersionId,
        policyId,
        versionNumber: 3,
        name: 'v2 (restored from v2)',
        description: null,
        mode: 'block',
        priority: 10,
        restoredFromId: versionId,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/api/v1/policies/${policyId}/versions/${versionId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.versionNumber).toBe(3);
      expect(res.body.restoredFromId).toBe(versionId);
    });
  });

  describe('GET /api/v1/policies/analytics', () => {
    it('returns analytics summary for all policies', async () => {
      const { accessToken } = await getAuthTokens();

      mockedPrisma.policy.findMany.mockResolvedValueOnce([
        {
          id: '00000000-0000-0000-0000-000000000002',
          organizationId: 'org-1',
          name: 'Production Guard',
          mode: 'block',
          priority: 10,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          organizationId: 'org-1',
          name: 'Audit Only',
          mode: 'log',
          priority: 0,
        },
      ]);

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000002',
        organizationId: 'org-1',
        name: 'Production Guard',
        mode: 'block',
        priority: 10,
        agentPolicies: [],
      });
      mockedPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-1',
          organizationId: 'org-1',
          agentId: '00000000-0000-0000-0000-000000000003',
          action: 'prompt_submitted',
          enforcementAction: 'block',
          violationDetails: [
            { ruleId: 'rule-ssn', policyId: '00000000-0000-0000-0000-000000000002', name: 'SSN Detection', ruleType: 'pii_detect', severity: 'critical' },
          ],
          createdAt: new Date(),
          agent: { id: '00000000-0000-0000-0000-000000000003', name: 'Researcher' },
        },
      ]);

      mockedPrisma.policy.findFirst.mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000003',
        organizationId: 'org-1',
        name: 'Audit Only',
        mode: 'log',
        priority: 0,
        agentPolicies: [],
      });
      mockedPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/v1/policies/analytics')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].policyName).toBe('Production Guard');
      expect(res.body.data[0].totalViolations).toBe(1);
      expect(res.body.data[1].totalViolations).toBe(0);
    });
  });
});
