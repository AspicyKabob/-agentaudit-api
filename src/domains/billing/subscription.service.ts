import { stripe } from '../../utils/stripe';
import Stripe from 'stripe';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export const subscriptionService = {
  async createCheckoutSession(organizationId: string, priceId: string, customerEmail: string) {
    try {
      let customer;
      
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (org?.stripeCustomerId) {
        customer = { id: org.stripeCustomerId };
      } else {
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

      const baseUrl = 'http://localhost:8080';
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/billing?success=true`,
        cancel_url: `${baseUrl}/pricing?canceled=true`,
        subscription_data: { metadata: { organizationId } },
      });

      logger.info({ organizationId, sessionId: session.id }, 'Checkout session created');
      return session;
    } catch (error) {
      logger.error({ error, organizationId, priceId }, 'Failed to create checkout session');
      throw new Error('Failed to create checkout session');
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
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to retrieve subscription');
      return { status: 'error', plan: org.plan };
    }
  },

  async createPortalSession(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org?.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const baseUrl = 'http://localhost:8080';
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });

    return session;
  },
};
