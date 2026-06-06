import { PrismaClient } from '@prisma/client';

interface PrismaRateLimitStoreOptions {
  prisma: PrismaClient;
  windowMs: number;
  prefix?: string;
}

export class PrismaRateLimitStore {
  private prisma: PrismaClient;
  private windowMs: number;
  prefix: string;

  constructor(options: PrismaRateLimitStoreOptions) {
    this.prisma = options.prisma;
    this.windowMs = options.windowMs;
    this.prefix = options.prefix || '';
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getTime() % this.windowMs));
    const fullKey = this.prefix + key;

    try {
      const result = await this.prisma.rateLimit.upsert({
        where: {
          key_window: {
            key: fullKey,
            window: windowStart,
          },
        },
        update: {
          count: { increment: 1 },
          updatedAt: now,
        },
        create: {
          key: fullKey,
          window: windowStart,
          count: 1,
          updatedAt: now,
        },
      });

      const resetTime = new Date(windowStart.getTime() + this.windowMs);

      return {
        totalHits: result.count,
        resetTime,
      };
    } catch {
      // Fail open: if DB is unavailable, don't block traffic
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key: string): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getTime() % this.windowMs));
    const fullKey = this.prefix + key;

    try {
      await this.prisma.rateLimit.update({
        where: {
          key_window: {
            key: fullKey,
            window: windowStart,
          },
        },
        data: {
          count: { decrement: 1 },
          updatedAt: now,
        },
      });
    } catch {
      // Record may not exist; ignore
    }
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    try {
      await this.prisma.rateLimit.deleteMany({
        where: { key: fullKey },
      });
    } catch {
      // Ignore DB errors on reset
    }
  }
}
