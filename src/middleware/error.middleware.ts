import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { captureException } from '../utils/observability';

const CONFLICT_MESSAGES = [
  'Email already in use',
  'already exists',
  'already in use',
  'already installed',
  'belongs to pack',
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

  // Zod validation errors
  if (err.name === 'ZodError' || err.constructor?.name === 'ZodError') {
    return 400;
  }

  return 500;
}

// Stable error code for the response body; falls back to a status-derived code.
function getErrorCode(err: Error, status: number): string {
  if (err instanceof AppError) return err.code;
  if (status === 409) return 'conflict';
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 400) return 'bad_request';
  return status >= 500 ? 'internal_error' : 'error';
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof AppError ? err.statusCode : getStatusCode(err);
  const requestId = req.id;
  const log = req.log ?? logger;

  if (status >= 500) {
    log.error({ error: err.message, stack: err.stack, requestId }, 'Unhandled error');
    captureException(err, { requestId, path: req.originalUrl, method: req.method });
  } else {
    log.warn({ error: err.message, status, requestId }, 'Request error');
  }

  if (res.headersSent) return;

  // Never leak internal 5xx details to clients; 4xx messages are safe to show.
  const expose = err instanceof AppError ? err.expose : status < 500;
  const message = expose ? err.message : 'Internal server error';

  res.status(status).json({
    error: message,
    code: getErrorCode(err, status),
    ...(requestId && { requestId }),
    ...(process.env.NODE_ENV === 'development' && status >= 500 && { stack: err.stack }),
  });
}
