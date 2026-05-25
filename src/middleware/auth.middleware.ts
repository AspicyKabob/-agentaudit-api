import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    const organization = await prisma.organization.findUnique({
      where: { id: payload.sub as string },
    });

    if (!organization) {
      res.status(401).json({ error: 'Organization not found' });
      return;
    }

    req.organization = organization;
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
