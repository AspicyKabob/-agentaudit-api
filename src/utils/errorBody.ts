import { Request } from 'express';

export function errorBody(
  req: Request,
  error: string,
  code: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return { error, code, ...(req.id && { requestId: req.id }), ...extra };
}
