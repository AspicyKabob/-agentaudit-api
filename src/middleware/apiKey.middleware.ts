import { Request, Response, NextFunction } from 'express';
import { hashApiKey } from '../utils/apiKey';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  try {
    const keyHash = hashApiKey(apiKey);
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { organization: true },
    });

    if (!apiKeyRecord || apiKeyRecord.revokedAt) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }

    // Update last used — fire-and-forget so it never blocks the request
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {
      // Non-critical: lastUsedAt staleness is acceptable
    });

    req.organization = apiKeyRecord.organization;
    next();
  } catch (error) {
    logger.warn({ error }, 'API key verification failed');
    res.status(401).json({ error: 'Invalid API key' });
  }
}
