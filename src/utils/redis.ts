import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from './logger';

let client: RedisClientType | undefined;
let connected = false;
let isTryingToConnect = false;

function shouldUseRedis(): boolean {
  return config.get('redisEnabled') === true && config.get('redisUrl') !== '';
}

export function getRedisClient(): RedisClientType | undefined {
  return shouldUseRedis() ? client : undefined;
}

export async function connectRedis(): Promise<boolean> {
  if (!shouldUseRedis()) return false;
  if (connected) return true;
  if (isTryingToConnect) {
    while (isTryingToConnect) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return connected;
  }

  isTryingToConnect = true;
  const url = config.get('redisUrl') as string;

  try {
    client = createClient({
      url,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) },
    });

    client.on('error', (err: Error) => {
      if (connected) {
        logger.warn({ error: err.message }, 'Redis connection error');
      }
    });

    await client.connect();
    connected = true;
    logger.info({ url }, 'Redis connected');
  } catch (err: any) {
    connected = false;
    client = undefined;
    logger.warn(
      { error: err.message },
      'Redis unavailable — rate limiting will fall back to Prisma'
    );
  } finally {
    isTryingToConnect = false;
  }

  return connected;
}

export async function closeRedis(): Promise<void> {
  if (client && connected) {
    await client.quit();
    connected = false;
    logger.info('Redis disconnected');
  }
  client = undefined;
}
