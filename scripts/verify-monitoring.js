async function main() {
  const sendEvent = process.argv.includes('--send-event');
  if (process.argv.slice(2).some((arg) => arg !== '--send-event')) throw new Error('Unsupported option');
  const response = await fetch('https://agentaudit.online/health', {
    headers: { 'X-Request-Id': 'monitoring-verification' },
    signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  const health = await response.json();
  if (response.status !== 200 || health.status !== 'ok' || health.dependencies?.database !== 'up') {
    throw new Error('Production health check did not pass');
  }
  console.log(JSON.stringify({
    health: 'passed', deployedCommit: health.commit,
    dependencies: health.dependencies, requestId: response.headers.get('x-request-id'),
  }));
  if (!sendEvent) return;
  if (!process.env.SENTRY_DSN) throw new Error('SENTRY_DSN must be configured for the approved live-event check');
  const Sentry = require('@sentry/node');
  const { initObservability, captureException } = require('../dist/utils/observability');
  initObservability();
  const transport = Sentry.getClient()?.getTransport();
  if (!transport) throw new Error('Error-tracking transport is unavailable');
  const statuses = [];
  const send = transport.send.bind(transport);
  transport.send = async (envelope) => {
    const result = await send(envelope);
    statuses.push(result.statusCode);
    return result;
  };
  captureException(new Error('AgentAudit monitoring verification — synthetic event, no customer data'), {
    requestId: response.headers.get('x-request-id') || 'monitoring-verification',
    path: '/health', method: 'GET', verification: 'synthetic-launch-check', deployedCommit: health.commit,
  });
  const eventId = Sentry.lastEventId();
  const flushed = await Sentry.flush(10000);
  const accepted = flushed && statuses.includes(200);
  console.log(JSON.stringify({ eventId, flushed, transportAccepted: accepted, dashboardAndMailboxConfirmationRequired: true }));
  if (!accepted) throw new Error('Error-tracking transport did not confirm acceptance');
}

main().catch((error) => {
  console.error(error.message.startsWith('SENTRY_DSN') ? 'Live verification requires the configured Sentry secret.' : 'Monitoring verification did not complete successfully.');
  process.exitCode = 1;
});
