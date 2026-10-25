import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import { errorBody } from '../utils/errorBody';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(errorBody(req, 'Missing or invalid authorization header', 'unauthorized'));
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    const organization = await prisma.organization.findUnique({
      where: { id: payload.sub as string },
    });

    if (!organization) {
      res.status(401).json(errorBody(req, 'Organization not found', 'unauthorized'));
      return;
    }

    req.organization = organization;
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json(errorBody(req, 'Invalid or expired token', 'unauthorized'));
  }
}
