import { z } from 'zod';

export const createReportSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    format: z.enum(['pdf', 'json', 'csv']),
    dateRangeStart: z.string().datetime(),
    dateRangeEnd: z.string().datetime(),
  }),
});

export const reportIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type CreateReportBody = z.infer<typeof createReportSchema>['body'];
