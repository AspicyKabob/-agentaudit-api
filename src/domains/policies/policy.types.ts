import { z } from 'zod';
import { PACK_IDS } from '../compliance/compliance.types';

const enforcementModeSchema = z.enum(['block', 'flag', 'log']).default('flag');

export const createPolicySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    sourcePackId: z.enum([...PACK_IDS] as [string, ...string[]]).optional(),
    mode: enforcementModeSchema.optional(),
    priority: z.number().int().default(0),
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
    isActive: z.boolean().optional(),
  }),
});

export const policyIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
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
