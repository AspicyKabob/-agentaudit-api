import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const app = createApp();

async function setupAuth() {
  await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Test Org',
      email: 'test@example.com',
      password: 'Password123',
    });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'test@example.com',
      password: 'Password123',
    });

  return loginRes.body;
}

describe('LangChain Integration', () => {
  let accessToken: string;
  let apiKey: string;

  beforeEach(async () => {
    const auth = await setupAuth();
    accessToken = auth.accessToken;

    const apiKeyRes = await request(app)
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'LangChain Test Key' });

    apiKey = apiKeyRes.body.key;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.organization.deleteMany();
  });

  it('should log an agent action via callback pattern', async () => {
    // Simulate LangChain callback behavior
    const logRes = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'llm_start',
        prompt: 'What is the weather?',
        metadata: {
          model: 'gpt-4',
          event: 'llm_start',
          callback_type: 'langchain',
        },
      });

    expect(logRes.status).toBe(201);
    expect(logRes.body.action).toBe('llm_start');
    expect(logRes.body.metadata).toBeDefined();
  });

  it('should log multiple callback events in sequence', async () => {
    const events = [
      { action: 'llm_start', prompt: 'Hello' },
      { action: 'llm_end', response: 'Hi there!' },
      { action: 'tool_start', prompt: 'Search: weather' },
      { action: 'tool_end', response: '72°F, sunny' },
    ];

    for (const event of events) {
      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKey)
        .send({
          ...event,
          metadata: { callback_type: 'langchain' },
        });

      expect(res.status).toBe(201);
    }

    // Verify all logs were created
    const queryRes = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(queryRes.status).toBe(200);
    expect(queryRes.body.data).toHaveLength(4);
    expect(queryRes.body.pagination.total).toBe(4);
  });

  it('should handle tool execution logging', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'tool_start',
        prompt: 'query: customer_123',
        metadata: {
          tool: 'database_query',
          callback_type: 'langchain',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.metadata.tool).toBe('database_query');
  });
});
