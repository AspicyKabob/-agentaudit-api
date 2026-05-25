import { z } from 'zod';

export const createAgentSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['langchain', 'crewai', 'autogpt', 'custom']),
    description: z.string().max(500).optional(),
    config: z.record(z.any()).optional(),
  }),
});

export const updateAgentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    config: z.record(z.any()).optional().nullable(),
  }),
});

export const agentIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type CreateAgentBody = z.infer<typeof createAgentSchema>['body'];
export type UpdateAgentBody = z.infer<typeof updateAgentSchema>['body'];
