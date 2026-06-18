import {
  PLAN_QUOTAS,
  getQuotaForPlan,
  getPlanForPriceId,
  isAllowedPriceId,
  getAllowedPriceIds,
} from '../../src/domains/billing/plans';

// In the test/dev environment the Stripe price IDs fall back to the config
// defaults: price_free / price_pro / price_business / price_enterprise.
describe('billing plan mapping', () => {
  it('maps each configured price ID to its plan tier deterministically', () => {
    expect(getPlanForPriceId('price_free')).toBe('free');
    expect(getPlanForPriceId('price_pro')).toBe('pro');
    expect(getPlanForPriceId('price_business')).toBe('business');
    expect(getPlanForPriceId('price_enterprise')).toBe('enterprise');
  });

  it('returns null for an unknown / arbitrary price ID', () => {
    expect(getPlanForPriceId('price_attacker_controlled')).toBeNull();
    expect(getPlanForPriceId('')).toBeNull();
    expect(getPlanForPriceId(undefined)).toBeNull();
  });

  it('allowlists only configured price IDs', () => {
    expect(isAllowedPriceId('price_pro')).toBe(true);
    expect(isAllowedPriceId('price_business')).toBe(true);
    expect(isAllowedPriceId('price_not_real')).toBe(false);
    expect(isAllowedPriceId(123 as unknown)).toBe(false);

    const allowed = getAllowedPriceIds();
    expect(allowed).toEqual(
      expect.arrayContaining(['price_free', 'price_pro', 'price_business', 'price_enterprise'])
    );
    expect(allowed).not.toContain('price_not_real');
  });

  it('returns the correct quota per plan with a safe free-tier fallback', () => {
    expect(getQuotaForPlan('pro')).toBe(PLAN_QUOTAS.pro);
    expect(getQuotaForPlan('business')).toBe(PLAN_QUOTAS.business);
    expect(getQuotaForPlan('unknown-plan')).toBe(PLAN_QUOTAS.free);
  });
});
