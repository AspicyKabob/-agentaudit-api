import Stripe from 'stripe';
import { config } from '../config';

const secretKey = (config.get('stripeSecretKey') as unknown) as string;

const _stripe = secretKey && !secretKey.includes('placeholder')
  ? new Stripe(secretKey, { apiVersion: '2025-06-30' as any })
  : null;

export const stripe: any = _stripe;
export function ensureStripeConfigured(): void {
  if (!stripe) {
    throw new Error('Billing is not configured');
  }
}
