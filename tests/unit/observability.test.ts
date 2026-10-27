jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  withScope: jest.fn((callback: (scope: unknown) => void) => callback({ setTag: jest.fn() })),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { config } from '../../src/config';
import { initObservability, isObservabilityEnabled, captureException } from '../../src/utils/observability';

const originalDsn = config.get('sentryDsn');

afterAll(() => config.set('sentryDsn', originalDsn));
beforeEach(() => jest.clearAllMocks());

describe('observability', () => {
  it('is a no-op with no DSN', () => {
    config.set('sentryDsn', '');
    initObservability();
    captureException(new Error('synthetic'));
    expect(isObservabilityEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures errors with request context and disables default PII collection', () => {
    config.set('sentryDsn', 'https://public@example.invalid/1');
    initObservability();
    const error = new Error('synthetic test failure');
    captureException(error, { requestId: 'test-request', method: 'GET' });
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false }));
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('strips request payloads, user data, breadcrumbs, and extras before transport', () => {
    config.set('sentryDsn', 'https://public@example.invalid/1');
    initObservability();
    const options = (Sentry.init as jest.Mock).mock.calls[0][0];
    const event = options.beforeSend({
      request: { headers: { 'x-api-key': 'private-key' }, data: 'private prompt', url: '/?token=private' },
      user: { email: 'private@example.invalid' },
      breadcrumbs: [{ message: 'private payload' }],
      extra: { response: 'private response' },
      tags: { requestId: 'test-request' },
      exception: { values: [{ type: 'Error', value: 'synthetic' }] },
    });
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.tags.requestId).toBe('test-request');
    expect(event.exception.values[0].value).toBe('synthetic');
  });
});
