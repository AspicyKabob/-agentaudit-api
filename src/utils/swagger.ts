import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'AgentAudit API',
    version: '1.1.0-trace',
    description: 'Audit & Compliance API for AI Agents. Track every prompt, decision, and action with real-time compliance monitoring.',
    contact: { name: 'AgentAudit Support', email: 'support@agentaudit.online' },
    license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  },
  servers: [
    { url: 'https://agentaudit-api-production.up.railway.app/api/v1', description: 'Production' },
    { url: 'http://localhost:8080/api/v1', description: 'Local development' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
        description: 'JWT access token — obtain via /auth/login',
      },
      apiKeyAuth: {
        type: 'apiKey', in: 'header', name: 'X-API-Key',
        description: 'API key for agent-to-API calls — obtain via /auth/api-keys',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          plan: { type: 'string', enum: ['free', 'pro', 'business', 'enterprise'] },
          apiUsed: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          organizationId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          agentId: { type: 'string', format: 'uuid', nullable: true },
          action: { type: 'string' },
          prompt: { type: 'string', nullable: true },
          response: { type: 'string', nullable: true },
          metadata: { type: 'object', nullable: true },
          complianceFlags: { type: 'array', items: { type: 'string' } },
          traceId: { type: 'string', nullable: true },
          organizationId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ComplianceRule: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['keyword', 'regex', 'sentiment', 'custom'] },
          pattern: { type: 'string', nullable: true },
          keywords: { type: 'array', items: { type: 'string' }, nullable: true },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          enabled: { type: 'boolean' },
          organizationId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          message: { type: 'string' },
          resolved: { type: 'boolean' },
          auditLogId: { type: 'string', format: 'uuid', nullable: true },
          organizationId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    // ── Auth ────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new organization',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Organization created',
            content: { 'application/json': { schema: { type: 'object', properties: { accessToken: { type: 'string' }, organization: { $ref: '#/components/schemas/Organization' } } } } },
          },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: { 'application/json': { schema: { type: 'object', properties: { accessToken: { type: 'string' }, organization: { $ref: '#/components/schemas/Organization' } } } } },
          },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current organization profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Update organization profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/auth/api-keys': {
      get: {
        tags: ['Auth'],
        summary: 'List API keys',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'List of API keys', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Auth'],
        summary: 'Create an API key',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Production Agent' } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Key created — store the key value, it is only shown once',
            content: { 'application/json': { schema: { type: 'object', properties: { key: { type: 'string', example: 'aa_live_...' }, id: { type: 'string' }, name: { type: 'string' } } } } },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/auth/api-keys/{id}': {
      delete: {
        tags: ['Auth'],
        summary: 'Revoke an API key',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Key revoked' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Key not found' },
        },
      },
    },

    // ── Agents ─────────────────────────────────────────────────────────
    '/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List all agents',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Agent list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Agent' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Agents'],
        summary: 'Register an agent',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Agent created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/agents/{id}': {
      get: {
        tags: ['Agents'],
        summary: 'Get an agent by ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Agent', content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Agents'],
        summary: 'Update an agent',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated agent', content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } } },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Agents'],
        summary: 'Delete an agent',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },

    // ── Audit Logs ─────────────────────────────────────────────────────
    '/audit-logs': {
      post: {
        tags: ['Audit Logs'],
        summary: 'Submit an audit log entry',
        description: 'Agent-facing endpoint. Authenticate with your API key (`X-API-Key` header).',
        security: [{ apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  agentId: { type: 'string', format: 'uuid' },
                  action: { type: 'string', example: 'prompt_submitted' },
                  prompt: { type: 'string' },
                  response: { type: 'string' },
                  metadata: { type: 'object' },
                  traceId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Log created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditLog' } } } },
          '401': { description: 'Invalid or missing API key' },
        },
      },
      get: {
        tags: ['Audit Logs'],
        summary: 'Query audit logs',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'agentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'flagged', in: 'query', schema: { type: 'boolean' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Paginated log results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                    pagination: { type: 'object', properties: { total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/audit-logs/batch': {
      post: {
        tags: ['Audit Logs'],
        summary: 'Submit a batch of audit log entries',
        description: 'Process up to 100 audit logs in a single request. Each entry is evaluated against compliance rules atomically within a database transaction. Errors on individual entries do not abort the batch.',
        security: [{ apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                minItems: 1,
                maxItems: 100,
                items: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    agentId: { type: 'string', format: 'uuid' },
                    action: { type: 'string', example: 'prompt_submitted' },
                    prompt: { type: 'string' },
                    response: { type: 'string' },
                    metadata: { type: 'object' },
                    traceId: { type: 'string' },
                    parentSpanId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Batch processed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    processed: { type: 'integer', description: 'Number of entries successfully created' },
                    errors: { type: 'integer', description: 'Number of entries that failed' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid or missing API key' },
          '429': { description: 'Batch rate limit exceeded' },
        },
      },
    },
    '/audit-logs/export': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Export audit logs as CSV',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/audit-logs/trace/{traceId}': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Get all logs for a trace ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'traceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Trace logs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/audit-logs/{id}': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Get a single audit log',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Audit log', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditLog' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
    '/audit-logs/{id}/chain': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Get the audit chain for a log entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Chain of related logs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } } } } },
          '404': { description: 'Not found' },
        },
      },
    },

    // ── Compliance Rules ───────────────────────────────────────────────
    '/compliance-rules': {
      get: {
        tags: ['Compliance'],
        summary: 'List compliance rules',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Rules list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ComplianceRule' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Compliance'],
        summary: 'Create a compliance rule',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'type', 'severity'],
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['keyword', 'regex', 'sentiment', 'custom'] },
                  pattern: { type: 'string' },
                  keywords: { type: 'array', items: { type: 'string' } },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  enabled: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Rule created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplianceRule' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/compliance-rules/{id}': {
      get: {
        tags: ['Compliance'],
        summary: 'Get a compliance rule',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Rule', content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplianceRule' } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Compliance'],
        summary: 'Update a compliance rule',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  pattern: { type: 'string' },
                  keywords: { type: 'array', items: { type: 'string' } },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated rule', content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplianceRule' } } } },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Compliance'],
        summary: 'Delete a compliance rule',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },

    // ── Alerts ─────────────────────────────────────────────────────────
    '/alerts': {
      get: {
        tags: ['Alerts'],
        summary: 'List alerts',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'resolved', in: 'query', schema: { type: 'boolean' } },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } },
        ],
        responses: {
          '200': { description: 'Alert list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Alert' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/alerts/{id}/resolve': {
      patch: {
        tags: ['Alerts'],
        summary: 'Resolve an alert',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Alert resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } } },
          '404': { description: 'Not found' },
        },
      },
    },

    // ── Reports ────────────────────────────────────────────────────────
    '/reports': {
      get: {
        tags: ['Reports'],
        summary: 'List reports',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Reports list', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Reports'],
        summary: 'Generate a report',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type'],
                properties: {
                  type: { type: 'string', enum: ['compliance', 'activity', 'anomaly'] },
                  from: { type: 'string', format: 'date-time' },
                  to: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Report generated', content: { 'application/json': { schema: { type: 'object' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/reports/{id}': {
      get: {
        tags: ['Reports'],
        summary: 'Get a report',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Report', content: { 'application/json': { schema: { type: 'object' } } } },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Reports'],
        summary: 'Delete a report',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },

    // ── Billing ────────────────────────────────────────────────────────
    '/billing/checkout-session': {
      post: {
        tags: ['Billing'],
        summary: 'Create a Stripe checkout session',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['priceId'],
                properties: { priceId: { type: 'string', example: 'price_...' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Checkout session', content: { 'application/json': { schema: { type: 'object', properties: { sessionId: { type: 'string' }, url: { type: 'string' } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/billing/subscription': {
      get: {
        tags: ['Billing'],
        summary: 'Get subscription status',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Subscription info',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    plan: { type: 'string' },
                    currentPeriodEnd: { type: 'string', format: 'date-time' },
                    cancelAtPeriodEnd: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/billing/portal-session': {
      post: {
        tags: ['Billing'],
        summary: 'Create a Stripe customer portal session',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Portal URL', content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Registration, login, and API key management' },
    { name: 'Agents', description: 'Register and manage AI agents' },
    { name: 'Audit Logs', description: 'Submit and query agent audit logs' },
    { name: 'Compliance', description: 'Define guardrail rules for agent output' },
    { name: 'Alerts', description: 'View and resolve compliance alerts' },
    { name: 'Reports', description: 'Generate compliance and activity reports' },
    { name: 'Billing', description: 'Stripe subscription management' },
  ],
};

export const swaggerUiHandler = swaggerUi.serve;
export const swaggerUiSetup = swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'AgentAudit API Docs',
  customfavIcon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%230c0c0c'/%3E%3Ctext x='50' y='72' text-anchor='middle' font-family='Georgia,serif' font-size='60' font-weight='bold' font-style='italic' fill='%23dc2626'%3EA%3C/text%3E%3C/svg%3E",
  customCss: `
    /* ── Import fonts ─────────────────────────────────────────── */
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

    /* ── Page shell ───────────────────────────────────────────── */
    body, .swagger-ui {
      background: #0c0c0c !important;
      font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
      color: #fafaf9 !important;
    }

    /* ── Hide topbar ──────────────────────────────────────────── */
    .swagger-ui .topbar { display: none !important; }

    /* ── Custom header bar ────────────────────────────────────── */
    .swagger-ui .information-container {
      background: #0c0c0c !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
      padding: 32px 0 28px !important;
    }
    .swagger-ui .info { margin: 0 !important; }
    .swagger-ui .info .title {
      font-family: 'Inter', sans-serif !important;
      font-size: 28px !important;
      font-weight: 700 !important;
      color: #fafaf9 !important;
      letter-spacing: -0.02em !important;
    }
    .swagger-ui .info .title small {
      background: #dc2626 !important;
      border-radius: 0 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      padding: 2px 8px !important;
      margin-left: 10px !important;
      vertical-align: middle !important;
    }
    .swagger-ui .info p,
    .swagger-ui .info li,
    .swagger-ui .info a {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 13px !important;
      color: #a8a29e !important;
    }
    .swagger-ui .info a { color: #dc2626 !important; }

    /* ── Wrapper / container ──────────────────────────────────── */
    .swagger-ui .wrapper { background: #0c0c0c !important; }
    .swagger-ui .wrapper > div { background: #0c0c0c !important; }

    /* ── Scheme selector / servers ────────────────────────────── */
    .swagger-ui .scheme-container {
      background: #0c0c0c !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
      box-shadow: none !important;
      padding: 16px 0 !important;
    }
    .swagger-ui .schemes > label,
    .swagger-ui .schemes select {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
      background: #141414 !important;
      border: 1px solid rgba(250,250,249,0.1) !important;
      border-radius: 0 !important;
    }

    /* ── Authorize button ─────────────────────────────────────── */
    .swagger-ui .btn.authorize {
      background: transparent !important;
      border: 1px solid #dc2626 !important;
      color: #dc2626 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      border-radius: 0 !important;
      padding: 6px 16px !important;
    }
    .swagger-ui .btn.authorize:hover {
      background: #dc2626 !important;
      color: #fff !important;
    }
    .swagger-ui .btn.authorize svg { fill: #dc2626 !important; }
    .swagger-ui .btn.authorize:hover svg { fill: #fff !important; }

    /* ── Tags / section headings ──────────────────────────────── */
    .swagger-ui .opblock-tag {
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
      color: #fafaf9 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 13px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.1em !important;
    }
    .swagger-ui .opblock-tag:hover { background: rgba(250,250,249,0.02) !important; }
    .swagger-ui .opblock-tag small {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      color: #78716c !important;
    }

    /* ── Operation blocks ─────────────────────────────────────── */
    .swagger-ui .opblock {
      background: #141414 !important;
      border: 1px solid rgba(250,250,249,0.08) !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      margin-bottom: 6px !important;
    }
    .swagger-ui .opblock:hover { border-color: rgba(250,250,249,0.15) !important; }
    .swagger-ui .opblock.is-open { border-color: rgba(250,250,249,0.15) !important; }

    .swagger-ui .opblock .opblock-summary {
      border-bottom: none !important;
    }
    .swagger-ui .opblock.is-open .opblock-summary {
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui .opblock-summary-path,
    .swagger-ui .opblock-summary-path__deprecated {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 13px !important;
      color: #fafaf9 !important;
    }
    .swagger-ui .opblock-summary-description {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      color: #78716c !important;
    }

    /* GET */
    .swagger-ui .opblock.opblock-get { background: rgba(22,163,74,0.04) !important; border-left: 3px solid rgba(22,163,74,0.5) !important; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: rgba(22,163,74,0.15) !important; color: #4ade80 !important; }
    /* POST */
    .swagger-ui .opblock.opblock-post { background: rgba(129,140,248,0.04) !important; border-left: 3px solid rgba(129,140,248,0.5) !important; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: rgba(129,140,248,0.15) !important; color: #818cf8 !important; }
    /* PATCH */
    .swagger-ui .opblock.opblock-patch { background: rgba(202,138,4,0.04) !important; border-left: 3px solid rgba(202,138,4,0.5) !important; }
    .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: rgba(202,138,4,0.15) !important; color: #fbbf24 !important; }
    /* DELETE */
    .swagger-ui .opblock.opblock-delete { background: rgba(220,38,38,0.04) !important; border-left: 3px solid rgba(220,38,38,0.5) !important; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: rgba(220,38,38,0.15) !important; color: #f87171 !important; }

    /* Method badge */
    .swagger-ui .opblock-summary-method {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em !important;
      border-radius: 0 !important;
      min-width: 70px !important;
      text-align: center !important;
    }

    /* ── Expanded operation body ──────────────────────────────── */
    .swagger-ui .opblock-body { background: #0c0c0c !important; }
    .swagger-ui .opblock-section-header {
      background: #141414 !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui .opblock-section-header h4,
    .swagger-ui .opblock-section-header label {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.1em !important;
      color: #a8a29e !important;
    }

    /* ── Parameters table ─────────────────────────────────────── */
    .swagger-ui table thead tr th,
    .swagger-ui table thead tr td {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      color: #78716c !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
      background: transparent !important;
    }
    .swagger-ui table tbody tr td {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
      border-bottom: 1px solid rgba(250,250,249,0.05) !important;
      background: transparent !important;
    }
    .swagger-ui .parameter__name {
      font-family: 'JetBrains Mono', monospace !important;
      color: #fafaf9 !important;
      font-size: 13px !important;
    }
    .swagger-ui .parameter__name.required span { color: #dc2626 !important; }
    .swagger-ui .parameter__type,
    .swagger-ui .parameter__deprecated,
    .swagger-ui .parameter__in {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      color: #78716c !important;
    }

    /* ── Inputs / textareas ───────────────────────────────────── */
    .swagger-ui input[type=text],
    .swagger-ui input[type=password],
    .swagger-ui input[type=search],
    .swagger-ui input[type=email],
    .swagger-ui textarea,
    .swagger-ui select {
      background: #0a0a0a !important;
      border: 1px solid rgba(250,250,249,0.1) !important;
      border-radius: 0 !important;
      color: #fafaf9 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      padding: 8px 12px !important;
    }
    .swagger-ui input:focus,
    .swagger-ui textarea:focus {
      border-color: rgba(250,250,249,0.3) !important;
      outline: none !important;
      box-shadow: none !important;
    }
    .swagger-ui input::placeholder,
    .swagger-ui textarea::placeholder { color: #78716c !important; }

    /* ── Code / response body ─────────────────────────────────── */
    .swagger-ui .highlight-code,
    .swagger-ui .microlight,
    .swagger-ui code,
    .swagger-ui pre {
      background: #0a0a0a !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
      border-radius: 0 !important;
      border: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui .response-col_status { color: #fafaf9 !important; font-family: 'JetBrains Mono', monospace !important; }
    .swagger-ui .response-col_description { font-family: 'JetBrains Mono', monospace !important; color: #a8a29e !important; }
    .swagger-ui .response-col_links { font-family: 'JetBrains Mono', monospace !important; color: #78716c !important; }

    /* ── Buttons ──────────────────────────────────────────────── */
    .swagger-ui .btn {
      border-radius: 0 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
    }
    .swagger-ui .btn.execute {
      background: #dc2626 !important;
      border-color: #dc2626 !important;
      color: #fff !important;
    }
    .swagger-ui .btn.execute:hover { background: #b91c1c !important; }
    .swagger-ui .btn-clear,
    .swagger-ui .btn.cancel {
      background: transparent !important;
      border: 1px solid rgba(250,250,249,0.15) !important;
      color: #a8a29e !important;
    }
    .swagger-ui .btn-clear:hover,
    .swagger-ui .btn.cancel:hover { border-color: rgba(250,250,249,0.3) !important; color: #fafaf9 !important; }

    /* ── Model / schema ───────────────────────────────────────── */
    .swagger-ui .model-box,
    .swagger-ui .model {
      background: #0a0a0a !important;
      border: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui .model-title,
    .swagger-ui .model-title__text {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #fafaf9 !important;
    }
    .swagger-ui .prop-type { color: #818cf8 !important; font-family: 'JetBrains Mono', monospace !important; }
    .swagger-ui .prop-format { color: #78716c !important; font-family: 'JetBrains Mono', monospace !important; }
    .swagger-ui section.models { border: 1px solid rgba(250,250,249,0.08) !important; }
    .swagger-ui section.models h4 {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
      background: #141414 !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui section.models.is-open h4 { border-bottom: 1px solid rgba(250,250,249,0.08) !important; }

    /* ── Response codes ───────────────────────────────────────── */
    .swagger-ui .responses-inner h4,
    .swagger-ui .responses-inner h5 {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      color: #78716c !important;
    }
    .swagger-ui .response { background: transparent !important; }

    /* ── Modal (Authorize) ────────────────────────────────────── */
    .swagger-ui .dialog-ux .backdrop-ux { background: rgba(0,0,0,0.8) !important; }
    .swagger-ui .dialog-ux .modal-ux {
      background: #141414 !important;
      border: 1px solid rgba(250,250,249,0.12) !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header {
      background: #141414 !important;
      border-bottom: 1px solid rgba(250,250,249,0.08) !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header h3 {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 14px !important;
      color: #fafaf9 !important;
    }
    .swagger-ui .dialog-ux .modal-ux-content { background: #141414 !important; }
    .swagger-ui .dialog-ux .modal-ux-content p,
    .swagger-ui .dialog-ux .modal-ux-content h4,
    .swagger-ui .dialog-ux .modal-ux-content label {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
    }
    .swagger-ui .auth-container code {
      background: rgba(220,38,38,0.08) !important;
      border: 1px solid rgba(220,38,38,0.2) !important;
      color: #dc2626 !important;
      font-family: 'JetBrains Mono', monospace !important;
    }

    /* ── Markdown descriptions ────────────────────────────────── */
    .swagger-ui .markdown p,
    .swagger-ui .markdown li,
    .swagger-ui .renderedMarkdown p,
    .swagger-ui .renderedMarkdown li {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 12px !important;
      color: #a8a29e !important;
      line-height: 1.7 !important;
    }
    .swagger-ui .markdown code,
    .swagger-ui .renderedMarkdown code {
      background: rgba(220,38,38,0.08) !important;
      border: 1px solid rgba(220,38,38,0.15) !important;
      color: #dc2626 !important;
      padding: 1px 5px !important;
    }

    /* ── Loading ──────────────────────────────────────────────── */
    .swagger-ui .loading-container { background: #0c0c0c !important; }
    .swagger-ui .loading-container .loading::after { color: #a8a29e !important; }

    /* ── Scrollbar ────────────────────────────────────────────── */
    * { scrollbar-width: thin; scrollbar-color: rgba(250,250,249,0.1) transparent; }
    *::-webkit-scrollbar { width: 6px; height: 6px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: rgba(250,250,249,0.1); }
    *::-webkit-scrollbar-thumb:hover { background: rgba(250,250,249,0.2); }
  `,
});
