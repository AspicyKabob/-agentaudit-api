import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgentAudit API',
      version: '1.0.0',
      description: 'Audit \u0026 Compliance API for AI Agents. Track every prompt, decision, and action with real-time compliance monitoring.',
      contact: {
        name: 'AgentAudit Support',
        email: 'support@agentaudit.io',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080/api/v1',
        description: 'Local development server',
      },
      {
        url: 'https://api.agentaudit.io/api/v1',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for dashboard authentication',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication',
        },
      },
    },
  },
  apis: ['./src/domains/**/*.routes.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
export const swaggerUiHandler = swaggerUi.serve;
export const swaggerUiSetup = swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AgentAudit API Documentation',
});
