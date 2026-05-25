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

describe('Audit API', () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe('POST /api/v1/audit-logs', () => {
    it('should submit audit log with API key', async () => {
      const { accessToken } = await getAuthTokens();

      // Create API key
      const apiKeyRes = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Key' });

      const apiKey = apiKeyRes.body.key;

      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKey)
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
        .send({
          action: 'prompt_submitted',
          prompt: 'What is the weather?',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/audit-logs', () => {
    it('should query audit logs with JWT', async () => {
      const { accessToken } = await getAuthTokens();

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });
  });
});
