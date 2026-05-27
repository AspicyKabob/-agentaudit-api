import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const app = createApp();

async function setupAuth() {
  await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: 'Test Org',
      email: 'crew@example.com',
      password: 'Password123',
    });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'crew@example.com',
      password: 'Password123',
    });

  return loginRes.body;
}

describe('CrewAI Integration', () => {
  let accessToken: string;
  let apiKey: string;

  beforeEach(async () => {
    const auth = await setupAuth();
    accessToken = auth.accessToken;

    const apiKeyRes = await request(app)
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'CrewAI Test Key' });

    apiKey = apiKeyRes.body.key;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.organization.deleteMany();
  });

  it('should log crew start event', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_crew_start',
        metadata: {
          crew: 'Research Crew',
          agents: ['Researcher', 'Writer'],
          task_count: 3,
          event: 'crew_start',
          integration: 'crewai',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.metadata.crew).toBe('Research Crew');
  });

  it('should log task lifecycle events', async () => {
    // Task start
    const startRes = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_task_start',
        prompt: 'Research AI compliance regulations',
        metadata: {
          crew: 'Research Crew',
          task_id: 'task_001',
          expected_output: 'Summary of regulations',
          event: 'task_start',
        },
      });

    expect(startRes.status).toBe(201);

    // Task end
    const endRes = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_task_end',
        prompt: 'Research AI compliance regulations',
        response: 'Key regulations include GDPR Article 22...',
        metadata: {
          crew: 'Research Crew',
          task_id: 'task_001',
          event: 'task_end',
        },
      });

    expect(endRes.status).toBe(201);
  });

  it('should log agent actions within a crew', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_agent_action',
        prompt: 'Searching web for latest AI news',
        metadata: {
          crew: 'Research Crew',
          agent_role: 'Researcher',
          agent_goal: 'Find latest AI developments',
          event: 'agent_action',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.metadata.agent_role).toBe('Researcher');
  });

  it('should log crew completion with final output', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_crew_end',
        response: 'Final research report: AI compliance requires...',
        metadata: {
          crew: 'Research Crew',
          event: 'crew_end',
        },
      });

    expect(res.status).toBe(201);
  });

  it('should support full crew workflow logging', async () => {
    const workflow = [
      {
        action: 'crewai_crew_start',
        metadata: { crew: 'Analysis Crew', agents: ['Analyst', 'Reviewer'] },
      },
      {
        action: 'crewai_task_start',
        prompt: 'Analyze Q3 sales data',
        metadata: { crew: 'Analysis Crew', task_id: 'analyze_001' },
      },
      {
        action: 'crewai_agent_action',
        prompt: 'Loading sales_data.csv',
        metadata: { crew: 'Analysis Crew', agent_role: 'Analyst' },
      },
      {
        action: 'crewai_task_end',
        response: 'Q3 sales up 23% YoY',
        metadata: { crew: 'Analysis Crew', task_id: 'analyze_001' },
      },
      {
        action: 'crewai_crew_end',
        response: 'Analysis complete. Key finding: 23% growth in Q3.',
        metadata: { crew: 'Analysis Crew' },
      },
    ];

    for (const event of workflow) {
      const res = await request(app)
        .post('/api/v1/audit-logs')
        .set('X-API-Key', apiKey)
        .send(event);

      expect(res.status).toBe(201);
    }

    // Verify workflow logs
    const queryRes = await request(app)
      .get('/api/v1/audit-logs?limit=10')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(queryRes.body.data).toHaveLength(5);
    expect(queryRes.body.data[0].action).toBe('crewai_crew_end'); // Most recent first
  });

  it('should detect PII in crew outputs and flag compliance violations', async () => {
    // Create a PII detection rule
    const ruleRes = await request(app)
      .post('/api/v1/compliance-rules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'SSN Detector',
        ruleType: 'pii_detect',
        condition: {},
        severity: 'critical',
      });

    expect(ruleRes.status).toBe(201);

    // Submit a crew task output that contains an SSN
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set('X-API-Key', apiKey)
      .send({
        action: 'crewai_task_end',
        prompt: 'Summarize user profile',
        response: 'User profile: John Doe, SSN 123-45-6789, lives in NY.',
        metadata: {
          crew: 'Research Crew',
          task_id: 'task_pii_001',
          event: 'task_end',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.complianceFlags).toBeInstanceOf(Array);
    expect(res.body.complianceFlags.length).toBeGreaterThan(0);
    expect(res.body.complianceFlags.some((f: string) => f.includes('pii_detect'))).toBe(true);

    // Verify an alert was created for the violation
    const alertsRes = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.length).toBeGreaterThan(0);
    expect(alertsRes.body[0].severity).toBe('critical');
  });
});
