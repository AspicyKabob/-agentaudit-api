import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { expiredAlertFilter, retentionCutoff } from './retention.filters';

const JOB_ID = 'audit-retention';
class RetentionDisabled extends Error {}
type RetentionStatus = 'completed' | 'limited' | 'disabled' | 'locked' | 'lease_lost' | 'failed';

type RetentionOptions = {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  maxDurationMs?: number;
};

type Progress = {
  organizationId?: string;
  organizationCursor?: string;
  alertCursor?: string;
  logCursor?: string;
};

type BatchResult = { stop: RetentionStatus } | {
  organizationId: string;
  alertCursor?: string;
  logCursor?: string;
  candidateAlerts: number;
  candidateAuditLogs: number;
  deletedAlerts: number;
  deletedAuditLogs: number;
  finished: boolean;
};

function deletionAllowed(): boolean {
  return process.env.RETENTION_DELETE_ENABLED === 'true';
}

function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'unexpected_error';
}

function isTransient(error: unknown): boolean {
  const code = safeErrorCode(error);
  const databaseCode = (error as { meta?: { code?: string } })?.meta?.code;
  return ['P2034', 'P2024'].includes(code)
    || (code === 'P2010' && ['40001', '40P01', '55P03', '57014'].includes(databaseCode ?? ''));
}

async function processBatch(runId: string, dryRun: boolean, batchSize: number, asOf: Date, progress: Progress): Promise<BatchResult> {
  if (!dryRun && !deletionAllowed()) return { stop: 'disabled' };
  return prisma.$transaction(async (tx): Promise<BatchResult> => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`;
    const [state] = await tx.$queryRaw<Array<{ leaseOwner: string | null; validLease: boolean; deletionEnabled: boolean }>>`
      SELECT "leaseOwner", "deletionEnabled", "leaseExpiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS "validLease"
      FROM "RetentionJobState" WHERE "id" = ${JOB_ID} FOR UPDATE
    `;
    if (!state || state.leaseOwner !== runId || !state.validLease) return { stop: 'lease_lost' };
    if (!dryRun && (!deletionAllowed() || !state.deletionEnabled)) return { stop: 'disabled' };
    await tx.$executeRaw`
      UPDATE "RetentionJobState" SET "leaseExpiresAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 seconds'
      WHERE "id" = ${JOB_ID} AND "leaseOwner" = ${runId}
    `;
    const organizationId = progress.organizationId ?? (await tx.organization.findMany({
      where: {
        retentionDays: { in: [7, 30, 90] },
        ...(progress.organizationCursor ? { id: { gt: progress.organizationCursor } } : {}),
      },
      orderBy: { id: 'asc' }, take: 1, select: { id: true },
    }))[0]?.id;
    if (!organizationId) return { stop: 'completed' };
    const [organization] = await tx.$queryRaw<Array<{ retentionDays: number | null }>>`
      SELECT "retentionDays" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE
    `;
    const empty = {
      organizationId, candidateAlerts: 0, candidateAuditLogs: 0, deletedAlerts: 0, deletedAuditLogs: 0, finished: true,
    };
    if (!organization || organization.retentionDays === null) return empty;
    const cutoff = retentionCutoff(organization.retentionDays, asOf);
    const alertWhere = expiredAlertFilter(organizationId, cutoff);
    const alerts = await tx.alert.findMany({
      where: { ...alertWhere, ...(progress.alertCursor ? { id: { gt: progress.alertCursor } } : {}) },
      orderBy: { id: 'asc' }, take: batchSize, select: { id: true },
    });
    if (!dryRun && !deletionAllowed()) return { stop: 'disabled' };
    const deletedAlerts = !dryRun && alerts.length ? (await tx.alert.deleteMany({
      where: { ...alertWhere, id: { in: alerts.map(alert => alert.id) } },
    })).count : 0;
    const logWhere: Prisma.AuditLogWhereInput = {
      organizationId, createdAt: { lt: cutoff }, ...(!dryRun ? { alerts: { none: {} } } : {}),
    };
    const remaining = batchSize - alerts.length;
    const logs = remaining ? await tx.auditLog.findMany({
      where: { ...logWhere, ...(progress.logCursor ? { id: { gt: progress.logCursor } } : {}) },
      orderBy: { id: 'asc' }, take: remaining, select: { id: true },
    }) : [];
    if (!dryRun && logs.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "AuditLog" WHERE "organizationId" = ${organizationId}
        AND "id" IN (${Prisma.join(logs.map(log => log.id))}) FOR UPDATE
      `);
    }
    if (!dryRun && !deletionAllowed()) throw new RetentionDisabled();
    const deletedAuditLogs = !dryRun && logs.length ? (await tx.auditLog.deleteMany({
      where: { ...logWhere, id: { in: logs.map(log => log.id) } },
    })).count : 0;
    if (!dryRun && !deletionAllowed()) throw new RetentionDisabled();
    return {
      organizationId,
      alertCursor: alerts.at(-1)?.id ?? progress.alertCursor,
      logCursor: logs.at(-1)?.id ?? progress.logCursor,
      candidateAlerts: alerts.length, candidateAuditLogs: logs.length,
      deletedAlerts, deletedAuditLogs, finished: alerts.length + logs.length < batchSize,
    };
  }, { maxWait: 3000, timeout: 10000 });
}

export async function runRetention(options: RetentionOptions = {}) {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 100;
  const maxBatches = options.maxBatches ?? 100;
  const maxDurationMs = options.maxDurationMs ?? 30000;
  if (typeof dryRun !== 'boolean') throw new Error('dryRun must be a boolean');
  for (const [name, value, maximum] of [
    ['batchSize', batchSize, 1000], ['maxBatches', maxBatches, 1000], ['maxDurationMs', maxDurationMs, 300000],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}`);
  }
  const started = performance.now();
  const asOf = new Date();
  const runId = randomUUID();
  const summary = {
    runId, dryRun, asOf: asOf.toISOString(), status: 'completed' as RetentionStatus,
    batches: 0, organizations: 0, candidateAlerts: 0, candidateAuditLogs: 0,
    deletedAlerts: 0, deletedAuditLogs: 0, retries: 0, durationMs: 0, errorCode: null as string | null,
  };
  let acquired = false;
  let progress: Progress = {};
  try {
    if (!dryRun && !deletionAllowed()) {
      summary.status = 'disabled';
      return summary;
    }
    await prisma.retentionJobState.upsert({ where: { id: JOB_ID }, create: { id: JOB_ID }, update: {} });
    const claimed = await prisma.$queryRaw<Array<{ id: string; dryRunCursor: string | null; executionCursor: string | null }>>`
      UPDATE "RetentionJobState" SET "leaseOwner" = ${runId},
      "leaseExpiresAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 seconds', "lastStartedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${JOB_ID} AND ("leaseOwner" IS NULL OR "leaseExpiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
      RETURNING "id", "dryRunCursor", "executionCursor"
    `;
    if (!claimed.length) {
      summary.status = 'locked';
      return summary;
    }
    acquired = true;
    progress.organizationCursor = (dryRun ? claimed[0].dryRunCursor : claimed[0].executionCursor) ?? undefined;
    while (summary.batches < maxBatches && performance.now() - started < maxDurationMs) {
      let result: BatchResult | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (performance.now() - started >= maxDurationMs) break;
        try {
          result = await processBatch(runId, dryRun, batchSize, asOf, progress);
          break;
        } catch (error) {
          if (error instanceof RetentionDisabled) {
            result = { stop: 'disabled' };
            break;
          }
          if (!isTransient(error) || attempt === 2) throw error;
          summary.retries++;
          await sleep(100 * (attempt + 1));
        }
      }
      if (!result) {
        summary.status = 'limited';
        break;
      }
      if ('stop' in result) {
        summary.status = result.stop;
        break;
      }
      summary.batches++;
      if (!progress.organizationId) summary.organizations++;
      summary.candidateAlerts += result.candidateAlerts;
      summary.candidateAuditLogs += result.candidateAuditLogs;
      summary.deletedAlerts += result.deletedAlerts;
      summary.deletedAuditLogs += result.deletedAuditLogs;
      progress = result.finished ? { organizationCursor: result.organizationId } : {
        organizationId: result.organizationId, organizationCursor: progress.organizationCursor,
        alertCursor: result.alertCursor, logCursor: result.logCursor,
      };
      summary.status = 'limited';
    }
    if (summary.batches === 0 && performance.now() - started >= maxDurationMs) summary.status = 'limited';
    return summary;
  } catch (error) {
    summary.status = 'failed';
    summary.errorCode = safeErrorCode(error);
    return summary;
  } finally {
    summary.durationMs = Math.round(performance.now() - started);
    if (acquired) {
      try {
        const released = await prisma.retentionJobState.updateMany({
          where: { id: JOB_ID, leaseOwner: runId },
          data: {
            leaseOwner: null, leaseExpiresAt: null, lastSummary: summary,
            [dryRun ? 'dryRunCursor' : 'executionCursor']: summary.status === 'completed'
              ? null : progress.organizationId ?? progress.organizationCursor ?? null,
            ...(summary.status === 'completed' ? { lastSucceededAt: new Date() } : {}),
          },
        });
        if (released.count === 0) summary.status = 'lease_lost';
      } catch (error) {
        summary.status = 'failed';
        summary.errorCode = safeErrorCode(error);
      }
    }
    if (summary.status === 'failed') logger.error(summary, 'Retention run failed');
    else logger.info(summary, 'Retention run finished');
  }
}
