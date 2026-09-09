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

import { config } from '../../src/config';
import { emailDeliveryService } from '../../src/services/email-delivery.service';
import { emailService } from '../../src/services/email.service';

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
    expect(mockedDelivery.updateStatusById).toHaveBeenCalledWith('delivery-1', 'sent', { providerMessageId: 'msg-1' });
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

  it('records a failed status when Resend returns an error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Bounced' } });

    const result = await emailService.sendAlert('user@example.com', {
      severity: 'critical',
      message: 'PII detected',
      action: 'blocked',
    }, 'org-1');

    expect(result.error).toBe('Bounced');
    expect(mockedDelivery.updateStatusById).toHaveBeenCalledWith('delivery-1', 'failed', { error: 'Bounced' });
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
