/**
 * Typed application error with a stable HTTP status code.
 *
 * Throw `AppError` (or one of the helper subclasses) from services/controllers
 * when you want the client to receive a specific status code and message.
 * Errors that are not `AppError` instances fall back to message-based inference
 * in the error middleware, and any unrecognised error is reported as a generic
 * 500 without leaking internal details.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(
    message: string,
    statusCode = 500,
    options: { code?: string; expose?: boolean } = {}
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCodeForStatus(statusCode);
    // 4xx messages are safe to show clients; 5xx are masked by default.
    this.expose = options.expose ?? statusCode < 500;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code?: string) {
    super(message, 400, { code });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code?: string) {
    super(message, 401, { code });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code?: string) {
    super(message, 403, { code });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code?: string) {
    super(message, 404, { code });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code?: string) {
    super(message, 409, { code });
  }
}

function defaultCodeForStatus(status: number): string {
  const map: Record<number, string> = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    409: 'conflict',
    429: 'rate_limited',
    503: 'service_unavailable',
  };
  return map[status] ?? (status >= 500 ? 'internal_error' : 'error');
}
