import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'AgentAudit API',
    version: '1.0.0',
    description: 'Audit & Compliance API for AI Agents. Track every prompt, decision, and action with real-time compliance monitoring.',
    contact: { name: 'AgentAudit Support', email: 'support@agentaudit.io' },
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
    '/reports/{id}/download': {
      get: {
        tags: ['Reports'],
        summary: 'Download a report as PDF',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
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
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AgentAudit API Documentation',
});
