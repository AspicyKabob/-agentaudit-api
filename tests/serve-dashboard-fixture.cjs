const express = require('express');
const path = require('node:path');
const app = express();
let retentionDays = null;
app.use(express.json());
app.get('/fixture', (_req, res) => res.type('html').send('<script>localStorage.removeItem("aa_api_base");localStorage.setItem("aa_token","synthetic-fixture-token");location.replace("/dashboard.html");</script>'));
app.get('/api/v1/auth/me', (_req, res) => res.json({
  id: 'synthetic-org', email: 'tester@example.invalid', plan: 'free', apiQuota: 5000, apiUsed: 12,
  retentionDays, notifyWebhook: false, notifyEmail: false, notifyMinSeverity: 'warning',
}));
app.get('/api/v1/auth/retention', (_req, res) => res.json({ retentionDays, cleanupEnabled: false }));
app.post('/api/v1/auth/retention/preview', (req, res) => {
  const days = req.body.retentionDays;
  if (![null, 7, 30, 90].includes(days)) return res.status(400).json({ error: 'Invalid retention period' });
  const asOf = new Date();
  res.json({ retentionDays: days, cleanupEnabled: false, approximate: true,
    auditLogs: days === null ? 0 : 12, alerts: days === null ? 0 : 4,
    asOf, cutoff: days === null ? null : new Date(asOf.getTime() - days * 86400000),
  });
});
app.patch('/api/v1/auth/retention', (req, res) => {
  if (req.body.password !== 'SyntheticPassword123') return res.status(403).json({ error: 'Invalid password', code: 'invalid_password' });
  if (![null, 7, 30, 90].includes(req.body.retentionDays)) return res.status(400).json({ error: 'Invalid retention period' });
  retentionDays = req.body.retentionDays;
  res.json({ retentionDays, cleanupEnabled: false });
});
app.get('/api/v1/billing/subscription', (_req, res) => res.json({ status: 'inactive', plan: 'free' }));
app.get('/api/v1/audit-logs', (_req, res) => res.json({ data: [], pagination: { total: 12 } }));
app.get('/api/v1/*', (_req, res) => res.json([]));
app.use(express.static(path.resolve(__dirname, '../website')));
app.listen(3471, '127.0.0.1', () => console.log('Synthetic dashboard fixture ready at http://127.0.0.1:3471/fixture (no database or production API connection)'));
