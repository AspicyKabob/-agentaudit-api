import { config } from '../../config';

export type PlanTier = 'free' | 'pro' | 'business' | 'enterprise';

export const PLAN_TIERS: PlanTier[] = ['free', 'pro', 'business', 'enterprise'];

export const PLAN_QUOTAS: Record<PlanTier, number> = {
  free: 5000,
  pro: 50000,
  business: 250000,
  enterprise: 999999999,
};

export function getQuotaForPlan(plan: string): number {
  return PLAN_QUOTAS[plan as PlanTier] ?? PLAN_QUOTAS.free;
}

type PriceConfigKey =
  | 'stripePriceFree'
  | 'stripePricePro'
  | 'stripePriceBusiness'
  | 'stripePriceEnterprise';

const PRICE_CONFIG_BY_PLAN: Record<PlanTier, PriceConfigKey> = {
  free: 'stripePriceFree',
  pro: 'stripePricePro',
  business: 'stripePriceBusiness',
  enterprise: 'stripePriceEnterprise',
};

/**
 * Single source of truth mapping each configured Stripe price ID to its plan
 * tier. Built from the runtime config so checkout (allowlist) and the webhook
 * (plan assignment) stay in sync. Empty/unset price IDs are excluded.
 */
export function getPricePlanMap(): Map<string, PlanTier> {
  const map = new Map<string, PlanTier>();
  for (const tier of PLAN_TIERS) {
    const priceId = config.get(PRICE_CONFIG_BY_PLAN[tier]);
    if (typeof priceId === 'string' && priceId.trim() !== '') {
      map.set(priceId, tier);
    }
  }
  return map;
}

export function getPlanForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  return getPricePlanMap().get(priceId) ?? null;
}

export function isAllowedPriceId(priceId: unknown): priceId is string {
  return typeof priceId === 'string' && getPricePlanMap().has(priceId);
}

export function getAllowedPriceIds(): string[] {
  return Array.from(getPricePlanMap().keys());
}
