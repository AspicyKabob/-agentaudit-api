import convict from 'convict';

export const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT',
  },
  databaseUrl: {
    doc: 'PostgreSQL connection string.',
    format: String,
    default: 'postgresql://user:password@localhost:5432/agentaudit?schema=public',
    env: 'DATABASE_URL',
  },
  jwtSecret: {
    doc: 'Secret for JWT signing.',
    format: String,
    default: 'change-me-in-production',
    env: 'JWT_SECRET',
    sensitive: true,
  },
  jwtAccessExpiration: {
    doc: 'JWT access token expiration.',
    format: String,
    default: '15m',
    env: 'JWT_ACCESS_EXPIRATION',
  },
  jwtRefreshExpiration: {
    doc: 'JWT refresh token expiration.',
    format: String,
    default: '7d',
    env: 'JWT_REFRESH_EXPIRATION',
  },
  frontendUrl: {
    doc: 'Frontend URL for redirects.',
    format: String,
    default: 'http://localhost:8080',
    env: 'FRONTEND_URL',
  },
  stripeSecretKey: {
    doc: 'Stripe secret key.',
    format: String,
    default: 'sk_test_placeholder',
    env: 'STRIPE_SECRET_KEY',
    sensitive: true,
  },
  stripePublishableKey: {
    doc: 'Stripe publishable key.',
    format: String,
    default: 'pk_test_placeholder',
    env: 'STRIPE_PUBLISHABLE_KEY',
  },
  stripeWebhookSecret: {
    doc: 'Stripe webhook secret.',
    format: String,
    default: 'whsec_placeholder',
    env: 'STRIPE_WEBHOOK_SECRET',
    sensitive: true,
  },
  stripePriceFree: {
    doc: 'Stripe Price ID for Free plan.',
    format: String,
    default: 'price_free',
    env: 'STRIPE_PRICE_FREE',
  },
  stripePricePro: {
    doc: 'Stripe Price ID for Pro plan.',
    format: String,
    default: 'price_pro',
    env: 'STRIPE_PRICE_PRO',
  },
  stripePriceBusiness: {
    doc: 'Stripe Price ID for Business plan.',
    format: String,
    default: 'price_business',
    env: 'STRIPE_PRICE_BUSINESS',
  },
  stripePriceEnterprise: {
    doc: 'Stripe Price ID for Enterprise plan.',
    format: String,
    default: 'price_enterprise',
    env: 'STRIPE_PRICE_ENTERPRISE',
  },
  apiKeySalt: {
    doc: 'Salt for API key hashing.',
    format: String,
    default: 'change-me-in-production',
    env: 'API_KEY_SALT',
    sensitive: true,
  },
  logLevel: {
    doc: 'Logging level.',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
    env: 'LOG_LEVEL',
  },
  resendApiKey: {
    doc: 'Resend API key for transactional email.',
    format: String,
    default: '',
    env: 'RESEND_API_KEY',
    sensitive: true,
  },
  resendFromEmail: {
    doc: 'Default from address for Resend emails.',
    format: String,
    default: 'AgentAudit <noreply@agentaudit.io>',
    env: 'RESEND_FROM_EMAIL',
  },
});

config.validate({ allowed: 'strict' });

export type Config = typeof config;
