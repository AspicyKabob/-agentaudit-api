import request from 'supertest';
import { createApp } from '../../src/app';
import { AgentAuditCallbackHandler } from 'agentaudit-client/langchain';

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
    emailDelivery: {
      create: jest.fn().mockResolvedValue({ id: 'mock-email-delivery-id' }),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
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
  organization: any;
  agent: any;
  apiKey: any;
  auditLog: any;
  complianceRule: any;
  alert: any;
};

async function setupAuth() {
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

describe('LangChain Integration', () => {
  let accessToken: string;
  let apiKey: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-langchain',
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
    const auth = await setupAuth();
    accessToken = auth.accessToken;

    mockedPrisma.apiKey.create.mockResolvedValueOnce({
      id: 'key-langchain',
      name: 'LangChain Test Key',
      createdAt: new Date().toISOString(),
    });

    const apiKeyRes = await request(app)
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'LangChain Test Key' });

    apiKey = apiKeyRes.body.key;
  });

  it('should accept langchain audit log format', async () => {
      mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-langchain',
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
      id: 'log-langchain-1',
      organizationId: 'org-1',
      action: 'langchain_callback',
      prompt: 'What is 2+2?',
      response: '4',
      metadata: { framework: 'langchain', model: 'gpt-4' },
      complianceFlags: [],
      createdAt: new Date().toISOString(),
    });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
    mockedPrisma.alert.create.mockResolvedValueOnce({ id: 'alert-1', severity: 'critical' });

    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'langchain_callback',
        prompt: 'What is 2+2?',
        response: '4',
        metadata: { framework: 'langchain', model: 'gpt-4' },
      });

    expect(res.status).toBe(201);
    expect(res.body.metadata.framework).toBe('langchain');
  });

  it('should exercise the TypeScript SDK AgentAuditCallbackHandler end-to-end', async () => {
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-langchain',
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
      id: 'log-langchain-sdk-1',
      organizationId: 'org-1',
      action: 'llm_start',
      prompt: 'What is the weather?',
      response: null,
      metadata: { model: 'gpt-4o', event: 'llm_start' },
      complianceFlags: [],
      createdAt: new Date().toISOString(),
    });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({
      id: 'log-langchain-sdk-2',
      organizationId: 'org-1',
      action: 'llm_end',
      prompt: null,
      response: 'It is sunny.',
      metadata: { tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, event: 'llm_end' },
      complianceFlags: [],
      createdAt: new Date().toISOString(),
    });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });
    mockedPrisma.alert.create.mockResolvedValueOnce({ id: 'alert-1', severity: 'critical' });

    const handler = new AgentAuditCallbackHandler({
      apiKey,
      baseUrl: 'http://localhost:8080/api/v1',
      agentId: 'agent-langchain',
    }, { guard: false });

    handler.client = {
      log: async (payload: any) => {
        const res = await request(app)
          .post('/api/v1/audit-logs')
          .set('X-API-Key', apiKey)
          .send(payload);
        return res.body;
      },
      guardrail: async () => ({ allowed: true, action: 'allow', violations: [], severity: 'warning' }),
    } as any;

    const langchainHandler = handler.asHandler();
    await langchainHandler.handleLLMStart(
      { kwargs: { model: 'gpt-4o' } },
      ['What is the weather?'],
      'run-1'
    );
    await langchainHandler.handleLLMEnd(
      {
        generations: [[{ text: 'It is sunny.' }]],
        llmOutput: { tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      },
      'run-1'
    );

    expect(handler.trace_id).toBeDefined();
    expect(handler.trace_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
