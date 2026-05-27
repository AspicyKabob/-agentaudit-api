import { z } from 'zod';

export const createRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    ruleType: z.enum(['pii_detect', 'keyword_match', 'rate_limit', 'regex_match', 'sentiment_analysis', 'custom_validator']),
    condition: z.record(z.any()),
    severity: z.enum(['warning', 'critical']).default('warning'),
  }),
});

export const updateRuleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    condition: z.record(z.any()).optional(),
    severity: z.enum(['warning', 'critical']).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const ruleIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type CreateRuleBody = z.infer<typeof createRuleSchema>['body'];
export type UpdateRuleBody = z.infer<typeof updateRuleSchema>['body'];
