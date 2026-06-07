import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
    $executeRaw: jest.fn(),
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
  complianceReport: any;
  alert: any;
};

describe('Auth Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testUser = {
    name: 'Test User',
    email: 'auth-test@example.com',
    password: 'Password123',
  };

  it('should register a new user', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(null);
    mockedPrisma.organization.create.mockResolvedValue({
      id: 'org-1',
      name: testUser.name,
      email: testUser.email,
      plan: 'free',
      createdAt: new Date().toISOString(),
    });

    const res = await request(app).post('/api/v1/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(testUser.email);
  });

  it('should not register with duplicate email', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

    const res = await request(app).post('/api/v1/auth/register').send(testUser);
    expect(res.status).toBe(409);
  });

  it('should login and return tokens', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: testUser.name,
      email: testUser.email,
      password: '$2a$10$mockhash',
      plan: 'free',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('should reject invalid login', async () => {
    const bcryptMock = jest.requireMock('bcryptjs');
    bcryptMock.compare.mockResolvedValueOnce(false);

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: testUser.name,
      email: testUser.email,
      password: '$2a$10$mockhash',
      plan: 'free',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: testUser.email,
      password: 'WrongPassword123',
    });
    expect(res.status).toBe(401);
  });

  it('should validate input on register', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'short',
      name: '',
    });
    expect(res.status).toBe(400);
  });
});
