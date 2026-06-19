const ORIGINAL_ENV = process.env;

function loadConfigModule(): typeof import('../../src/config') {
  jest.resetModules();
  return require('../../src/config');
}

describe('validateProductionConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows config imports before explicit startup validation', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.API_KEY_SALT;

    expect(() => loadConfigModule()).not.toThrow();

    const { validateProductionConfig } = loadConfigModule();
    expect(() => validateProductionConfig()).toThrow(
      /DATABASE_URL.*JWT_SECRET.*API_KEY_SALT/
    );
  });

  it('accepts production config with non-placeholder required values and billing disabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod:pass@db:5432/agentaudit?schema=public';
    process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.API_KEY_SALT = '0123456789abcdef0123456789abcdef';
    delete process.env.STRIPE_SECRET_KEY;

    const { validateProductionConfig } = loadConfigModule();

    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('rejects placeholder self-serve Stripe fields when billing is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod:pass@db:5432/agentaudit?schema=public';
    process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.API_KEY_SALT = '0123456789abcdef0123456789abcdef';
    process.env.STRIPE_SECRET_KEY = 'sk_live_1234567890';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_FREE;
    delete process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_BUSINESS;
    delete process.env.STRIPE_PRICE_ENTERPRISE;

    const { validateProductionConfig } = loadConfigModule();

    expect(() => validateProductionConfig()).toThrow(
      /STRIPE_WEBHOOK_SECRET.*STRIPE_PRICE_FREE.*STRIPE_PRICE_PRO.*STRIPE_PRICE_BUSINESS/
    );
  });

  it('does not require the enterprise price (contact-sales tier) when billing is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod:pass@db:5432/agentaudit?schema=public';
    process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.API_KEY_SALT = '0123456789abcdef0123456789abcdef';
    process.env.STRIPE_SECRET_KEY = 'sk_live_1234567890';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_real_value';
    process.env.STRIPE_PRICE_FREE = 'price_real_free';
    process.env.STRIPE_PRICE_PRO = 'price_real_pro';
    process.env.STRIPE_PRICE_BUSINESS = 'price_real_business';
    delete process.env.STRIPE_PRICE_ENTERPRISE;

    const { validateProductionConfig } = loadConfigModule();

    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('rejects placeholders copied from the environment example', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/agentaudit?schema=public';
    process.env.JWT_SECRET = 'CHANGE_THIS_TO_64_CHARACTER_HEX_STRING';
    process.env.API_KEY_SALT = 'CHANGE_THIS_TO_32_CHARACTER_HEX_STRING';

    const { validateProductionConfig } = loadConfigModule();

    expect(() => validateProductionConfig()).toThrow(
      /DATABASE_URL.*JWT_SECRET.*API_KEY_SALT/
    );
  });
});

describe('isPlaceholder', () => {
  it('detects empty, exact, and placeholder-substring values', () => {
    const { isPlaceholder } = loadConfigModule();

    expect(isPlaceholder('', ['known-placeholder'])).toBe(true);
    expect(isPlaceholder('known-placeholder', ['known-placeholder'])).toBe(true);
    expect(isPlaceholder('custom-PLACEHOLDER-value', ['known-placeholder'])).toBe(true);
    expect(isPlaceholder('CHANGE_THIS_TO_64_CHARACTER_HEX_STRING', ['known-placeholder'])).toBe(true);
    expect(isPlaceholder('change-me-in-production-value', ['known-placeholder'])).toBe(true);
    expect(isPlaceholder('real-secret-value', ['known-placeholder'])).toBe(false);
  });
});
