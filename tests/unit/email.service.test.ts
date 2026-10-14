const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

jest.mock('../../src/config', () => ({
  config: {
    get: jest.fn(),
  },
}));

jest.mock('../../src/services/email-delivery.service', () => ({
  emailDeliveryService: {
    isDuplicate: jest.fn(),
    recordDelivery: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
    updateStatusById: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/utils/observability', () => ({
  captureException: jest.fn(),
}));

import { config } from '../../src/config';
import { emailDeliveryService } from '../../src/services/email-delivery.service';
import { emailService } from '../../src/services/email.service';
import { captureException } from '../../src/utils/observability';

const mockedConfig = config as unknown as { get: jest.Mock };
const mockedDelivery = emailDeliveryService as unknown as {
  isDuplicate: jest.Mock;
  recordDelivery: jest.Mock;
  updateStatusById: jest.Mock;
};

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedConfig.get.mockImplementation((key: string) => {
      if (key === 'resendApiKey') return 're_testkey';
      if (key === 'resendFromEmail') return 'AgentAudit <noreply@agentaudit.online>';
      if (key === 'supportEmail') return 'AgentAudit Support <support@agentaudit.online>';
      if (key === 'frontendUrl') return 'https://agentaudit.online';
      return undefined;
    });
    mockedDelivery.isDuplicate.mockResolvedValue(false);
    mockedDelivery.recordDelivery.mockResolvedValue({ id: 'delivery-1' });
  });

  it('skips sending and still records delivery when Resend is not configured', async () => {
    mockedConfig.get.mockImplementation((key: string) => {
      if (key === 'resendApiKey') return '';
      if (key === 'resendFromEmail') return 'AgentAudit <noreply@agentaudit.online>';
      if (key === 'supportEmail') return 'AgentAudit Support <support@agentaudit.online>';
      if (key === 'frontendUrl') return 'https://agentaudit.online';
      return undefined;
    });

    const result = await emailService.sendWelcome('user@example.com', 'Test Org', 'org-1');

    expect(result.error).toBe('Resend not configured');
    expect(result.deliveryId).toBe('delivery-1');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends a welcome email and records delivery', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

    const result = await emailService.sendWelcome('user@example.com', 'Test Org', 'org-1');

    expect(result.id).toBe('msg-1');
    expect(result.deliveryId).toBe('delivery-1');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Welcome'),
      })
    );
    expect(mockedDelivery.updateStatusById).toHaveBeenCalledWith('delivery-1', 'sent', {
      providerMessageId: 'msg-1',
      attemptCount: 1,
      nextAttemptAt: null,
    });
  });

  it('skips duplicate emails when dedupe key matches', async () => {
    mockedDelivery.isDuplicate.mockResolvedValue(true);

    const result = await emailService.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      dedupeKey: 'dup-1',
    });

    expect(result.error).toBe('duplicate');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('records a permanent provider rejection without retrying', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid recipient', statusCode: 400 } });

    const result = await emailService.sendAlert('user@example.com', {
      severity: 'critical',
      action: 'blocked',
    }, 'org-1');

    expect(result.error).toBe('Invalid recipient');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockedDelivery.updateStatusById).toHaveBeenCalledWith('delivery-1', 'failed', {
      error: 'Invalid recipient',
      attemptCount: 1,
      nextAttemptAt: null,
    });
  });

  it('retries a transient provider failure and records the successful attempt', async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { message: 'Rate limited', statusCode: 429 } })
      .mockResolvedValueOnce({ data: { id: 'msg-retry' }, error: null });

    const result = await emailService.sendWelcome('user@example.com', 'Test Org', 'org-1');

    expect(result.id).toBe('msg-retry');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockedDelivery.updateStatusById).toHaveBeenNthCalledWith(1, 'delivery-1', 'retrying', expect.objectContaining({
      error: 'Rate limited',
      attemptCount: 1,
      nextAttemptAt: expect.any(Date),
    }));
    expect(mockedDelivery.updateStatusById).toHaveBeenNthCalledWith(2, 'delivery-1', 'sent', {
      providerMessageId: 'msg-retry',
      attemptCount: 2,
      nextAttemptAt: null,
    });
  });

  it('dead-letters exhausted transient failures and reports them to Sentry', async () => {
    mockSend.mockRejectedValue(new Error('Network unavailable'));

    const result = await emailService.sendWelcome('user@example.com', 'Test Org', 'org-1');

    expect(result.error).toBe('Network unavailable');
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockedDelivery.updateStatusById).toHaveBeenLastCalledWith('delivery-1', 'dead-lettered', expect.objectContaining({
      error: 'Network unavailable',
      attemptCount: 3,
      nextAttemptAt: null,
      deadLetteredAt: expect.any(Date),
    }));
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      deliveryId: 'delivery-1',
      emailType: 'welcome',
    });
  });

  it('keeps customer-provided audit content out of alert subjects and bodies', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-safe' }, error: null });
    const sensitive = 'secret prompt sk_live_123';

    await emailService.sendAlert('user@example.com', {
      severity: 'critical',
      action: sensitive,
    }, 'org-1');

    const sent = mockSend.mock.calls[0][0];
    expect(sent.subject).not.toContain(sensitive);
    expect(sent.html).not.toContain(sensitive);
    expect(sent.text).not.toContain(sensitive);
    expect(sent.subject).toBe('[AgentAudit] CRITICAL compliance alert');
  });

  it('sends a billing subscription activation email', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

    const result = await emailService.sendSubscriptionActivated('user@example.com', 'org-1', 'pro');

    expect(result.id).toBe('msg-2');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Pro plan is active'),
      })
    );
  });

});
