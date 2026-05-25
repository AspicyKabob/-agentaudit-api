import { Organization } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      organization?: Organization;
    }
  }
}

export {};
