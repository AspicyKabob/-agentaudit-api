import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import authRoutes from './domains/auth/auth.routes';
import agentRoutes from './domains/agents/agent.routes';
import auditRoutes from './domains/audit/audit.routes';
import complianceRoutes from './domains/compliance/compliance.routes';
import policyRoutes from './domains/policies/policy.routes';
import reportRoutes from './domains/reports/report.routes';
import alertRoutes from './domains/alerts/alert.routes';
import billingRoutes from './domains/billing/billing.routes';
import emailWebhookRoutes from './domains/email/webhook.routes';
import { errorHandler } from './middleware/error.middleware';
import { requestId } from './middleware/requestId.middleware';
import { logger } from './utils/logger';
import { swaggerSpec, swaggerUiHandler, swaggerUiSetup } from './utils/swagger';
import { authLimiter, generalLimiter } from './middleware/rateLimit.middleware';
import { config } from './config';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());

  const corsOrigin = config.get('env') === 'production'
    ? (config.get('frontendUrl') || false)
    : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Body parsing — webhooks need raw body for signature verification
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl === '/api/v1/billing/webhook') return next();
    if (req.originalUrl === '/api/v1/webhooks/resend') return next();
    bodyParser.json({ limit: '10mb' })(req, res, next);
  });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl === '/api/v1/billing/webhook') return next();
    if (req.originalUrl === '/api/v1/webhooks/resend') return next();
    bodyParser.urlencoded({ extended: true })(req, res, next);
  });

  // Rate limiting — strict only on login/register, not on /auth/me or api-keys
  app.post('/api/v1/auth/register', authLimiter);
  app.post('/api/v1/auth/login', authLimiter);
  app.use('/api/v1', generalLimiter);

  app.get('/health', cors({ origin: '*', credentials: false }), async (_req, res) => {
    res.removeHeader('Access-Control-Allow-Credentials');
    const { prisma } = await import('./db/prisma');
    const { getRedisClient } = await import('./utils/redis');
    const { redisStoreActive } = await import('./middleware/rateLimit.middleware');

    async function probe(check: () => Promise<unknown>): Promise<'up' | 'down'> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(check),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Health check timed out')), 2000); }),
        ]);
        return 'up';
      } catch {
        return 'down';
      } finally {
        clearTimeout(timer);
      }
    }

    const [database, redis] = await Promise.all([
      probe(() => prisma.$executeRaw`SELECT 1`),
      redisStoreActive()
        ? probe(async () => {
          const client = getRedisClient();
          if (!client) throw new Error('Redis client unavailable');
          await client.ping();
        })
        : Promise.resolve('disabled'),
    ]);
    const ok = database === 'up' && redis !== 'down';

    res.setHeader('Cache-Control', 'no-store');
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      service: 'agentaudit-api',
      version: '1.1.0-trace',
      commit: (process.env.APP_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA)?.slice(0, 7) || 'unknown',
      dependencies: { database, redis },
      checkedAt: new Date().toISOString(),
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
  app.use('/api/v1/policies', policyRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/alerts', alertRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/webhooks', emailWebhookRoutes);

  // Catch-all — 404 JSON response for unmatched API routes
  app.use('/api/v1/*', (req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found', ...(req.id && { requestId: req.id }) });
  });

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

  // General catch-all — 404 JSON response for unmatched routes
  app.use((req, res) => {
    if (!res.headersSent) {
      res.status(404).json({ error: 'Not found', code: 'not_found', ...(req.id && { requestId: req.id }) });
    }
  });

  app.use(errorHandler);
  return app;
}
