import request from 'supertest';

describe('production CORS', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const allowedOrigin = 'https://app.agentaudit.example';

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = allowedOrigin;
    jest.resetModules();
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('allows the configured frontend origin', async () => {
    const { createApp } = await import('../../src/app');
    const res = await request(createApp())
      .options('/mcp/v1/schema')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS access to an unapproved origin', async () => {
    const { createApp } = await import('../../src/app');
    const res = await request(createApp())
      .options('/mcp/v1/schema')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-origin']).not.toBe('https://attacker.example');
  });
});
