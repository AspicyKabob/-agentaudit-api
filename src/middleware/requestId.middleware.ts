import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_INBOUND_ID_LENGTH = 200;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Assigns a correlation ID to every request (honouring a sane inbound
 * `X-Request-Id`, otherwise generating a UUID), echoes it back on the response,
 * and attaches a request-scoped child logger at `req.log`.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;

  const id =
    candidate && candidate.length <= MAX_INBOUND_ID_LENGTH && SAFE_ID.test(candidate)
      ? candidate
      : randomUUID();

  req.id = id;
  req.log = logger.child({ requestId: id });
  res.setHeader('X-Request-Id', id);
  const started = performance.now();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    req.log?.info({
      method: req.method,
      route: typeof req.route?.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched',
      status: res.statusCode,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      aborted: !res.writableFinished,
    }, 'Request completed');
  };
  res.once('finish', record);
  res.once('close', record);
  next();
}
