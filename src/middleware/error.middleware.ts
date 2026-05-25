import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const CONFLICT_MESSAGES = [
  'Email already in use',
  'already exists',
  'already in use',
];

const UNAUTHORIZED_MESSAGES = [
  'Invalid credentials',
  'API key not found',
  'No API key',
  'Invalid or expired token',
];

const NOT_FOUND_MESSAGES = [
  'not found',
  'not exist',
  'does not exist',
];

const BAD_REQUEST_MESSAGES = [
  'Missing',
  'required',
];

function getStatusCode(err: Error): number {
  const msg = err.message.toLowerCase();

  if (CONFLICT_MESSAGES.some((m) => msg.includes(m.toLowerCase()))) {
    return 409;
  }
  if (UNAUTHORIZED_MESSAGES.some((m) => msg.includes(m.toLowerCase()))) {
    return 401;
  }
  if (NOT_FOUND_MESSAGES.some((m) => msg.includes(m.toLowerCase()))) {
    return 404;
  }
  if (BAD_REQUEST_MESSAGES.some((m) => msg.includes(m.toLowerCase()))) {
    return 400;
  }

  // Prisma unique constraint violation
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2002') {
    return 409;
  }

  // Prisma not found
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2025') {
    return 404;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 401;
  }

  return 500;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = getStatusCode(err);

  if (status >= 500) {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  } else {
    logger.warn({ error: err.message, status }, 'Request error');
  }

  res.status(status).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
