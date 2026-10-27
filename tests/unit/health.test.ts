import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';
import { getRedisClient } from '../../src/utils/redis';
import { redisStoreActive } from '../../src/middleware/rateLimit.middleware';

jest.mock('../../src/db/prisma', () => ({ prisma: { $executeRaw: jest.fn() } }));
jest.mock('../../src/utils/redis', () => ({ getRedisClient: jest.fn() }));
jest.mock('../../src/middleware/rateLimit.middleware', () => ({
  redisStoreActive: jest.fn(),
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  singleLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  batchLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  readLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();
const database = prisma.$executeRaw as jest.Mock;
const redisActive = redisStoreActive as jest.Mock;
const redisClient = getRedisClient as jest.Mock;

describe('public health checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    database.mockResolvedValue(1);
    redisActive.mockReturnValue(false);
  });

  it('reports the optional Redis-disabled mode without caching the result', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body.dependencies).toEqual({ database: 'up', redis: 'disabled' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(Number.isNaN(Date.parse(response.body.checkedAt))).toBe(false);
  });

  it('allows credential-free health checks from an independently hosted status page', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://status.example.invalid').expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id');
  });

  it('reports database failure without exposing internal errors', async () => {
    database.mockRejectedValue(new Error('private database credentials'));
    const response = await request(app).get('/health').expect(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies.database).toBe('down');
    expect(JSON.stringify(response.body)).not.toContain('credentials');
  });

  it('does not report a missing active Redis client as healthy', async () => {
    redisActive.mockReturnValue(true);
    redisClient.mockReturnValue(undefined);
    const response = await request(app).get('/health').expect(503);
    expect(response.body.dependencies.redis).toBe('down');
  });

  it('reports Redis ping failure when the Redis rate-limit store is active', async () => {
    redisActive.mockReturnValue(true);
    redisClient.mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('offline')) });
    const response = await request(app).get('/health').expect(503);
    expect(response.body.dependencies.redis).toBe('down');
  });

  it('bounds a stalled database check instead of hanging the monitor', async () => {
    database.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const response = await request(app).get('/health').timeout(4000).expect(503);
    expect(response.body.dependencies.database).toBe('down');
    expect(Date.now() - started).toBeLessThan(3500);
  });
});
