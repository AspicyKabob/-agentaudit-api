import { Router } from 'express';
import express from 'express';
import { emailWebhookController } from './webhook.controller';

const router = Router();

router.post(
  '/resend',
  express.raw({ type: 'application/json' }),
  emailWebhookController.handleResendWebhook
);

export default router;
