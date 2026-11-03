import { Prisma } from '@prisma/client';

export function retentionCutoff(days: number, asOf: Date): Date {
  if (![7, 30, 90].includes(days) || !Number.isFinite(asOf.getTime())) {
    throw new Error('Invalid retention period or reference time');
  }
  return new Date(asOf.getTime() - days * 86400000);
}

export function expiredAlertFilter(organizationId: string, cutoff: Date): Prisma.AlertWhereInput {
  return {
    organizationId,
    OR: [
      { auditLog: { is: { organizationId, createdAt: { lt: cutoff } } } },
      { auditLogId: null, createdAt: { lt: cutoff } },
    ],
  };
}
