import crypto from 'crypto';
import { config } from '../config';

export function generateApiKey(): string {
  return `aa_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashApiKey(key: string): string {
  return crypto
    .createHmac('sha256', (config.get('apiKeySalt') as unknown) as string)
    .update(key)
    .digest('hex');
}
