import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { emailDeliveryService } from '../../services/email-delivery.service';
import { verifyResendWebhook, mapResendEventToStatus, ResendWebhookEvent } from '../../utils/resend-webhook';

export const emailWebhookController = {
  handleResendWebhook: asyncHandler(async (req: Request, res: Response) => {
    const raw = req.body;
    const payload = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    const secret = config.get('resendWebhookSecret');

    let event: ResendWebhookEvent;
    try {
      if (secret && secret.trim().length > 0) {
        event = verifyResendWebhook(payload, {
          'svix-id': req.headers['svix-id'] as string,
          'svix-timestamp': req.headers['svix-timestamp'] as string,
          'svix-signature': req.headers['svix-signature'] as string,
        }, secret);
      } else {
        logger.warn('RESEND_WEBHOOK_SECRET not configured — accepting Resend webhook without signature verification');
        event = JSON.parse(payload) as ResendWebhookEvent;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ error: message }, 'Invalid Resend webhook');
      res.status(400).json({ error: 'Invalid webhook' });
      return;
    }

    const eventType = event.type;
    const emailId = event.data?.email_id;
    const errorMessage = event.data?.error?.message || event.data?.bounce?.message || undefined;

    logger.info({ eventType, emailId }, 'Resend webhook received');

    const status = mapResendEventToStatus(eventType);
    if (status && emailId) {
      await emailDeliveryService.updateStatusByProviderMessageId(emailId, status, errorMessage);
    }

    res.status(200).json({ received: true });
  }),
};
