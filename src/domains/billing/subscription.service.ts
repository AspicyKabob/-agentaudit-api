import { stripe, ensureStripeConfigured } from '../../utils/stripe';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getQuotaForPlan, getPlanForPriceId, isAllowedPriceId, getAllowedPriceIds, PlanTier } from './plans';
import { emailService } from '../../services/email.service';

/**
 * Derive the plan tier from a Stripe subscription by mapping its active price
 * ID through the shared priceId -> plan mapping. Returns null when no allowed
 * price is present so callers can fall back to the existing plan.
 */
function planFromSubscription(subscription: any): PlanTier | null {
  const priceId =
    subscription?.items?.data?.[0]?.price?.id ??
    subscription?.items?.data?.[0]?.plan?.id ??
    subscription?.plan?.id ??
    null;
  return getPlanForPriceId(priceId);
}

export const subscriptionService = {
  async createCheckoutSession(organizationId: string, priceId: string, customerEmail: string) {
    ensureStripeConfigured();
    if (!isAllowedPriceId(priceId)) {
      logger.warn({ organizationId, priceId, allowed: getAllowedPriceIds() }, 'Rejected checkout for unknown price ID');
      throw new Error('Invalid or unknown price ID');
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

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (org) {
          const status = subscription.status;
          const previousPlan = org.plan;

          if (status === 'active' || status === 'trialing') {
            const mappedPlan = planFromSubscription(subscription);
            if (!mappedPlan) {
              logger.warn(
                { organizationId: org.id, subscriptionId: subscription.id },
                'Subscription price did not map to a known plan; leaving plan unchanged'
              );
            }
            const newPlan = mappedPlan ?? org.plan;
            await prisma.organization.update({
              where: { id: org.id },
              data: {
                plan: newPlan,
                apiQuota: getQuotaForPlan(newPlan),
              },
            });
            logger.info({ organizationId: org.id, newPlan, status }, 'Subscription updated');

            if (org.email && newPlan !== previousPlan) {
              if (previousPlan === 'free' && newPlan !== 'free') {
                emailService.sendSubscriptionActivated(org.email, org.id, newPlan, {
                  eventId: event.id,
                  dedupeKey: `billing:activated:${event.id}`,
                }).catch((err) => {
                  logger.warn({ organizationId: org.id, error: err }, 'Activation email failed');
                });
              } else {
                emailService.sendPlanChanged(org.email, org.id, newPlan, {
                  eventId: event.id,
                  dedupeKey: `billing:plan-change:${event.id}`,
                }).catch((err) => {
                  logger.warn({ organizationId: org.id, error: err }, 'Plan change email failed');
                });
              }
            }
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
            if (org.email && invoice.billing_reason === 'subscription_cycle') {
              emailService.sendRenewalSucceeded(org.email, org.id, org.plan, {
                eventId: event.id,
                dedupeKey: `billing:renewal:${event.id}`,
              }).catch((err) => {
                logger.warn({ organizationId: org.id, error: err }, 'Renewal email failed');
              });
            }
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
            if (org.email) {
              emailService.sendPaymentFailed(org.email, org.id, invoice.attempt_count || 1, {
                eventId: event.id,
                dedupeKey: `billing:payment-failed:${event.id}`,
              }).catch((err) => {
                logger.warn({ organizationId: org.id, error: err }, 'Payment failed email failed');
              });
            }
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
          if (org.email) {
            const effectiveDate = subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000)
              : (subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : undefined);
            emailService.sendCancellationNotice(org.email, org.id, effectiveDate, {
              eventId: event.id,
              dedupeKey: `billing:cancelled:${event.id}`,
            }).catch((err) => {
              logger.warn({ organizationId: org.id, error: err }, 'Cancellation email failed');
            });
          }
        }
        break;
      }

      default:
        logger.info({ type: event.type }, 'Unhandled webhook event');
    }
  },

  async getSubscriptionStatus(organizationId: string) {
    ensureStripeConfigured();
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org?.stripeSubscriptionId) {
      return { status: 'inactive', plan: org?.plan || 'free' };
    }

    try {
      const subscription = await stripe!.subscriptions.retrieve(org.stripeSubscriptionId);
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
