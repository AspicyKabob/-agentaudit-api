import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const app = createApp();
const agent = request.agent(app);

// ── Mocks ──────────────────────────────────────────────────────────
jest.mock('../../src/utils/stripe', () => ({
  stripe: {
    customers: {
      retrieve: jest.fn(),
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}));

import { stripe } from '../../src/utils/stripe';

async function registerAndLogin(email: string, password: string) {
  await prisma.organization.deleteMany({ where: { email } });
  await agent.post('/api/v1/auth/register').send({ name: 'Billing Test', email, password });
  const loginRes = await agent.post('/api/v1/auth/login').send({ email, password });
  return loginRes.body.accessToken as string;
}

describe('Billing Integration — Checkout, Portal, Webhooks, Edge Cases', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── Checkout Session ──────────────────────────────────────────────
  describe('POST /api/v1/billing/checkout-session', () => {
    const email = 'billing-checkout@example.com';
    const password = 'Password123';

    it('should create a checkout session for a logged-in user', async () => {
      const token = await registerAndLogin(email, password);
      (stripe.customers.retrieve as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (stripe.customers.create as jest.Mock).mockResolvedValueOnce({ id: 'cus_live_new' });
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValueOnce({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      });

      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_1TbR4b1DJBx5xOxFiiIvXDYz' });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/test');
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_1TbR4b1DJBx5xOxFiiIvXDYz', quantity: 1 }],
          customer: 'cus_live_new',
        }),
        expect.any(Object)
      );
    });

    it('should reuse an existing Stripe customer', async () => {
      const token = await registerAndLogin(email + '.reuse', password);
      await prisma.organization.updateMany({
        where: { email: email + '.reuse' },
        data: { stripeCustomerId: 'cus_existing' },
      });
      (stripe.customers.retrieve as jest.Mock).mockResolvedValueOnce({ id: 'cus_existing', deleted: false });
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValueOnce({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/test2',
      });

      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_1TbR611DJBx5xOxFBI323s75' });

      expect(res.status).toBe(200);
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
        expect.any(Object)
      );
    });

    it('should create a new customer if old one was deleted/not found', async () => {
      const token = await registerAndLogin(email + '.recreate', password);
      await prisma.organization.updateMany({
        where: { email: email + '.recreate' },
        data: { stripeCustomerId: 'cus_old_deleted' },
      });
      (stripe.customers.retrieve as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (stripe.customers.create as jest.Mock).mockResolvedValueOnce({ id: 'cus_live_recreated' });
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValueOnce({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/test3',
      });

      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_1TbR4b1DJBx5xOxFiiIvXDYz' });

      expect(res.status).toBe(200);
      expect(stripe.customers.create).toHaveBeenCalled();
    });

    it('should reject invalid price IDs', async () => {
      const token = await registerAndLogin(email + '.invalid', password);
      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'not_a_price' });

      expect(res.status).toBe(400);
    });

    it('should reject when user is logged out (no auth)', async () => {
      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .send({ priceId: 'price_1TbR4b1DJBx5xOxFiiIvXDYz' });

      expect(res.status).toBe(401);
    });

    it('should surface Stripe errors gracefully', async () => {
      const token = await registerAndLogin(email + '.stripeerr', password);
      (stripe.customers.retrieve as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (stripe.customers.create as jest.Mock).mockResolvedValueOnce({ id: 'cus_err' });
      (stripe.checkout.sessions.create as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('No such price'), { code: 'resource_missing' })
      );

      const res = await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_bad' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('should use idempotency key on each request', async () => {
      const token = await registerAndLogin(email + '.idemp', password);
      (stripe.customers.create as jest.Mock).mockResolvedValueOnce({ id: 'cus_idemp' });
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValueOnce({
        id: 'cs_test_idemp',
        url: 'https://checkout.stripe.com/idemp',
      });

      await agent
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ priceId: 'price_1TbR4b1DJBx5xOxFiiIvXDYz' });

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout-/) })
      );
    });
  });

  // ── Subscription Status ───────────────────────────────────────────
  describe('GET /api/v1/billing/subscription', () => {
    const email = 'billing-sub@example.com';
    const password = 'Password123';

    it('should return inactive for free plan org', async () => {
      const token = await registerAndLogin(email, password);
      const res = await agent
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');
      expect(res.body.plan).toBe('free');
    });

    it('should return active subscription details', async () => {
      const token = await registerAndLogin(email + '.active', password);
      await prisma.organization.updateMany({
        where: { email: email + '.active' },
        data: { stripeSubscriptionId: 'sub_live_123', plan: 'pro' },
      });
      (stripe.subscriptions.retrieve as jest.Mock).mockResolvedValueOnce({
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
      });

      const res = await agent
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.plan).toBe('pro');
      expect(res.body.cancelAtPeriodEnd).toBe(false);
    });

    it('should reset to free if Stripe subscription is missing', async () => {
      const token = await registerAndLogin(email + '.missing', password);
      const org = await prisma.organization.findUnique({ where: { email: email + '.missing' } });
      await prisma.organization.update({
        where: { id: org!.id },
        data: { stripeSubscriptionId: 'sub_deleted_123', plan: 'business' },
      });
      (stripe.subscriptions.retrieve as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('No such subscription'), { code: 'resource_missing' })
      );

      const res = await agent
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');
      expect(res.body.plan).toBe('free');

      const updated = await prisma.organization.findUnique({ where: { id: org!.id } });
      expect(updated?.stripeSubscriptionId).toBeNull();
    });
  });

  // ── Billing Portal ────────────────────────────────────────────────
  describe('POST /api/v1/billing/portal-session', () => {
    const email = 'billing-portal@example.com';
    const password = 'Password123';

    it('should create a portal session for existing customer', async () => {
      const token = await registerAndLogin(email, password);
      await prisma.organization.updateMany({
        where: { email },
        data: { stripeCustomerId: 'cus_portal' },
      });
      (stripe.billingPortal.sessions.create as jest.Mock).mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/portal',
      });

      const res = await agent
        .post('/api/v1/billing/portal-session')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://billing.stripe.com/session/portal');
    });

    it('should create a new Stripe customer if none exists', async () => {
      const token = await registerAndLogin(email + '.nocust', password);
      (stripe.customers.create as jest.Mock).mockResolvedValueOnce({ id: 'cus_new_portal' });
      (stripe.billingPortal.sessions.create as jest.Mock).mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/new',
      });

      const res = await agent
        .post('/api/v1/billing/portal-session')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(stripe.customers.create).toHaveBeenCalled();
      expect(res.body.url).toBe('https://billing.stripe.com/session/new');
    });

    it('should require authentication', async () => {
      const res = await agent.post('/api/v1/billing/portal-session').send({});
      expect(res.status).toBe(401);
    });
  });

  // ── Webhooks ──────────────────────────────────────────────────────
  describe('POST /api/v1/billing/webhook', () => {
    const email = 'billing-webhook@example.com';
    const password = 'Password123';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should process checkout.session.completed', async () => {
      const org = await prisma.organization.create({
        data: { name: 'Webhook Test', email, password: 'hashed' },
      });

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValueOnce({
        type: 'checkout.session.completed',
        data: {
          object: {
            subscription: 'sub_live_webhook',
            customer: 'cus_webhook',
            subscription_data: { metadata: { organizationId: org.id } },
          },
        },
      });

      const res = await agent
        .post('/api/v1/billing/webhook')
        .set('stripe-signature', 'sig_valid')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(200);

      const updated = await prisma.organization.findUnique({ where: { id: org.id } });
      expect(updated?.stripeSubscriptionId).toBe('sub_live_webhook');
      expect(updated?.stripeCustomerId).toBe('cus_webhook');
    });

    it('should handle customer.subscription.updated', async () => {
      const org = await prisma.organization.create({
        data: { name: 'Update Test', email: email + '.upd', password: 'hashed', stripeSubscriptionId: 'sub_upd', plan: 'pro' },
      });

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValueOnce({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_upd',
            status: 'active',
            metadata: { plan: 'business' },
          },
        },
      });

      const res = await agent
        .post('/api/v1/billing/webhook')
        .set('stripe-signature', 'sig_valid')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(200);
      const updated = await prisma.organization.findUnique({ where: { id: org.id } });
      expect(updated?.plan).toBe('business');
    });

    it('should handle invoice.payment_failed and create alert', async () => {
      const org = await prisma.organization.create({
        data: { name: 'Fail Test', email: email + '.fail', password: 'hashed', stripeSubscriptionId: 'sub_fail', plan: 'pro' },
      });

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValueOnce({
        type: 'invoice.payment_failed',
        data: {
          object: {
            subscription: 'sub_fail',
            id: 'inv_fail_123',
            attempt_count: 2,
          },
        },
      });

      const res = await agent
        .post('/api/v1/billing/webhook')
        .set('stripe-signature', 'sig_valid')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(200);
      const alerts = await prisma.alert.findMany({ where: { organizationId: org.id } });
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].severity).toBe('critical');
    });

    it('should handle customer.subscription.deleted and downgrade to free', async () => {
      const org = await prisma.organization.create({
        data: { name: 'Cancel Test', email: email + '.cancel', password: 'hashed', stripeSubscriptionId: 'sub_cancel', plan: 'pro' },
      });

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValueOnce({
        type: 'customer.subscription.deleted',
        data: {
          object: { id: 'sub_cancel' },
        },
      });

      const res = await agent
        .post('/api/v1/billing/webhook')
        .set('stripe-signature', 'sig_valid')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(200);
      const updated = await prisma.organization.findUnique({ where: { id: org.id } });
      expect(updated?.plan).toBe('free');
      expect(updated?.stripeSubscriptionId).toBeNull();
    });

    it('should return 400 for invalid webhook signature', async () => {
      (stripe.webhooks.constructEvent as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const res = await agent
        .post('/api/v1/billing/webhook')
        .set('stripe-signature', 'sig_invalid')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Webhook Error/);
    });

    it('should return 400 when stripe-signature header is missing', async () => {
      const res = await agent.post('/api/v1/billing/webhook').send(Buffer.from('{}'));
      expect(res.status).toBe(400);
    });
  });
});
