import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.get('logLevel'),
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});
