let mockTime = 0;
jest.mock('node:perf_hooks', () => ({ performance: { now: () => mockTime } }));

const mockDb = {
  retentionJobState: { upsert: jest.fn(), updateMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
const mockTx = {
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  retentionJobState: { update: jest.fn() },
  organization: { findMany: jest.fn() },
  alert: { findMany: jest.fn(), deleteMany: jest.fn() },
  auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
};
jest.mock('../../src/db/prisma', () => ({ prisma: mockDb }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { runRetention } from '../../src/domains/retention/retention.service';
import { retentionCutoff } from '../../src/domains/retention/retention.filters';

const originalSwitch = process.env.RETENTION_DELETE_ENABLED;
let owner: string;
let policy: number | null;
let deletionEnabled: boolean;
let validLease: boolean;

beforeEach(() => {
  jest.resetAllMocks();
  mockTime = 0;
  delete process.env.RETENTION_DELETE_ENABLED;
  policy = 30;
  deletionEnabled = false;
  validLease = true;
  mockDb.retentionJobState.upsert.mockResolvedValue({});
  mockDb.retentionJobState.updateMany.mockResolvedValue({ count: 1 });
  mockDb.$queryRaw.mockImplementation(async (_query: unknown, ...values: unknown[]) => {
    owner = values[0] as string;
    return [{ id: 'audit-retention', dryRunCursor: null, executionCursor: null }];
  });
  mockTx.$queryRaw.mockImplementation(async (query: string[] | { text: string }) => (Array.isArray(query) ? query.join('?') : query.text).includes('RetentionJobState')
    ? [{ leaseOwner: owner, validLease, deletionEnabled }]
    : [{ retentionDays: policy }]);
  mockTx.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
  mockTx.alert.findMany.mockResolvedValue([]);
  mockTx.auditLog.findMany.mockResolvedValue([]);
  mockTx.alert.deleteMany.mockResolvedValue({ count: 0 });
  mockTx.auditLog.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
});

afterEach(() => {
  if (originalSwitch === undefined) delete process.env.RETENTION_DELETE_ENABLED;
  else process.env.RETENTION_DELETE_ENABLED = originalSwitch;
});

it('calculates exact UTC elapsed-day cutoffs and rejects unsupported periods', () => {
  const asOf = new Date('2026-11-03T12:34:56.789Z');
  for (const days of [7, 30, 90]) {
    expect(retentionCutoff(days, asOf).getTime()).toBe(asOf.getTime() - days * 86400000);
  }
  expect(() => retentionCutoff(8, asOf)).toThrow();
});

it('defaults to dry-run and never deletes candidate records', async () => {
  mockTx.alert.findMany.mockResolvedValue([{ id: 'alert-1' }]);
  mockTx.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
  const result = await runRetention({ maxBatches: 1 });
  expect(result).toMatchObject({ dryRun: true, candidateAlerts: 1, candidateAuditLogs: 1, deletedAlerts: 0, deletedAuditLogs: 0 });
  expect(mockTx.alert.deleteMany).not.toHaveBeenCalled();
  expect(mockTx.auditLog.deleteMany).not.toHaveBeenCalled();
});

it('refuses execution when the environment switch is disabled', async () => {
  const result = await runRetention({ dryRun: false });
  expect(result.status).toBe('disabled');
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});

it('refuses execution when the database switch is disabled', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  const result = await runRetention({ dryRun: false });
  expect(result.status).toBe('disabled');
  expect(mockTx.alert.deleteMany).not.toHaveBeenCalled();
  expect(mockTx.auditLog.deleteMany).not.toHaveBeenCalled();
});

it('does not enter a batch when another worker owns the lease', async () => {
  mockDb.$queryRaw.mockResolvedValue([]);
  expect((await runRetention()).status).toBe('locked');
  expect(mockDb.$transaction).not.toHaveBeenCalled();
  expect(mockDb.retentionJobState.updateMany).not.toHaveBeenCalled();
});

it('stops if its lease has expired or been replaced', async () => {
  validLease = false;
  expect((await runRetention()).status).toBe('lease_lost');
  expect(mockTx.auditLog.findMany).not.toHaveBeenCalled();
});

it('skips an organization whose policy changed to indefinite retention', async () => {
  policy = null;
  expect((await runRetention({ maxBatches: 1 })).deletedAuditLogs).toBe(0);
  expect(mockTx.auditLog.findMany).not.toHaveBeenCalled();
  expect(mockTx.alert.findMany).not.toHaveBeenCalled();
});

it('uses a newly changed policy in the next batch', async () => {
  policy = 90;
  await runRetention({ maxBatches: 1 });
  const where = mockTx.auditLog.findMany.mock.calls[0][0].where;
  expect(Date.now() - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(90 * 86400000);
  expect(where.organizationId).toBe('org-1');
});

it('caps combined deletions and removes alerts before orphan-free logs', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  deletionEnabled = true;
  mockTx.alert.findMany.mockResolvedValue([{ id: 'alert-1' }]);
  mockTx.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
  mockTx.alert.deleteMany.mockResolvedValue({ count: 1 });
  mockTx.auditLog.deleteMany.mockResolvedValue({ count: 1 });
  const result = await runRetention({ dryRun: false, batchSize: 2, maxBatches: 1 });
  expect(result).toMatchObject({ status: 'limited', deletedAlerts: 1, deletedAuditLogs: 1, batches: 1 });
  expect(mockTx.alert.findMany.mock.calls[0][0].take).toBe(2);
  expect(mockTx.auditLog.findMany.mock.calls[0][0].take).toBe(1);
  expect(mockTx.auditLog.deleteMany.mock.calls[0][0].where).toMatchObject({
    organizationId: 'org-1', id: { in: ['log-1'] }, alerts: { none: {} },
  });
  expect(mockTx.alert.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mockTx.auditLog.deleteMany.mock.invocationCallOrder[0]);
});

it('does not select logs when alerts consume the entire batch budget', async () => {
  mockTx.alert.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  await runRetention({ batchSize: 2, maxBatches: 1 });
  expect(mockTx.auditLog.findMany).not.toHaveBeenCalled();
});

it('stops promptly when the environment switch is disabled between batches', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  deletionEnabled = true;
  mockTx.alert.findMany.mockImplementation(async () => {
    delete process.env.RETENTION_DELETE_ENABLED;
    return [{ id: 'alert-1' }];
  });
  const result = await runRetention({ dryRun: false, batchSize: 1 });
  expect(result.status).toBe('disabled');
  expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
});

it('retries a transient transaction failure without advancing its cursors', async () => {
  mockDb.$transaction.mockRejectedValueOnce({ code: 'P2034' });
  const result = await runRetention({ maxBatches: 1 });
  expect(result.retries).toBe(1);
  expect(result.status).not.toBe('failed');
  expect(mockDb.$transaction).toHaveBeenCalledTimes(2);
});

it('bounds retries and releases its own lease on failure', async () => {
  mockDb.$transaction.mockRejectedValue({ code: 'P2034' });
  const result = await runRetention();
  expect(result).toMatchObject({ status: 'failed', retries: 2, errorCode: 'P2034' });
  expect(mockDb.$transaction).toHaveBeenCalledTimes(3);
  expect(mockDb.retentionJobState.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'audit-retention', leaseOwner: owner } }));
});

it('does not retry permanent failures or expose raw error messages', async () => {
  mockDb.$transaction.mockRejectedValue(new Error('private database details'));
  const result = await runRetention();
  expect(result).toMatchObject({ status: 'failed', retries: 0, errorCode: 'unexpected_error' });
  expect(JSON.stringify(result)).not.toContain('private database details');
});

it('resumes after the persisted cursor and saves bounded-run progress independently by mode', async () => {
  mockDb.$queryRaw.mockImplementation(async (_query: unknown, ...values: unknown[]) => {
    owner = values[0] as string;
    return [{ id: 'audit-retention', dryRunCursor: 'org-0', executionCursor: 'unrelated-cursor' }];
  });
  mockTx.alert.findMany.mockResolvedValue([{ id: 'alert-1' }]);
  await runRetention({ batchSize: 1, maxBatches: 1 });
  expect(mockTx.organization.findMany.mock.calls[0][0].where.id).toEqual({ gt: 'org-0' });
  expect(mockDb.retentionJobState.updateMany.mock.calls[0][0].data).toMatchObject({ dryRunCursor: 'org-1' });
  expect(mockDb.retentionJobState.updateMany.mock.calls[0][0].data).not.toHaveProperty('executionCursor');
});

it('resets the traversal cursor and records successful completion after reaching the end', async () => {
  mockTx.organization.findMany.mockResolvedValue([]);
  const result = await runRetention();
  expect(result.status).toBe('completed');
  expect(mockDb.retentionJobState.updateMany.mock.calls[0][0].data).toMatchObject({
    dryRunCursor: null, lastSucceededAt: expect.any(Date),
  });
});

it('stops between batches when the database kill switch is disabled', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  deletionEnabled = true;
  mockTx.alert.findMany.mockResolvedValue([{ id: 'a' }]);
  mockTx.alert.deleteMany.mockImplementation(async () => {
    deletionEnabled = false;
    return { count: 1 };
  });
  const result = await runRetention({ dryRun: false, batchSize: 1 });
  expect(result).toMatchObject({ status: 'disabled', batches: 1, deletedAlerts: 1 });
  expect(mockTx.alert.deleteMany).toHaveBeenCalledTimes(1);
});

it('rechecks a policy that changes to indefinite between batches', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  deletionEnabled = true;
  mockTx.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
  mockTx.auditLog.deleteMany.mockImplementation(async () => {
    policy = null;
    return { count: 1 };
  });
  await runRetention({ dryRun: false, batchSize: 1, maxBatches: 2 });
  expect(mockTx.auditLog.findMany).toHaveBeenCalledTimes(1);
  expect(mockTx.auditLog.deleteMany).toHaveBeenCalledTimes(1);
});

it('rolls back a batch if the environment switch changes after alert deletion', async () => {
  process.env.RETENTION_DELETE_ENABLED = 'true';
  deletionEnabled = true;
  mockTx.alert.findMany.mockResolvedValue([{ id: 'a' }]);
  mockTx.alert.deleteMany.mockResolvedValue({ count: 1 });
  mockTx.auditLog.findMany.mockImplementation(async () => {
    delete process.env.RETENTION_DELETE_ENABLED;
    return [{ id: 'log-1' }];
  });
  const result = await runRetention({ dryRun: false, batchSize: 2 });
  expect(result).toMatchObject({ status: 'disabled', batches: 0, deletedAlerts: 0, deletedAuditLogs: 0 });
  expect(mockTx.auditLog.deleteMany).not.toHaveBeenCalled();
});

it('stops launching batches when its time budget expires', async () => {
  mockDb.$queryRaw.mockImplementation(async (_query: unknown, ...values: unknown[]) => {
    owner = values[0] as string;
    mockTime = 101;
    return [{ id: 'audit-retention', dryRunCursor: null, executionCursor: null }];
  });
  const result = await runRetention({ maxDurationMs: 100 });
  expect(result).toMatchObject({ status: 'limited', batches: 0 });
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});

it('reports loss of ownership rather than clearing another workers lease', async () => {
  mockTx.organization.findMany.mockResolvedValue([]);
  mockDb.retentionJobState.updateMany.mockResolvedValue({ count: 0 });
  expect((await runRetention()).status).toBe('lease_lost');
});

it.each([{ batchSize: 0 }, { batchSize: 1001 }, { maxBatches: -1 }, { maxDurationMs: NaN }])('rejects unsafe limits %j', async (options) => {
  await expect(runRetention(options)).rejects.toThrow();
  expect(mockDb.$queryRaw).not.toHaveBeenCalled();
});
