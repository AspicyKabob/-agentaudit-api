import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { safePostJson, validateWebhookUrl } from '../../utils/ssrf';
import { captureException } from '../../utils/observability';

interface ListFilters {
  isResolved?: boolean;
  severity?: 'warning' | 'critical';
}

const alertInclude = {
  rule: {
    select: { name: true, ruleType: true },
  },
  auditLog: {
    select: { id: true, action: true, agentId: true, createdAt: true },
  },
} as const;

export const alertService = {
  async list(organizationId: string, filters: ListFilters = {}) {
    const where: any = { organizationId };

    if (filters.isResolved !== undefined) {
      where.isResolved = filters.isResolved;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    return prisma.alert.findMany({
      where,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
      include: alertInclude,
    });
  },

  async get(organizationId: string, id: string) {
    const alert = await prisma.alert.findFirst({
      where: { id, organizationId },
      include: alertInclude,
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    return alert;
  },

  async resolve(organizationId: string, id: string) {
    const alert = await prisma.alert.findFirst({
      where: { id, organizationId },
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    return prisma.alert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  },

  async deliverWebhook(alert: any): Promise<void> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: alert.organizationId },
        select: { webhookUrl: true },
      });

      if (!org?.webhookUrl) return;

      const safety = validateWebhookUrl(org.webhookUrl);
      if (!safety.ok) {
        logger.warn({ alertId: alert.id, reason: safety.reason }, 'Webhook URL rejected (SSRF protection)');
        return;
      }

      const payload = {
        event: 'compliance.violation',
        alert: {
          id: alert.id,
          severity: alert.severity,
          message: alert.message,
          details: alert.details,
          createdAt: alert.createdAt,
        },
      };

      const { statusCode } = await safePostJson(org.webhookUrl, payload, 5000);
      if (statusCode >= 400) {
        logger.warn({ alertId: alert.id, statusCode }, 'Webhook delivery returned error status');
        captureException(new Error(`Webhook responded with ${statusCode}`), {
          alertId: alert.id,
          organizationId: alert.organizationId,
        });
        return;
      }
      logger.info({ alertId: alert.id, statusCode }, 'Webhook delivered');
    } catch (err) {
      logger.warn({ alertId: alert.id, error: (err as Error).message }, 'Webhook delivery failed');
      captureException(err, { alertId: alert.id, organizationId: alert.organizationId });
    }
  },
};
