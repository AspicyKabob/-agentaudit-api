import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();
const PORT = config.get('port');

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`AgentAudit API running on port ${PORT}`);
  logger.info(`Environment: ${config.get('env')}`);
});
