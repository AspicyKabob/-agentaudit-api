import { Request, Response } from 'express';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/utils/errors';
import { errorHandler } from '../../src/middleware/error.middleware';

function mockReqRes(reqOverrides: Partial<Request> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json, headersSent: false } as unknown as Response;
  const req = {
    id: 'req-123',
    log: { error: jest.fn(), warn: jest.fn() },
    originalUrl: '/api/v1/thing',
    method: 'GET',
    ...reqOverrides,
  } as unknown as Request;
  return { req, res, status, json };
}

describe('AppError', () => {
  it('defaults: 5xx is masked (not exposed), 4xx is exposed', () => {
    expect(new AppError('boom').statusCode).toBe(500);
    expect(new AppError('boom').expose).toBe(false);
    expect(new AppError('bad', 400).expose).toBe(true);
  });

  it('derives a stable code from status and respects overrides', () => {
    expect(new NotFoundError().code).toBe('not_found');
    expect(new BadRequestError().code).toBe('bad_request');
    expect(new UnauthorizedError().code).toBe('unauthorized');
    expect(new AppError('x', 400, { code: 'custom' }).code).toBe('custom');
  });
});

describe('errorHandler', () => {
  it('exposes 4xx messages with a code and the request id', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new NotFoundError('Agent not found'), req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: 'Agent not found',
      code: 'not_found',
      requestId: 'req-123',
    });
  });

  it('masks 5xx messages so internals never leak to clients', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new Error('Postgres connection string is postgres://secret'), req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('Internal server error');
    expect(body.code).toBe('internal_error');
    expect(body.requestId).toBe('req-123');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('infers status from message for legacy (non-AppError) errors', () => {
    const { req, res, status } = mockReqRes();
    errorHandler(new Error('Email already in use'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(409);
  });

  it('does not write a body when headers were already sent', () => {
    const { req, res, status } = mockReqRes();
    (res as { headersSent: boolean }).headersSent = true;
    errorHandler(new AppError('boom'), req, res, jest.fn());
    expect(status).not.toHaveBeenCalled();
  });
});
