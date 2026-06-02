import { z } from 'zod';

export const submitAuditSchema = z.object({
  body: z.object({
    agentId: z.string().uuid().optional(),
    action: z.string().min(1).max(200),
    prompt: z.string().max(10000).optional(),
    response: z.string().max(10000).optional(),
    metadata: z.record(z.any()).optional(),
    traceId: z.string().optional(),
    parentSpanId: z.string().optional(),
  }),
});

export const batchAuditSchema = z.object({
  body: z.array(
    z.object({
      agentId: z.string().uuid().optional(),
      action: z.string().min(1).max(200),
      prompt: z.string().max(10000).optional(),
      response: z.string().max(10000).optional(),
      metadata: z.record(z.any()).optional(),
      traceId: z.string().optional(),
      parentSpanId: z.string().optional(),
    })
  ).min(1).max(100),
});

export const traceAuditSchema = z.object({
  params: z.object({
    traceId: z.string(),
  }),
  query: z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
  }),
});

export const queryAuditSchema = z.object({
  query: z.object({
    action: z.string().optional(),
    agentId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
  }),
});

export const auditIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type SubmitAuditBody = z.infer<typeof submitAuditSchema>['body'];
export type QueryAuditQuery = z.infer<typeof queryAuditSchema>['query'];
export type BatchAuditBody = z.infer<typeof batchAuditSchema>['body'];

export type BatchAuditResponse = {
  data: Array<{
    id: string;
    action: string;
    complianceFlags: string[];
    createdAt: Date | string;
  }>;
  processed: number;
  errors: number;
};
