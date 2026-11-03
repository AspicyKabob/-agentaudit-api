import fs from 'node:fs';
import path from 'node:path';

const mockDb = {
  complianceReport: { findFirst: jest.fn() },
  auditLog: { findMany: jest.fn() },
};
jest.mock('../../src/db/prisma', () => ({ prisma: mockDb }));
import { reportService } from '../../src/domains/reports/report.service';
import { swaggerSpec } from '../../src/utils/swagger';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

beforeEach(() => jest.resetAllMocks());

it('regenerates a saved report from remaining tenant-scoped logs on each download', async () => {
  const report = {
    id: 'saved-report', name: 'Activity', format: 'json',
    dateRangeStart: new Date('2026-01-01T00:00:00Z'), dateRangeEnd: new Date('2026-12-31T23:59:59Z'),
  };
  mockDb.complianceReport.findFirst.mockResolvedValue(report);
  mockDb.auditLog.findMany.mockResolvedValueOnce([{ id: 'synthetic-log' }]).mockResolvedValueOnce([]);
  const before = await reportService.download('tenant-a', report.id);
  const after = await reportService.download('tenant-a', report.id);
  expect(JSON.parse(before!.data as string).logs).toHaveLength(1);
  expect(JSON.parse(after!.data as string).logs).toHaveLength(0);
  expect(mockDb.auditLog.findMany).toHaveBeenCalledTimes(2);
  expect(mockDb.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
    where: { organizationId: 'tenant-a', createdAt: { gte: report.dateRangeStart, lte: report.dateRangeEnd } },
  }));
});

it('does not query logs when a report is not available to the tenant', async () => {
  mockDb.complianceReport.findFirst.mockResolvedValue(null);
  expect(await reportService.download('tenant-b', 'foreign-report')).toBeNull();
  expect(mockDb.auditLog.findMany).not.toHaveBeenCalled();
  expect(mockDb.complianceReport.findFirst).toHaveBeenCalledWith({
    where: { id: 'foreign-report', organizationId: 'tenant-b', status: 'ready' },
  });
});

it.each(['website/index.html', 'website/pricing.html'])('keeps %s plan retention promises consistent and cleanup marked coming soon', file => {
  const content = read(file);
  expect(content.match(/7\/30\/90-day cleanup/g)).toHaveLength(3);
  expect(content).not.toMatch(/(?:1-year|7-year|7-day) retention/);
  expect(content.match(/7\/30\/90-day cleanup <span class="coming-soon-tag">Coming soon/g)).toHaveLength(3);
});

it('publishes the supported retention contract without promising active cleanup or fixed backup expiry', () => {
  const policy = read('website/data-retention.html');
  expect(policy).toContain('7, 30, or 90 days, or until account deletion');
  expect(policy).toContain('Automatic age-based cleanup is currently disabled');
  expect(policy).toContain('no automatic 90-day cleanup job');
  expect(policy).toContain('expire-backups-30d');
  expect(policy).toContain('independently expires backup objects 30 days after creation');
  expect(policy).toContain('deletion-confirmation email');
  expect(policy).not.toContain('After 90 days, these records are removed');
  expect(policy).not.toContain('PostgreSQL backups are retained for up to 30 days');
});

it('documents preview/update endpoints and the actual synchronous report-settings behavior', () => {
  const docs = read('website/docs.html');
  expect(docs).toContain('/api/v1/auth/retention/preview');
  expect(docs).toContain('Every update requires the account password');
  expect(docs).toContain('JWT Bearer authentication, not API-key authentication');
  expect(docs).toContain('there is no asynchronous generation job to poll');
  expect(docs).toContain('Saved reports are not immutable snapshots');
  expect(docs).not.toContain('"status": "pending"');
  expect(docs.match(/id="retention"/g)).toHaveLength(1);
});

it('warns in both report list and creation flow before records can expire', () => {
  const dashboard = read('website/dashboard.html');
  expect(dashboard).toContain('Reports are regenerated from currently retained logs on every download');
  expect(dashboard).toContain('This saves report settings, not a frozen snapshot');
});

it('keeps the interactive OpenAPI reference aligned with the retention API and report formats', () => {
  expect(swaggerSpec.components.schemas.RetentionDays.enum).toEqual([null, 7, 30, 90]);
  expect(swaggerSpec.components.schemas.RetentionDays.nullable).toBe(true);
  expect(swaggerSpec.components.schemas.RetentionPreference.properties.cleanupEnabled.enum).toEqual([false]);
  expect(swaggerSpec.paths['/auth/retention'].get.security).toEqual([{ bearerAuth: [] }]);
  expect(swaggerSpec.paths['/auth/retention/preview'].post.security).toEqual([{ bearerAuth: [] }]);
  const body = swaggerSpec.paths['/auth/retention'].patch.requestBody.content['application/json'].schema;
  expect(body.required).toEqual(['retentionDays', 'password']);
  expect(body.properties.password.writeOnly).toBe(true);
  expect(Object.keys(swaggerSpec.paths['/reports/{id}/download'].get.responses['200'].content))
    .toEqual(['application/json', 'text/csv', 'application/pdf']);
});

it('keeps unverified backup settings and post-restore reconciliation explicit rollout gates', () => {
  const ops = read('docs/operations.md');
  expect(ops).toContain('**Bucket Versioning disabled**');
  expect(ops).toContain('`expire-backups-30d`');
  expect(ops).toContain('expire 30 days after creation');
  expect(ops).toContain('S3 now independently enforces the 30-day limit');
  expect(ops).toContain('agentaudit-backup-2026-11-03T08-51-14Z.sql.gz');
  expect(ops).toContain('**No backup schedule**');
  expect(ops).toContain('2026-08-23 06:31:10.928 UTC');
  expect(ops).toContain('Its presence is not a restore-integrity test');
  expect(ops).toContain('no implemented out-of-backup deletion ledger');
  expect(ops).toContain('Dry-run alone does not remove restored data');
  expect(ops).toContain('real-backup restore drill passed');
  expect(ops).toContain('not managed Railway Postgres');
});
