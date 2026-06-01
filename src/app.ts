import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './domains/auth/auth.routes';
import agentRoutes from './domains/agents/agent.routes';
import auditRoutes from './domains/audit/audit.routes';
import complianceRoutes from './domains/compliance/compliance.routes';
import reportRoutes from './domains/reports/report.routes';
import alertRoutes from './domains/alerts/alert.routes';
import billingRoutes from './domains/billing/billing.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { swaggerSpec, swaggerUiHandler, swaggerUiSetup } from './utils/swagger';
import { authLimiter, auditLimiter, generalLimiter } from './middleware/rateLimit.middleware';
import { config } from './config';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());

  const corsOrigin = config.get('env') === 'production'
    ? (config.get('frontendUrl') || false)
    : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Body parsing — webhook needs raw body for Stripe signature verification
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl === '/api/v1/billing/webhook') return next();
    express.json({ limit: '10mb' })(req, res, next);
  });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl === '/api/v1/billing/webhook') return next();
    express.urlencoded({ extended: true })(req, res, next);
  });

  // Rate limiting — strict only on login/register, not on /auth/me or api-keys
  app.post('/api/v1/auth/register', authLimiter);
  app.post('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/audit-logs', auditLimiter);
  app.use('/api/v1', generalLimiter);

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'agentaudit-api',
      version: '1.1.0-trace',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
      emailEnabled: !!config.get('resendApiKey'),
      frontendUrl: config.get('frontendUrl'),
    });
  });

  // Docs
  app.use('/docs', swaggerUiHandler, swaggerUiSetup);
  app.get('/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // API routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/agents', agentRoutes);
  app.use('/api/v1/audit-logs', auditRoutes);
  app.use('/api/v1/compliance-rules', complianceRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/alerts', alertRoutes);
  app.use('/api/v1/billing', billingRoutes);

  // MCP schema
  app.get('/mcp/v1/schema', (_req, res) => {
    res.status(200).json({
      name: 'AgentAudit MCP',
      version: '1.0.0',
      endpoints: [
        { path: '/mcp/v1/audit', method: 'POST', description: 'Structured audit submission' },
      ],
      schema: {
        audit: {
          agentId: { type: 'string', format: 'uuid', required: false },
          action: { type: 'string', required: true },
          prompt: { type: 'string', required: false },
          response: { type: 'string', required: false },
          metadata: { type: 'object', required: false },
        },
      },
    });
  });

  // Static website
  const websitePath = fs.existsSync(path.join(__dirname, 'website'))
    ? path.join(__dirname, 'website')
    : path.join(process.cwd(), 'website');
  logger.info('Serving static files from: ' + websitePath);
  app.use(express.static(websitePath, { index: ['index.html'] }));

  app.use(errorHandler);
  return app;
}
