import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from './logger';

let enabled = false;

/**
 * Initialise error tracking. No-op unless SENTRY_DSN is configured, so local
 * dev and tests never talk to Sentry.
 */
export function initObservability(): void {
  const dsn = config.get('sentryDsn');
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: config.get('env'),
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0,
  });
  enabled = true;
  logger.info('Sentry error tracking enabled');
}

export function isObservabilityEnabled(): boolean {
  return enabled;
}

/**
 * Report an unexpected error to Sentry. Safe to call when disabled (no-op).
 * `context` values are attached as tags/extras for triage.
 */
export function captureException(
  err: unknown,
  context: Record<string, string | undefined> = {}
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) scope.setTag(key, value);
    }
    Sentry.captureException(err);
  });
}
