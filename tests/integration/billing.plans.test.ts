jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    organization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    alert: {
      create: jest.fn(),
    },
  },
}));

// Configured (non-null) Stripe client so checkout reaches the allowlist check.
jest.mock('../../src/utils/stripe', () => ({
  __esModule: true,
  stripe: {
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
      retrieve: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://stripe.test/session' }),
      },
    },
  },
  ensureStripeConfigured: jest.fn(),
}));

import { subscriptionService } from '../../src/domains/billing/subscription.service';
import { prisma } from '../../src/db/prisma';
import { stripe } from '../../src/utils/stripe';

const mockedPrisma = prisma as unknown as {
  organization: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
};
const mockedStripe = stripe as unknown as {
  checkout: { sessions: { create: jest.Mock } };
};

describe('billing checkout price allowlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a price ID that is not in the allowlist', async () => {
    await expect(
      subscriptionService.createCheckoutSession('org-1', 'price_attacker', 'user@example.com')
    ).rejects.toThrow('Invalid or unknown price ID');

    expect(mockedStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('accepts an allowlisted price ID and creates a checkout session', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      email: 'user@example.com',
      stripeCustomerId: null,
    });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    const session = await subscriptionService.createCheckoutSession(
      'org-1',
      'price_pro',
      'user@example.com'
    );

    expect(session.id).toBe('cs_test');
    expect(mockedStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const args = mockedStripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price).toBe('price_pro');
  });
});

describe('billing webhook priceId -> plan mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function subscriptionEvent(type: string, priceId: string, status = 'active') {
    return {
      type,
      data: {
        object: {
          id: 'sub_123',
          status,
          items: { data: [{ price: { id: priceId } }] },
        },
      },
    };
  }

  it('maps an allowed priceId to the correct plan and quota', async () => {
    mockedPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-1', plan: 'free' });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    await subscriptionService.handleWebhookEvent(
      subscriptionEvent('customer.subscription.updated', 'price_business')
    );

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'business', apiQuota: 250000 },
    });
  });

  it('activates plan on customer.subscription.created as well', async () => {
    mockedPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-1', plan: 'free' });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    await subscriptionService.handleWebhookEvent(
      subscriptionEvent('customer.subscription.created', 'price_pro')
    );

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'pro', apiQuota: 50000 },
    });
  });

  it('leaves the plan unchanged when the priceId is not in the mapping', async () => {
    mockedPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-1', plan: 'pro' });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    await subscriptionService.handleWebhookEvent(
      subscriptionEvent('customer.subscription.updated', 'price_unknown')
    );

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'pro', apiQuota: 50000 },
    });
  });
});
