import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { safePostJson, validateWebhookUrl } from '../../utils/ssrf';

interface ListFilters {
  isResolved?: boolean;
  severity?: 'warning' | 'critical';
}

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
      include: {
        rule: {
          select: {
            name: true,
            ruleType: true,
          },
        },
      },
    });
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
      logger.info({ alertId: alert.id, statusCode }, 'Webhook delivered');
    } catch (err) {
      logger.warn({ alertId: alert.id, error: (err as Error).message }, 'Webhook delivery failed');
    }
  },
};
