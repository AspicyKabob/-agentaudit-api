import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const app = createApp();

async function getAuthTokens() {
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

describe('Audit Batch API', () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe('POST /api/v1/audit-logs/batch', () => {
    it('should submit multiple audit logs in a single batch', async () => {
      const { accessToken } = await getAuthTokens();
      const apiKeyRes = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Key' });

      const apiKey = apiKeyRes.body.key;

      const res = await request(app)
        .post('/api/v1/audit-logs/batch')
        .set('X-API-Key', apiKey)
        .send([
          { action: 'prompt_submitted', prompt: 'Hello?', response: 'Hi there' },
          { action: 'tool_executed', prompt: 'search weather', metadata: { tool: 'weather' } },
        ]);

      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(2);
      expect(res.body.errors).toBe(0);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('action');
      expect(res.body.data[0]).toHaveProperty('complianceFlags');
    });

    it('should return partial results on individual entry failures', async () => {
      const { accessToken } = await getAuthTokens();
      const apiKeyRes = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Key' });

      const apiKey = apiKeyRes.body.key;

      // Submit with an invalid entry (missing required `action`)
      const res = await request(app)
        .post('/api/v1/audit-logs/batch')
        .set('X-API-Key', apiKey)
        .send([
          { action: 'valid_action', prompt: 'Hello?' },
          { prompt: 'missing action' },
        ]);

      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(1);
      expect(res.body.errors).toBe(1);
    });

    it('should reject without API key', async () => {
      const res = await request(app)
        .post('/api/v1/audit-logs/batch')
        .send([
          { action: 'prompt_submitted', prompt: 'Hello?' },
        ]);

      expect(res.status).toBe(401);
    });

    it('should respect batch size limits (max 100)', async () => {
      const { accessToken } = await getAuthTokens();
      const apiKeyRes = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Key' });

      const apiKey = apiKeyRes.body.key;

      const entries = Array.from({ length: 101 }, () => ({ action: 'prompt_submitted' }));
      const res = await request(app)
        .post('/api/v1/audit-logs/batch')
        .set('X-API-Key', apiKey)
        .send(entries);

      expect(res.status).toBe(400);
    });
  });
});
