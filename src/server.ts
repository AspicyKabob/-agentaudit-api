import 'dotenv/config';
import { createApp } from './app';
import { config, validateProductionConfig } from './config';
import { logger } from './utils/logger';
import { prisma } from './db/prisma';
import { initRateLimiters } from './middleware/rateLimit.middleware';
import { closeRedis } from './utils/redis';

async function bootstrap() {
  validateProductionConfig();

  await initRateLimiters();

  const app = createApp();
  const PORT = config.get('port');

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`AgentAudit API running on port ${PORT}`);
    logger.info(`Environment: ${config.get('env')}`);
  });

  function gracefulShutdown(signal: string) {
    logger.info({ signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      await prisma.$disconnect();
      await closeRedis();
      logger.info('Server closed, Prisma and Redis disconnected');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap();
