const ORIGINAL_ENV = process.env;

function loadPlansModule(): typeof import('../../src/domains/billing/plans') {
  jest.resetModules();
  return require('../../src/domains/billing/plans');
}

function setRealPrices(): void {
  process.env.STRIPE_PRICE_FREE = 'price_real_free';
  process.env.STRIPE_PRICE_PRO = 'price_real_pro';
  process.env.STRIPE_PRICE_BUSINESS = 'price_real_business';
  process.env.STRIPE_PRICE_ENTERPRISE = 'price_real_enterprise';
}

describe('billing plan mapping', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('maps each configured real price ID to its plan tier deterministically', () => {
    setRealPrices();
    const { getPlanForPriceId } = loadPlansModule();

    expect(getPlanForPriceId('price_real_free')).toBe('free');
    expect(getPlanForPriceId('price_real_pro')).toBe('pro');
    expect(getPlanForPriceId('price_real_business')).toBe('business');
    expect(getPlanForPriceId('price_real_enterprise')).toBe('enterprise');
  });

  it('excludes still-placeholder price IDs from the allowlist', () => {
    // No env overrides: every price falls back to its placeholder default.
    const { getPlanForPriceId, isAllowedPriceId, getAllowedPriceIds } = loadPlansModule();

    expect(getPlanForPriceId('price_free')).toBeNull();
    expect(getPlanForPriceId('price_enterprise')).toBeNull();
    expect(isAllowedPriceId('price_pro')).toBe(false);
    expect(getAllowedPriceIds()).toEqual([]);
  });

  it('omits an unset enterprise price while keeping the self-serve tiers', () => {
    setRealPrices();
    delete process.env.STRIPE_PRICE_ENTERPRISE; // contact-sales: left at placeholder default
    const { getPlanForPriceId, getAllowedPriceIds } = loadPlansModule();

    expect(getPlanForPriceId('price_enterprise')).toBeNull();
    expect(getAllowedPriceIds()).toEqual(
      expect.arrayContaining(['price_real_free', 'price_real_pro', 'price_real_business'])
    );
    expect(getAllowedPriceIds()).not.toContain('price_enterprise');
  });

  it('returns null for an unknown / arbitrary price ID', () => {
    setRealPrices();
    const { getPlanForPriceId } = loadPlansModule();

    expect(getPlanForPriceId('price_attacker_controlled')).toBeNull();
    expect(getPlanForPriceId('')).toBeNull();
    expect(getPlanForPriceId(undefined)).toBeNull();
  });

  it('rejects non-string price IDs', () => {
    setRealPrices();
    const { isAllowedPriceId } = loadPlansModule();

    expect(isAllowedPriceId('price_real_pro')).toBe(true);
    expect(isAllowedPriceId('price_not_real')).toBe(false);
    expect(isAllowedPriceId(123 as unknown)).toBe(false);
  });

  it('returns the correct quota per plan with a safe free-tier fallback', () => {
    const { PLAN_QUOTAS, getQuotaForPlan } = loadPlansModule();

    expect(getQuotaForPlan('pro')).toBe(PLAN_QUOTAS.pro);
    expect(getQuotaForPlan('business')).toBe(PLAN_QUOTAS.business);
    expect(getQuotaForPlan('unknown-plan')).toBe(PLAN_QUOTAS.free);
  });
});
