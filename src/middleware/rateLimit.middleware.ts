import rateLimit from 'express-rate-limit';
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

let store: any = null;
let isRedisStore = false;
let initialized = false;

export function redisStoreActive(): boolean {
  return isRedisStore;
}

async function createStore(prefix: string) {
  const redisReady = await connectRedis();
  const client = getRedisClient();
  if (redisReady && client) {
    isRedisStore = true;
    return new RedisStore({ sendCommand: (...args: any[]) => client.sendCommand(args) as any, prefix });
  }
  return null;
}

export async function initRateLimiters(): Promise<void> {
  if (initialized) return;
  store = await createStore('rl:');
  if (!store) {
    store = new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'rl:' });
    isRedisStore = false;
  }
  initialized = true;
  logger.info({ redis: isRedisStore }, 'Rate limiters initialized');
}

function makeLimiter(options: { max: number; skipSuccessfulRequests?: boolean }): (req: Request, res: Response, next: NextFunction) => void {
  let cached: ReturnType<typeof rateLimit> | undefined;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!cached) {
      if (!store) {
        return next();
      }
      cached = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
        handler: onLimitReached,
        store,
      });
    }
    return cached(req, res, next);
  };
}

export const authLimiter = makeLimiter({ max: 5, skipSuccessfulRequests: true });
export const singleLimiter = makeLimiter({ max: 1000 });
export const batchLimiter = makeLimiter({ max: 500 });
export const readLimiter = makeLimiter({ max: 200 });
const _generalLimiter = makeLimiter({ max: 200 });

export function generalLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/audit-logs')) return next();
  return _generalLimiter(req, res, next);
}
