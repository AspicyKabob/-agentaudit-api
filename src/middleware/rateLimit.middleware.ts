import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

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
});

// ─── Medium: Audit log submission (API-key routes) ─────────────────
export const auditLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

export const batchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});
