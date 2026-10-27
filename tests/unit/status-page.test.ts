import fs from 'fs';
import path from 'path';
import vm from 'vm';

const source = fs.readFileSync(path.join(__dirname, '../../website/status.js'), 'utf8');
const now = new Date('2026-10-27T12:00:00Z');

function health(status = 200, overrides = {}) {
  return {
    status, headers: { get: () => 'synthetic-request-id' },
    json: async () => ({
      service: 'agentaudit-api', status: status === 200 ? 'ok' : 'degraded',
      checkedAt: now.toISOString(), commit: 'synthetic',
      dependencies: { database: 'up', redis: 'disabled' }, ...overrides,
    }),
  };
}

function setup(fetch: jest.Mock) {
  const elements = new Map<string, any>();
  const listeners: Record<string, () => Promise<void>> = {};
  const intervals: Array<() => void> = [];
  const document = {
    hidden: false,
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {
        textContent: '', dataset: {}, disabled: false,
        addEventListener: (name: string, callback: () => Promise<void>) => { listeners[`${id}:${name}`] = callback; },
      });
      return elements.get(id);
    },
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(source, {
    document, window: { location: { hostname: '127.0.0.1' } }, fetch,
    AbortController, Date, performance, setTimeout, clearTimeout,
    setInterval: (callback: () => void) => { intervals.push(callback); },
  });
  return { elements, listeners, intervals, document };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
});
afterEach(() => jest.useRealTimers());

describe('public status page', () => {
  it('shows verified health and expected disabled Redis without sending credentials', async () => {
    const fetch = jest.fn().mockResolvedValue(health());
    const { elements } = setup(fetch);
    await settle();
    expect(elements.get('summary').dataset.state).toBe('up');
    expect(elements.get('summary-title').textContent).toBe('Health checks passing');
    expect(elements.get('redis-state').textContent).toContain('PostgreSQL fallback');
    expect(elements.get('check-context').textContent).toContain('synthetic-request-id');
    expect(fetch).toHaveBeenCalledWith('/health', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
  });

  it('shows a valid 503 as degraded rather than healthy', async () => {
    const { elements } = setup(jest.fn().mockResolvedValue(health(503, { dependencies: { database: 'down', redis: 'disabled' } })));
    await settle();
    expect(elements.get('summary').dataset.state).toBe('down');
    expect(elements.get('database-state').textContent).toContain('Unavailable');
  });

  it('clears previous healthy component states when a later check fails', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(health()).mockRejectedValueOnce(new Error('synthetic network error'));
    const { elements, listeners } = setup(fetch);
    await settle();
    await listeners['refresh:click']();
    expect(elements.get('summary-title').textContent).toBe('Status unavailable');
    expect(elements.get('api-state').textContent).toBe('Unknown');
    expect(elements.get('database-state').textContent).toBe('Unknown');
    expect(elements.get('refresh').disabled).toBe(false);
  });

  it.each([
    { service: 'other-service' },
    { checkedAt: 'invalid-date' },
    { checkedAt: '2026-10-27T11:58:00Z' },
    { dependencies: { database: 'up', redis: 'unexpected-value' } },
  ])('does not show green for an unrecognized or stale response: %j', async (overrides) => {
    const { elements } = setup(jest.fn().mockResolvedValue(health(200, overrides)));
    await settle();
    expect(elements.get('summary').dataset.state).toBe('unknown');
  });

  it('expires a healthy result while the tab is hidden without polling', async () => {
    const fetch = jest.fn().mockResolvedValue(health());
    const { elements, intervals, document } = setup(fetch);
    await settle();
    document.hidden = true;
    jest.setSystemTime(now.getTime() + 61000);
    intervals[0]();
    expect(elements.get('summary-title').textContent).toBe('Last result is stale');
    expect(elements.get('summary').dataset.state).toBe('unknown');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts stalled requests and restores the refresh control', async () => {
    const fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const { elements } = setup(fetch);
    await jest.advanceTimersByTimeAsync(5000);
    expect(elements.get('summary-title').textContent).toBe('Status unavailable');
    expect(elements.get('refresh').disabled).toBe(false);
  });
});
