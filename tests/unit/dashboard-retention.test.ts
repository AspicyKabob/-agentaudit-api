import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(__dirname, '../../website/dashboard.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../website/dashboard.html'), 'utf8');
const start = source.indexOf('  var retention = {');
const end = source.indexOf('  // ─── Settings: API base URL override', start);

class Element {
  value = '';
  checked = false;
  disabled = false;
  hidden = false;
  textContent = '';
  listeners: Record<string, (event: { preventDefault: () => void }) => unknown> = {};
  addEventListener(name: string, callback: (event: { preventDefault: () => void }) => unknown) { this.listeners[name] = callback; }
  setAttribute() {}
}

let context: vm.Context;
let elements: Record<string, Element>;
let api: jest.Mock;
let response: { retentionDays: number | null; cleanupEnabled: boolean };
let requests: Array<{ method: string; path: string; body: { retentionDays?: number | null; password?: string } | null }>;
let timers: Map<number, { callback: () => void; ms: number }>;

beforeEach(() => {
  elements = {};
  requests = [];
  timers = new Map();
  let timerId = 0;
  response = { retentionDays: null, cleanupEnabled: false };
  api = jest.fn(async (method, route, body) => {
    requests.push({ method, path: route, body: body ? JSON.parse(JSON.stringify(body)) : null });
    if (method === 'POST') return {
      ...response, retentionDays: body.retentionDays, auditLogs: 12, alerts: 4,
      asOf: '2026-11-03T12:00:00.000Z', cutoff: body.retentionDays === null ? null : '2026-10-04T12:00:00.000Z',
    };
    if (method === 'PATCH') return { ...response, retentionDays: body.retentionDays };
    return response;
  });
  context = vm.createContext({
    document: { getElementById: (id: string) => elements[id] ?? (elements[id] = new Element()) },
    API: 'http://127.0.0.1:3471', currentSection: 'settings', api, AbortController,
    setTimeout: (callback: () => void, ms: number) => { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vm.runInContext(source.slice(start, end), context);
});

async function review(days = '7') {
  await context.loadRetention();
  elements['retention-days'].value = days;
  await context.previewRetention();
}

async function save() {
  elements['retention-password'].value = 'SyntheticPassword123';
  elements['retention-ack'].checked = true;
  return elements['retention-form'].listeners.submit({ preventDefault() {} });
}

it('has a unique HTML target for every retention control and all supported choices', async () => {
  await context.loadRetention();
  for (const id of Object.keys(elements)) {
    expect(html.split(`id="${id}"`).length - 1).toBe(1);
  }
  for (const value of ['indefinite', '7', '30', '90']) expect(html).toContain(`option value="${value}"`);
});

it.each([null, 7, 30, 90])('loads preference %s without enabling cleanup', async retentionDays => {
  response.retentionDays = retentionDays;
  await context.loadRetention();
  expect(elements['retention-days'].value).toBe(retentionDays === null ? 'indefinite' : String(retentionDays));
  expect(elements['retention-days'].disabled).toBe(false);
  expect(elements['retention-notice'].textContent).toContain('currently disabled');
  expect(elements['btn-retention-save'].disabled).toBe(true);
});

it('shows affected counts and requires both acknowledgment and password before saving', async () => {
  await review();
  expect(elements['retention-preview'].textContent).toContain('12 audit logs and 4 alerts');
  expect(elements['retention-confirmation'].hidden).toBe(false);
  expect(elements['btn-retention-save'].disabled).toBe(true);
  elements['retention-password'].value = 'SyntheticPassword123';
  context.retentionControls();
  expect(elements['btn-retention-save'].disabled).toBe(true);
  elements['retention-ack'].checked = true;
  context.retentionControls();
  expect(elements['btn-retention-save'].disabled).toBe(false);
  await save();
  expect(requests.at(-1)).toEqual({ method: 'PATCH', path: '/api/v1/auth/retention', body: { retentionDays: 7, password: 'SyntheticPassword123' } });
  expect(elements['retention-current'].textContent).toBe('Saved preference: 7 days.');
  expect(elements['retention-status'].textContent).toContain('Automatic cleanup is disabled');
  expect(elements['retention-password'].value).toBe('');
  expect(elements['retention-ack'].checked).toBe(false);
});

it('previews indefinite retention without claiming records will be deleted', async () => {
  await review('indefinite');
  expect(elements['retention-preview'].textContent).toContain('No audit logs or alerts would expire based on age');
  await save();
  expect(requests.at(-1)?.body?.retentionDays).toBeNull();
});

it('invalidates review and clears the password when the selection changes', async () => {
  await review();
  elements['retention-password'].value = 'SyntheticPassword123';
  elements['retention-days'].value = '90';
  elements['retention-days'].listeners.change({ preventDefault() {} });
  await save();
  expect(requests.some(item => item.method === 'PATCH')).toBe(false);
  expect(elements['retention-confirmation'].hidden).toBe(true);
});

it('expires previews and refuses stale submissions', async () => {
  await review();
  const expiry = [...timers.values()].find(timer => timer.ms === 300000)!;
  expiry.callback();
  await save();
  expect(requests.some(item => item.method === 'PATCH')).toBe(false);
  expect(elements['btn-retention-save'].disabled).toBe(true);
});

it('handles an incorrect password without losing the preview or storing the password', async () => {
  await review();
  api.mockRejectedValueOnce(Object.assign(new Error('Invalid password'), { status: 403 }));
  await save();
  expect(elements['retention-error'].textContent).toBe('Invalid password');
  expect(context.retention.loaded).toBe(true);
  expect(context.retention.preview).not.toBeNull();
  expect(elements['retention-password'].value).toBe('');
  expect(elements['retention-ack'].checked).toBe(false);
  expect(elements['btn-retention-save'].disabled).toBe(true);
});

it('fails closed on an unavailable deployment and allows an explicit reload', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
  await context.loadRetention();
  expect(elements['retention-days'].disabled).toBe(true);
  expect(elements['btn-retention-reload'].hidden).toBe(false);
  expect(elements['retention-error'].textContent).toContain('not available on this deployment');
  await context.loadRetention();
  expect(elements['retention-days'].disabled).toBe(false);
});

it('requires reloading after an uncertain save outcome instead of encouraging duplicate saves', async () => {
  await review();
  api.mockRejectedValueOnce(Object.assign(new Error('Network error'), { status: 0 }));
  await save();
  expect(elements['retention-error'].textContent).toContain('save could not be confirmed');
  expect(elements['retention-days'].disabled).toBe(true);
  expect(elements['btn-retention-reload'].hidden).toBe(false);
  expect(elements['retention-password'].value).toBe('');
});

it('does not allow saving after a malformed preview or failed preview request', async () => {
  await context.loadRetention();
  elements['retention-days'].value = '30';
  api.mockResolvedValueOnce({ ...response, retentionDays: 30, auditLogs: -1 });
  await context.previewRetention();
  expect(context.retention.preview).toBeNull();
  expect(elements['retention-error'].textContent).toContain('invalid preview');
  api.mockRejectedValueOnce(new Error('Unavailable'));
  await context.previewRetention();
  expect(elements['retention-error'].textContent).toBe('Unavailable');
  expect(elements['btn-retention-preview'].disabled).toBe(false);
});

it('ignores a late preview after navigation invalidates it', async () => {
  await context.loadRetention();
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = context.previewRetention();
  context.invalidateRetentionPreview();
  resolve({ ...response, auditLogs: 0, alerts: 0, asOf: '2026-11-03T12:00:00Z', cutoff: null });
  await pending;
  expect(context.retention.preview).toBeNull();
  expect(elements['retention-confirmation'].hidden).toBe(true);
});

it('ignores a preview from the previous API origin', async () => {
  await context.loadRetention();
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = context.previewRetention();
  context.API = 'http://127.0.0.1:3472';
  resolve({ ...response, auditLogs: 0, alerts: 0, asOf: '2026-11-03T12:00:00Z', cutoff: null });
  await pending;
  expect(context.retention.preview).toBeNull();
});

it('times out a stuck preview and restores the controls', async () => {
  await context.loadRetention();
  api.mockImplementationOnce((_method, _path, _body, signal: AbortSignal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const pending = context.previewRetention();
  [...timers.values()].find(timer => timer.ms === 15000)!.callback();
  await pending;
  expect(elements['retention-error'].textContent).toContain('timed out');
  expect(elements['btn-retention-preview'].disabled).toBe(false);
});
