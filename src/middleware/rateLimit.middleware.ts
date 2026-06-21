import rateLimit, { Store } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { logger } from '../utils/logger';
import { connectRedis, getRedisClient } from '../utils/redis';
import { prisma } from '../db/prisma';
import { PrismaRateLimitStore } from './prisma-rate-limit-store';

function onLimitReached(req: Request, res: Response) {
  logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
  res.status(429).json({ error: 'Too many requests. Please slow down.' });
}

type LimiterName = 'auth' | 'single' | 'batch' | 'read' | 'general';

const STORE_PREFIXES: Record<LimiterName, string> = {
  auth: 'rl:auth:',
  single: 'rl:audit-single:',
  batch: 'rl:audit-batch:',
  read: 'rl:audit-read:',
  general: 'rl:general:',
};

let limiters: Partial<Record<LimiterName, ReturnType<typeof rateLimit>>> = {};
let isRedisStore = false;
let initialized = false;

export function redisStoreActive(): boolean {
  return isRedisStore;
}

function createStore(prefix: string, redisReady: boolean): Store {
  const client = getRedisClient();
  if (redisReady && client) {
    return new RedisStore({ sendCommand: (...args: any[]) => client.sendCommand(args) as any, prefix });
  }
  return new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix });
}

export async function initRateLimiters(): Promise<void> {
  if (initialized) return;
  const redisReady = await connectRedis();
  isRedisStore = redisReady && Boolean(getRedisClient());
  const stores = Object.fromEntries(
    Object.entries(STORE_PREFIXES).map(([name, prefix]) => [
      name,
      createStore(prefix, isRedisStore),
    ])
  ) as Record<LimiterName, Store>;
  limiters = {
    auth: buildLimiter(stores.auth, { max: 5, skipSuccessfulRequests: true }),
    single: buildLimiter(stores.single, { max: 1000 }),
    batch: buildLimiter(stores.batch, { max: 500 }),
    read: buildLimiter(stores.read, { max: 200 }),
    general: buildLimiter(stores.general, { max: 200 }),
  };
  initialized = true;
  logger.info({ redis: isRedisStore }, 'Rate limiters initialized');
}

function buildLimiter(store: Store, options: { max: number; skipSuccessfulRequests?: boolean }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: onLimitReached,
    store,
  });
}

function runLimiter(name: LimiterName, req: Request, res: Response, next: NextFunction) {
  const limiter = limiters[name];
  return limiter ? limiter(req, res, next) : next();
}

export function authLimiter(req: Request, res: Response, next: NextFunction) {
  return runLimiter('auth', req, res, next);
}

export function singleLimiter(req: Request, res: Response, next: NextFunction) {
  return runLimiter('single', req, res, next);
}

export function batchLimiter(req: Request, res: Response, next: NextFunction) {
  return runLimiter('batch', req, res, next);
}

export function readLimiter(req: Request, res: Response, next: NextFunction) {
  return runLimiter('read', req, res, next);
}

export function generalLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/audit-logs')) return next();
  return runLimiter('general', req, res, next);
}
