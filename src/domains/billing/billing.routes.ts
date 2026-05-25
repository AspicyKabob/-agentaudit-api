import { Router } from 'express';
import { billingController } from './billing.controller';
import { authenticate } from '../../middleware/auth.middleware';
import express from 'express';

const router = Router();

router.post('/checkout-session', authenticate, billingController.createCheckoutSession);
router.get('/subscription', authenticate, billingController.getSubscriptionStatus);
router.post('/portal-session', authenticate, billingController.createPortalSession);

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  billingController.handleWebhook
);

export default router;
