import fs from 'fs';
import path from 'path';
import vm from 'vm';

const script = fs.readFileSync(path.join(__dirname, '../../scripts/verify-monitoring.js'), 'utf8');

async function verify(eventStatus: number) {
  const pending: Array<Promise<unknown>> = [];
  const process = { argv: ['node', 'verify-monitoring.js', '--send-event'], env: { SENTRY_DSN: 'synthetic' }, exitCode: undefined as number | undefined };
  const console = { log: jest.fn(), error: jest.fn() };
  const transport = { send: jest.fn(async (envelope: any) => ({ statusCode: envelope[1][0][0].type === 'event' ? eventStatus : 200 })) };
  const sentry = {
    getClient: () => ({ getTransport: () => transport }),
    lastEventId: () => 'synthetic-event-id',
    flush: async () => { await Promise.all(pending); return true; },
  };
  vm.runInNewContext(script, {
    process, console, AbortSignal,
    fetch: async () => ({ status: 200, headers: { get: () => 'synthetic-request' }, json: async () => ({ status: 'ok', commit: 'synthetic', dependencies: { database: 'up' } }) }),
    require: (name: string) => name === '@sentry/node' ? sentry : {
      initObservability: jest.fn(),
      captureException: () => {
        pending.push(transport.send([{}, [[{ type: 'session' }, {}]]]));
        pending.push(transport.send([{}, [[{ type: 'event' }, {}]]]));
      },
    },
  });
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
  return { process, console, result: JSON.parse(console.log.mock.calls[1][0]) };
}

describe('monitoring verification acceptance', () => {
  it('accepts a confirmed error-event transport response', async () => {
    const { process, result } = await verify(200);
    expect(result.transportAccepted).toBe(true);
    expect(result.eventTransportStatuses).toEqual([200]);
    expect(process.exitCode).toBeUndefined();
  });

  it('does not confuse an accepted session with an accepted error event', async () => {
    const { process, result } = await verify(503);
    expect(result.transportAccepted).toBe(false);
    expect(result.eventTransportStatuses).toEqual([503]);
    expect(process.exitCode).toBe(1);
  });
});
