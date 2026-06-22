import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError || (error as any)?.name === 'ZodError' || (error as any)?.constructor?.name === 'ZodError') {
        const zodError = error as ZodError;
        const issues = zodError.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        logger.warn({ issues }, 'Validation failed');
        res.status(400).json({ error: 'Validation failed', issues });
        return;
      }
      next(error);
    }
  };
}
