import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { safePostJson, validateWebhookUrl } from '../../utils/ssrf';
import { captureException } from '../../utils/observability';

// ── Alert-email rate limiter ──────────────────────────────────────────────────
// Prevents inbox flooding when a noisy rule fires on every log in a burst.
// In-process sliding-window: max MAX_ALERT_EMAILS emails per org per window.
// This is intentionally lightweight (no Redis dependency) and resets on restart,
// which is acceptable — the goal is burst protection, not absolute enforcement.

const MAX_ALERT_EMAILS = 10;
const ALERT_EMAIL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Timestamps of recent alert emails, keyed by organizationId. */
const alertEmailBuckets = new Map<string, number[]>();

/**
 * Returns true if the organization is allowed to send another alert email
 * and records the send. Returns false if the rate limit is exceeded.
 */
export function tryConsumeAlertEmailQuota(organizationId: string): boolean {
  const now = Date.now();
  const cutoff = now - ALERT_EMAIL_WINDOW_MS;

  const timestamps = (alertEmailBuckets.get(organizationId) ?? []).filter(ts => ts > cutoff);
  if (timestamps.length >= MAX_ALERT_EMAILS) {
    logger.warn(
      { organizationId, count: timestamps.length, windowMs: ALERT_EMAIL_WINDOW_MS },
      'Alert email rate limit reached — suppressing this alert email'
    );
    return false;
  }

  timestamps.push(now);
  alertEmailBuckets.set(organizationId, timestamps);
  return true;
}

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
