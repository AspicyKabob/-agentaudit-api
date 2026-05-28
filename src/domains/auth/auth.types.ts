import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(128),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
  }),
});

export const revokeApiKeySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type RegisterBody = z.infer<typeof registerSchema>['body'];
export type LoginBody = z.infer<typeof loginSchema>['body'];
export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>['body'];

export const updateProfileSchema = z.object({
  body: z.object({
    webhookUrl: z.string().url().optional(),
  }),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>['body'];
