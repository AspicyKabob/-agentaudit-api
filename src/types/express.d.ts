import { Organization } from '@prisma/client';
import { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      organization?: Organization;
      id?: string;
      log?: Logger;
    }
  }
}

export {};
