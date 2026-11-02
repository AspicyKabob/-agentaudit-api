const mockUpdate = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSendActivated = jest.fn().mockResolvedValue(undefined);
const mockSendPlanChanged = jest.fn().mockResolvedValue(undefined);
const mockSendCancellation = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $disconnect: jest.fn(),
    organization: {
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    alert: { create: jest.fn() },
  },
}));

jest.mock('../../src/utils/stripe', () => ({
  stripe: { subscriptions: { retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args) } },
  ensureStripeConfigured: jest.fn(),
}));

jest.mock('../../src/domains/billing/plans', () => ({
  ...jest.requireActual('../../src/domains/billing/plans'),
  getPlanForPriceId: jest.fn((id: string) => (id === 'price_pro' ? 'pro' : id === 'price_business' ? 'business' : null)),
  getQuotaForPlan: jest.fn((plan: string) => ({ free: 5000, pro: 50000, business: 250000 }[plan] ?? 5000)),
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendSubscriptionActivated: (...args: unknown[]) => mockSendActivated(...args),
    sendPlanChanged: (...args: unknown[]) => mockSendPlanChanged(...args),
    sendCancellationNotice: (...args: unknown[]) => mockSendCancellation(...args),
    sendRenewalSucceeded: jest.fn(),
    sendPaymentFailed: jest.fn(),
  },
}));

import { subscriptionService } from '../../src/domains/billing/subscription.service';

describe('subscriptionService.handleWebhookEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: 'org-1', plan: 'free', email: 'owner@example.com' });
  });

  it('checkout.session.completed links IDs and activates plan via session metadata', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
    });

    await subscriptionService.handleWebhookEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_1', customer: 'cus_1', metadata: { organizationId: 'org-1' } } },
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' },
    }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { plan: 'pro', apiQuota: 50000 },
    }));
    expect(mockSendActivated).toHaveBeenCalledWith('owner@example.com', 'org-1', 'pro', expect.objectContaining({ eventId: 'evt_1' }));
  });

  it('checkout.session.completed falls back to client_reference_id', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_2',
      status: 'active',
      items: { data: [{ price: { id: 'price_business' } }] },
    });

    await subscriptionService.handleWebhookEvent({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_2', customer: 'cus_2', client_reference_id: 'org-1' } },
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { plan: 'business', apiQuota: 250000 },
    }));
  });

  it('customer.subscription.updated remaps plan on change', async () => {
    mockFindFirst.mockResolvedValue({ id: 'org-1', plan: 'pro', email: 'owner@example.com' });

    await subscriptionService.handleWebhookEvent({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_business' } }] } } },
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { plan: 'business', apiQuota: 250000 },
    }));
    expect(mockSendPlanChanged).toHaveBeenCalled();
  });

  it('customer.subscription.deleted downgrades to free', async () => {
    mockFindFirst.mockResolvedValue({ id: 'org-1', plan: 'pro', email: 'owner@example.com' });

    await subscriptionService.handleWebhookEvent({
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', status: 'canceled', canceled_at: 1700000000 } },
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { plan: 'free', stripeSubscriptionId: null },
    }));
    expect(mockSendCancellation).toHaveBeenCalled();
  });

  it('ignores checkout session with no organization reference', async () => {
    await subscriptionService.handleWebhookEvent({
      id: 'evt_5',
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_9', customer: 'cus_9' } },
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
