import express from 'express';
import request from 'supertest';

const counts = new Map<string, number>();

jest.mock('../../src/utils/redis', () => ({
  connectRedis: jest.fn().mockResolvedValue(false),
  getRedisClient: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../src/db/prisma', () => ({
  prisma: {
    rateLimit: {
      upsert: jest.fn(async ({ where }: any) => {
        const id = `${where.key_window.key}:${where.key_window.window.toISOString()}`;
        const count = (counts.get(id) ?? 0) + 1;
        counts.set(id, count);
        return { count };
      }),
      update: jest.fn(async ({ where }: any) => {
        const id = `${where.key_window.key}:${where.key_window.window.toISOString()}`;
        counts.set(id, Math.max(0, (counts.get(id) ?? 0) - 1));
      }),
      deleteMany: jest.fn(),
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

import {
  authLimiter,
  generalLimiter,
  initRateLimiters,
} from '../../src/middleware/rateLimit.middleware';

describe('rate limiter isolation', () => {
  beforeAll(async () => {
    await initRateLimiters();
  });

  beforeEach(() => {
    counts.clear();
  });

  it('keeps general traffic out of the authentication attempt budget', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/login', authLimiter);
    app.use(generalLimiter);
    app.get('/general', (_req, res) => res.status(200).send('ok'));
    app.post('/login', (_req, res) => res.status(401).send('invalid'));

    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/general').expect(200);
    }

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/login').expect(401);
    }

    await request(app).post('/login').expect(429);
  });
});
