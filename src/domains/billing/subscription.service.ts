import { stripe } from '../../utils/stripe';
import Stripe from 'stripe';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const VALID_PRICE_IDS = [
  config.get('stripePricePro'),
  config.get('stripePriceBusiness'),
  config.get('stripePriceEnterprise'),
  config.get('stripePriceFree'),
].filter(Boolean);

function isValidPriceId(priceId: string): boolean {
  return typeof priceId === 'string' && priceId.startsWith('price_') && priceId.length > 10;
}

export const subscriptionService = {
  async createCheckoutSession(organizationId: string, priceId: string, customerEmail: string) {
    if (!isValidPriceId(priceId)) {
      throw new Error('Invalid price ID');
    }

    try {
      let customer;
      
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new Error('Organization not found');
      }

      if (org?.stripeCustomerId) {
        try {
          const existingCustomer = await stripe.customers.retrieve(org.stripeCustomerId);
          if (existingCustomer && !existingCustomer.deleted) {
            customer = { id: org.stripeCustomerId };
          }
        } catch (e) {
          logger.warn({ organizationId, oldCustomerId: org.stripeCustomerId }, 'Old Stripe customer not found in current environment, creating new one');
          customer = null;
        }
      }

      if (!customer) {
        const stripeCustomer = await stripe.customers.create({
          email: customerEmail,
          metadata: { organizationId },
        });
        
        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: stripeCustomer.id },
        });
        
        customer = stripeCustomer;
      }

      const baseUrl = config.get('frontendUrl').replace(/\/$/, '');
      const idempotencyKey = `checkout-${organizationId}-${priceId}-${Date.now()}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/dashboard.html?billing=success`,
        cancel_url: `${baseUrl}/index.html#pricing?billing=canceled`,
        subscription_data: { metadata: { organizationId } },
      }, {
        idempotencyKey,
      });

      logger.info({ organizationId, sessionId: session.id }, 'Checkout session created');
      return session;
    } catch (error) {
      logger.error({ error, organizationId, priceId }, 'Stripe checkout session failed');
      throw error;
    }
  },

  async handleWebhookEvent(event: any) {
    logger.info({ type: event.type }, 'Processing Stripe webhook');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const organizationId = session.subscription_data?.metadata?.organizationId || 
                              session.client_reference_id;
        
        if (organizationId && session.subscription) {
          await prisma.organization.update({
            where: { id: organizationId },
            data: {
              stripeSubscriptionId: session.subscription as string,
              stripeCustomerId: session.customer as string,
            },
          });
          logger.info({ organizationId, subscriptionId: session.subscription }, 'Subscription activated');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });
        
        if (org) {
          const newPlan = subscription.metadata?.plan || subscription.plan?.nickname || org.plan;
          const status = subscription.status;
          
          if (status === 'active' || status === 'trialing') {
            await prisma.organization.update({
              where: { id: org.id },
              data: { plan: newPlan },
            });
            logger.info({ organizationId: org.id, newPlan, status }, 'Subscription updated');
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        
        if (subscriptionId) {
          const org = await prisma.organization.findFirst({
            where: { stripeSubscriptionId: subscriptionId as string },
          });
          if (org) {
            logger.info({ organizationId: org.id }, 'Payment succeeded');
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        
        if (subscriptionId) {
          const org = await prisma.organization.findFirst({
            where: { stripeSubscriptionId: subscriptionId as string },
          });
          if (org) {
            logger.warn({ organizationId: org.id }, 'Payment failed');
            await prisma.alert.create({
              data: {
                organizationId: org.id,
                severity: 'critical',
                message: `Payment failed for subscription ${subscriptionId}`,
                details: { invoiceId: invoice.id, attemptCount: invoice.attempt_count },
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });
        
        if (org) {
          await prisma.organization.update({
            where: { id: org.id },
            data: { plan: 'free', stripeSubscriptionId: null },
          });
          logger.info({ organizationId: org.id }, 'Subscription canceled, downgraded to free');
        }
        break;
      }

      default:
        logger.info({ type: event.type }, 'Unhandled webhook event');
    }
  },

  async getSubscriptionStatus(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org?.stripeSubscriptionId) {
      return { status: 'inactive', plan: org?.plan || 'free' };
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const sub = subscription as any;
      
      return {
        status: subscription.status,
        plan: org.plan,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    } catch (error: any) {
      if (error?.code === 'resource_missing') {
        logger.warn({ organizationId, subscriptionId: org.stripeSubscriptionId }, 'Subscription not found in Stripe, resetting');
        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeSubscriptionId: null, plan: 'free' },
        });
        return { status: 'inactive', plan: 'free' };
      }
      logger.error({ error, organizationId }, 'Failed to retrieve subscription');
      return { status: 'error', plan: org.plan };
    }
  },

  async createPortalSession(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    let customerId = org.stripeCustomerId;

    if (!customerId) {
      const stripeCustomer = await stripe.customers.create({
        email: org.email,
        metadata: { organizationId },
      });
      await prisma.organization.update({
        where: { id: organizationId },
        data: { stripeCustomerId: stripeCustomer.id },
      });
      customerId = stripeCustomer.id;
    }

    const baseUrl = config.get('frontendUrl').replace(/\/$/, '');
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard.html`,
    });

    return session;
  },
};
