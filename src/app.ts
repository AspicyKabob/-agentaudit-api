import express from 'express';
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

  // Security middleware
  app.use(helmet());

  // CORS: allow all in dev, restrict in production
  const corsOrigin = config.get('env') === 'production'
    ? (config.get('frontendUrl') || false)
    : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Rate Limiting ──────────────────────────────────────────────
  app.use('/api/v1/auth', authLimiter);
  app.use('/api/v1/audit-logs', auditLimiter);
  app.use('/api/v1', generalLimiter);

  // Health check (outside rate limit so monitoring works)
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'agentaudit-api', version: '1.0.3-trace' });
  });

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

  // MCP endpoint (placeholder schema endpoint)
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

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
