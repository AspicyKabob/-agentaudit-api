import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const app = createApp();
const agent = request.agent(app);

describe('Auth Integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const testUser = {
    name: 'Test User',
    email: 'auth-test@example.com',
    password: 'Password123',
  };

  it('should register a new user', async () => {
    await prisma.organization.deleteMany({ where: { email: testUser.email } });
    const res = await agent.post('/api/v1/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(testUser.email);
  });

  it('should not register with duplicate email', async () => {
    const res = await agent.post('/api/v1/auth/register').send(testUser);
    expect(res.status).toBe(409);
  });

  it('should login and return tokens', async () => {
    const res = await agent.post('/api/v1/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('should reject invalid login', async () => {
    const res = await agent.post('/api/v1/auth/login').send({
      email: testUser.email,
      password: 'WrongPassword123',
    });
    expect(res.status).toBe(401);
  });

  it('should validate input on register', async () => {
    const res = await agent.post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'short',
      name: '',
    });
    expect(res.status).toBe(400);
  });
});
