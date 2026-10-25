import { z } from 'zod/v3';

export const resolveAlertSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const alertIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
