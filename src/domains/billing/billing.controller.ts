import { Request, Response } from 'express';
import { subscriptionService } from './subscription.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { stripe } from '../../utils/stripe';
import { config } from '../../config';

export const billingController = {
  createCheckoutSession: asyncHandler(async (req: Request, res: Response) => {
    const { priceId } = req.body;
    const organizationId = req.organization!.id;
    const email = req.organization!.email;

    const session = await subscriptionService.createCheckoutSession(
      organizationId,
      priceId,
      email
    );

    res.status(200).json({ sessionId: session.id, url: session.url });
  }),

  getSubscriptionStatus: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const status = await subscriptionService.getSubscriptionStatus(organizationId);
    res.status(200).json(status);
  }),

  createPortalSession: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const session = await subscriptionService.createPortalSession(organizationId);
    res.status(200).json({ url: session.url });
  }),

  handleWebhook: asyncHandler(async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = config.get('stripeWebhookSecret');

    if (!sig || !endpointSecret) {
      res.status(400).json({ error: 'Missing stripe signature' });
      return;
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
      return;
    }

    await subscriptionService.handleWebhookEvent(event);
    res.status(200).json({ received: true });
  }),
};
