import { z } from 'zod';
import { PACK_IDS } from '../compliance/compliance.types';

const enforcementModeSchema = z.enum(['block', 'flag', 'log']).default('flag');

const metadataConditionSchema = z.object({
  key: z.string().min(1),
  operator: z.enum(['eq', 'ne', 'contains', 'gt', 'lt', 'gte', 'lte']),
  value: z.any(),
});

const policyConditionsSchema = z.object({
  timeOfDay: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().optional(),
  }).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  agentTypes: z.array(z.enum(['langchain', 'crewai', 'autogpt', 'custom'])).optional(),
  metadata: z.array(metadataConditionSchema).optional(),
}).optional();

export const createPolicySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    sourcePackId: z.enum([...PACK_IDS] as [string, ...string[]]).optional(),
    mode: enforcementModeSchema.optional(),
    priority: z.number().int().default(0),
    conditions: policyConditionsSchema,
  }),
});

export const updatePolicySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    mode: enforcementModeSchema.optional(),
    priority: z.number().int().optional(),
    conditions: policyConditionsSchema.nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const policyIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const policyAnalyticsQuerySchema = z.object({
  params: z.object({
    id: z.string().uuid().optional(),
  }).optional(),
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    agentId: z.string().uuid().optional(),
    ruleType: z.string().optional(),
    severity: z.enum(['warning', 'critical']).optional(),
  }),
});

export const createVersionSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
  }),
});

export const policyVersionIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
  }),
});

export const clonePackToPolicySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    packId: z.enum([...PACK_IDS] as [string, ...string[]]),
  }),
});

export type CreatePolicyBody = z.infer<typeof createPolicySchema>['body'];
export type UpdatePolicyBody = z.infer<typeof updatePolicySchema>['body'];
export type ClonePackToPolicyBody = z.infer<typeof clonePackToPolicySchema>['body'];
