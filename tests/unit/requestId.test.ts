import { Request, Response, NextFunction } from 'express';
import { requestId } from '../../src/middleware/requestId.middleware';

function run(headers: Record<string, string | string[] | undefined>) {
  const setHeader = jest.fn();
  const next = jest.fn() as NextFunction;
  const req = { headers } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  requestId(req, res, next);
  return { req, setHeader, next };
}

describe('requestId middleware', () => {
  it('honours a safe inbound X-Request-Id', () => {
    const { req, setHeader, next } = run({ 'x-request-id': 'abc-123_DEF.456' });
    expect(req.id).toBe('abc-123_DEF.456');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123_DEF.456');
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when no header is present', () => {
    const { req } = run({});
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('rejects an unsafe inbound id (header injection / oversized) and generates its own', () => {
    const { req } = run({ 'x-request-id': 'bad id\r\nInjected: header' });
    expect(req.id).not.toContain('Injected');
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('attaches a request-scoped logger', () => {
    const { req } = run({ 'x-request-id': 'log-test' });
    expect(req.log).toBeDefined();
    expect(typeof req.log?.info).toBe('function');
  });
});
