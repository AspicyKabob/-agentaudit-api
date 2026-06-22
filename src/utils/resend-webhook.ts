import crypto from 'crypto';
import { logger } from './logger';
import { EmailStatus } from '../services/email-delivery.service';

const SVIX_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export interface ResendWebhookHeaders {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

export interface ResendWebhookEvent {
  type: string;
  data: {
    email_id?: string;
    error?: { message?: string };
    bounce?: { message?: string };
    [key: string]: unknown;
  };
}

/**
 * Verify a Resend webhook signature using the Svix signing secret.
 * Returns the parsed payload if valid, otherwise throws an error.
 */
export function verifyResendWebhook(payload: string, headers: ResendWebhookHeaders, secret: string): ResendWebhookEvent {
  if (!secret || secret.trim().length === 0) {
    throw new Error('Resend webhook secret is not configured');
  }

  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];

  if (!id || !timestamp || !signature) {
    throw new Error('Missing Svix webhook headers');
  }

  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (Number.isNaN(timestampMs)) {
    throw new Error('Invalid Svix timestamp');
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > SVIX_TOLERANCE_MS) {
    throw new Error('Webhook timestamp outside tolerance');
  }

  const signedContent = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('base64');

  const signatures = signature.split(' ').map((s) => s.trim());
  const v1Signature = signatures.find((s) => s.startsWith('v1,'));
  if (!v1Signature) {
    throw new Error('No v1 signature found');
  }

  const actualSignature = v1Signature.slice(3);
  const match = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'base64'),
    Buffer.from(actualSignature, 'base64')
  );

  if (!match) {
    throw new Error('Webhook signature mismatch');
  }

  return JSON.parse(payload);
}

export function mapResendEventToStatus(eventType: string): EmailStatus | null {
  switch (eventType) {
    case 'email.sent':
      return 'sent';
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.suppressed':
      return 'suppressed';
    case 'email.failed':
      return 'failed';
    case 'email.delivery_delayed':
      return 'pending';
    default:
      logger.info({ eventType }, 'Unhandled Resend webhook event type');
      return null;
  }
}
