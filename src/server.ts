import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './db/prisma';

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
    logger.info('Server closed and Prisma disconnected');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
