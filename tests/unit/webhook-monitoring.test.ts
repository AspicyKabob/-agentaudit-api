jest.mock('../../src/db/prisma', () => ({ prisma: { organization: { findUnique: jest.fn() } } }));
jest.mock('../../src/utils/ssrf', () => ({ validateWebhookUrl: jest.fn(), safePostJson: jest.fn() }));
jest.mock('../../src/utils/observability', () => ({ captureException: jest.fn() }));

import { prisma } from '../../src/db/prisma';
import { safePostJson, validateWebhookUrl } from '../../src/utils/ssrf';
import { captureException } from '../../src/utils/observability';
import { alertService } from '../../src/domains/alerts/alert.service';

const alert = { id: 'synthetic-alert', organizationId: 'synthetic-org', severity: 'critical' };

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ webhookUrl: 'https://example.invalid/webhook' });
  (validateWebhookUrl as jest.Mock).mockReturnValue({ ok: true });
});

describe('webhook failure monitoring', () => {
  it('reports non-success delivery to the error tracker', async () => {
    (safePostJson as jest.Mock).mockResolvedValue({ statusCode: 503 });
    await alertService.deliverWebhook(alert);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      alertId: alert.id, organizationId: alert.organizationId,
    });
  });

  it('reports transport exceptions to the error tracker', async () => {
    const error = new Error('synthetic timeout');
    (safePostJson as jest.Mock).mockRejectedValue(error);
    await alertService.deliverWebhook(alert);
    expect(captureException).toHaveBeenCalledWith(error, {
      alertId: alert.id, organizationId: alert.organizationId,
    });
  });

  it('does not report successful delivery as an error', async () => {
    (safePostJson as jest.Mock).mockResolvedValue({ statusCode: 204 });
    await alertService.deliverWebhook(alert);
    expect(captureException).not.toHaveBeenCalled();
  });
});
