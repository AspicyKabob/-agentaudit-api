export {};

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

const ORIGINAL_ENV = process.env;

// Real (non-placeholder) Stripe price IDs so the configured prices populate the
// allowlist; the enterprise tier is intentionally left unset (contact-sales).
const REAL_PRICES = {
  STRIPE_PRICE_FREE: 'price_real_free',
  STRIPE_PRICE_PRO: 'price_real_pro',
  STRIPE_PRICE_BUSINESS: 'price_real_business',
};

type SubscriptionService = typeof import('../../src/domains/billing/subscription.service')['subscriptionService'];

function load(): {
  subscriptionService: SubscriptionService;
  mockedPrisma: { organization: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock } };
  mockedStripe: { checkout: { sessions: { create: jest.Mock } } };
} {
  jest.resetModules();
  const { subscriptionService } = require('../../src/domains/billing/subscription.service');
  const { prisma } = require('../../src/db/prisma');
  const { stripe } = require('../../src/utils/stripe');
  return {
    subscriptionService,
    mockedPrisma: prisma,
    mockedStripe: stripe,
  };
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...REAL_PRICES };
  delete process.env.STRIPE_PRICE_ENTERPRISE;
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('billing checkout price allowlist', () => {
  it('rejects a price ID that is not in the allowlist', async () => {
    const { subscriptionService, mockedStripe } = load();

    await expect(
      subscriptionService.createCheckoutSession('org-1', 'price_attacker', 'user@example.com')
    ).rejects.toThrow('Invalid or unknown price ID');

    expect(mockedStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects the enterprise price when it is left unset (contact-sales)', async () => {
    const { subscriptionService, mockedStripe } = load();

    await expect(
      subscriptionService.createCheckoutSession('org-1', 'price_enterprise', 'user@example.com')
    ).rejects.toThrow('Invalid or unknown price ID');

    expect(mockedStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('accepts an allowlisted price ID and creates a checkout session', async () => {
    const { subscriptionService, mockedPrisma, mockedStripe } = load();
    mockedPrisma.organization.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      email: 'user@example.com',
      stripeCustomerId: null,
    });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    const session = await subscriptionService.createCheckoutSession(
      'org-1',
      'price_real_pro',
      'user@example.com'
    );

    expect(session.id).toBe('cs_test');
    expect(mockedStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const args = mockedStripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price).toBe('price_real_pro');
  });
});

describe('billing webhook priceId -> plan mapping', () => {
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
    const { subscriptionService, mockedPrisma } = load();
    mockedPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-1', plan: 'free' });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    await subscriptionService.handleWebhookEvent(
      subscriptionEvent('customer.subscription.updated', 'price_real_business')
    );

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'business', apiQuota: 250000 },
    });
  });

  it('activates plan on customer.subscription.created as well', async () => {
    const { subscriptionService, mockedPrisma } = load();
    mockedPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-1', plan: 'free' });
    mockedPrisma.organization.update.mockResolvedValueOnce({ id: 'org-1' });

    await subscriptionService.handleWebhookEvent(
      subscriptionEvent('customer.subscription.created', 'price_real_pro')
    );

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'pro', apiQuota: 50000 },
    });
  });

  it('leaves the plan unchanged when the priceId is not in the mapping', async () => {
    const { subscriptionService, mockedPrisma } = load();
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
