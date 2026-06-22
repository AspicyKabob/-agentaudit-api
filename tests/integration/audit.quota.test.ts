jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    organization: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    complianceRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    alert: {
      create: jest.fn(),
    },
    emailDelivery: {
      create: jest.fn().mockResolvedValue({ id: 'mock-email-delivery-id' }),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { auditService } from '../../src/domains/audit/audit.service';
import { prisma } from '../../src/db/prisma';

const mockedPrisma = prisma as unknown as {
  organization: { findUnique: jest.Mock; updateMany: jest.Mock };
  auditLog: { create: jest.Mock };
  complianceRule: { findMany: jest.Mock };
};

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const submitBody = { action: 'prompt_submitted', prompt: 'hello', response: 'world' };

describe('audit quota enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.complianceRule.findMany.mockResolvedValue([]);
  });

  it('blocks submission once usage has reached the quota (atomic check fails)', async () => {
    const periodStart = startOfCurrentMonthUtc();
    // Reserve read: at the cap, within the current period (no reset needed).
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      plan: 'free',
      apiUsed: 5000,
      apiQuota: 5000,
      usagePeriodStart: periodStart,
    });
    // Conditional increment matches no rows -> quota would be exceeded.
    mockedPrisma.organization.updateMany.mockResolvedValueOnce({ count: 0 });
    // Error path re-reads current usage for the message.
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({ apiUsed: 5000 });

    await expect(auditService.submit('org-1', submitBody)).rejects.toThrow(
      /Monthly audit log quota exceeded \(5000\/5000\)/
    );

    expect(mockedPrisma.auditLog.create).not.toHaveBeenCalled();
    // Only the atomic conditional increment ran (no reset this period).
    expect(mockedPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', apiUsed: { lte: 4999 } },
      data: { apiUsed: { increment: 1 } },
    });
  });

  it('allows submission while under quota via an atomic conditional increment', async () => {
    const periodStart = startOfCurrentMonthUtc();
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      plan: 'pro',
      apiUsed: 10,
      apiQuota: 50000,
      usagePeriodStart: periodStart,
    });
    mockedPrisma.organization.updateMany.mockResolvedValueOnce({ count: 1 });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({
      id: 'log-1',
      action: submitBody.action,
      complianceFlags: [],
      enforcementAction: 'allow',
      createdAt: new Date(),
    });
    // notify-settings read after creation
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      email: 'user@example.com',
      notifyWebhook: false,
      notifyEmail: false,
      notifyMinSeverity: 'warning',
    });

    const log = await auditService.submit('org-1', submitBody);

    expect(log.id).toBe('log-1');
    expect(mockedPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', apiUsed: { lte: 49999 } },
      data: { apiUsed: { increment: 1 } },
    });
  });

  it('resets usage at the billing-period boundary before reserving', async () => {
    const lastPeriod = new Date(Date.UTC(2000, 0, 1)); // far in the past
    const periodStart = startOfCurrentMonthUtc();

    // Reserve read: usage was fully consumed but in a previous billing period.
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      plan: 'free',
      apiUsed: 5000,
      apiQuota: 5000,
      usagePeriodStart: lastPeriod,
    });
    // Guarded reset (count 1) then the conditional increment (count 1).
    mockedPrisma.organization.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({
      id: 'log-2',
      action: submitBody.action,
      complianceFlags: [],
      enforcementAction: 'allow',
      createdAt: new Date(),
    });
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      email: 'user@example.com',
      notifyWebhook: false,
      notifyEmail: false,
      notifyMinSeverity: 'warning',
    });

    const log = await auditService.submit('org-1', submitBody);

    expect(log.id).toBe('log-2');
    expect(mockedPrisma.organization.updateMany).toHaveBeenCalledTimes(2);
    // First call is the period reset, guarded so concurrent requests can't double-reset.
    expect(mockedPrisma.organization.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'org-1', usagePeriodStart: { lt: periodStart } },
      data: { apiUsed: 0, usagePeriodStart: periodStart },
    });
    // Second call is the conditional increment against the reset window.
    expect(mockedPrisma.organization.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'org-1', apiUsed: { lte: 4999 } },
      data: { apiUsed: { increment: 1 } },
    });
  });
});
