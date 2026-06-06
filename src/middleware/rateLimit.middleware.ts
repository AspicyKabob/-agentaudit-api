import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../db/prisma';
import { PrismaRateLimitStore } from './prisma-rate-limit-store';

// Generic error handler for all limiters
function onLimitReached(req: Request, res: Response) {
  logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
  res.status(429).json({ error: 'Too many requests. Please slow down.' });
}

// ─── Strict: Auth routes (register / login) ────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: onLimitReached,
  store: new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'auth:' }),
});

// ─── Audit: Single log submission ────────────────────────────────
export const singleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
  store: new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'single:' }),
});

// ─── Audit: Batch log submission ─────────────────────────────────
export const batchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
  store: new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'batch:' }),
});

// ─── Audit: Read-only queries (trace, chain, list) ─────────────
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
  store: new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'read:' }),
});

// ─── General: Everything else under /api/v1 ──────────────────────
const _generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
  store: new PrismaRateLimitStore({ prisma, windowMs: 15 * 60 * 1000, prefix: 'gen:' }),
});

export function generalLimiter(req: Request, res: Response, next: NextFunction) {
  // Let audit routes handle their own limits via singleLimiter / batchLimiter / readLimiter
  if (req.path.startsWith('/audit-logs')) {
    return next();
  }
  return _generalLimiter(req, res, next);
}
