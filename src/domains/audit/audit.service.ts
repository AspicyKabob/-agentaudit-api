import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { SubmitAuditBody, QueryAuditQuery } from './audit.types';
import { logger } from '../../utils/logger';
import { evaluateSentiment } from './sentiment-evaluator';
import { evaluateCustomValidator } from './custom-validator';
import { detectPII } from './pii-detector';
import { alertService } from '../alerts/alert.service';
import { emailService } from '../../services/email.service';

interface QueryOptions {
  action?: string;
  agentId?: string;
  traceId?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
}

const PLAN_QUOTAS: Record<string, number> = {
  free: 5000,
  pro: 50000,
  business: 250000,
  enterprise: Infinity,
};

async function enforceQuota(organizationId: string, requestedCount: number) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, apiUsed: true, apiQuota: true },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  const quota = org.apiQuota || PLAN_QUOTAS[org.plan] || PLAN_QUOTAS.free;
  const remaining = quota - org.apiUsed;

  if (remaining <= 0) {
    throw new Error(`Monthly audit log quota exceeded (${org.apiUsed}/${quota}). Upgrade your plan to continue logging.`);
  }

  if (requestedCount > remaining) {
    throw new Error(`Batch too large. Only ${remaining} logs remaining this month. Upgrade your plan to continue logging.`);
  }
}

export const auditService = {
  async submit(organizationId: string, data: SubmitAuditBody) {
    await enforceQuota(organizationId, 1);

    const flags = await evaluateComplianceRules(organizationId, data);

    const log = await prisma.auditLog.create({
      data: {
        organizationId,
        agentId: data.agentId,
        action: data.action,
        prompt: data.prompt,
        response: data.response,
        metadata: data.metadata ?? Prisma.JsonNull,
        complianceFlags: flags,
        traceId: data.traceId ?? null,
        parentSpanId: data.parentSpanId ?? null,
      },
    });

    // Create alerts for critical flags and deliver webhooks + emails
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { email: true, notifyWebhook: true, notifyEmail: true, notifyMinSeverity: true },
    });
    for (const flag of flags) {
      const severity = flag.startsWith('CRITICAL') ? 'critical' : 'warning';
      const alert = await prisma.alert.create({
        data: {
          organizationId,
          auditLogId: log.id,
          severity,
          message: `Compliance flag triggered: ${flag}`,
          details: { action: data.action, agentId: data.agentId },
        },
      });

      const shouldNotify = severity === 'critical' || org?.notifyMinSeverity === 'warning';

      if (org?.notifyWebhook !== false && shouldNotify) {
        alertService.deliverWebhook(alert).catch((err) => {
          logger.warn({ organizationId, alertId: alert.id, error: err }, 'Webhook delivery failed');
        });
      }

      if (org?.notifyEmail !== false && shouldNotify && org?.email) {
        emailService.sendAlert(org.email, {
          severity,
          message: `Compliance flag triggered: ${flag}`,
          action: data.action,
        }).catch((err) => {
          logger.warn({ organizationId, alertId: alert.id, error: err }, 'Alert email delivery failed');
        });
      }
    }

    // Increment API usage
    await prisma.organization.update({
      where: { id: organizationId },
      data: { apiUsed: { increment: 1 } },
    });

    return log;
  },

  async submitBatch(organizationId: string, entries: SubmitAuditBody[]) {
    await enforceQuota(organizationId, entries.length);

    const results: Array<{ id: string; action: string; complianceFlags: string[]; createdAt: Date | string }> = [];
    let errors = 0;

    // Evaluate compliance and create logs in a single Prisma transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const data of entries) {
        try {
          const flags = await evaluateComplianceRules(organizationId, data);
          const log = await tx.auditLog.create({
            data: {
              organizationId,
              agentId: data.agentId,
              action: data.action,
              prompt: data.prompt,
              response: data.response,
              metadata: data.metadata ?? Prisma.JsonNull,
              complianceFlags: flags,
              traceId: data.traceId ?? null,
              parentSpanId: data.parentSpanId ?? null,
            },
          });
          results.push({
            id: log.id,
            action: log.action,
            complianceFlags: log.complianceFlags,
            createdAt: log.createdAt,
          });

          // Create alerts for critical flags (outside tx to avoid long-lived locks)
          // We handle alert creation after the loop via a fire-and-forget job
        } catch (err) {
          errors += 1;
          logger.warn({ organizationId, error: err }, 'Batch audit log entry failed');
        }
      }
    });

    // Post-transaction: alerts + webhooks + emails (fire-and-forget, do NOT block)
    createBatchAlerts(organizationId, results).catch((err) => {
      logger.warn({ organizationId, error: err }, 'Batch alert creation failed');
    });

    // Increment usage
    await prisma.organization.update({
      where: { id: organizationId },
      data: { apiUsed: { increment: results.length } },
    });

    return { data: results, processed: results.length, errors };
  },

  async query(organizationId: string, options: QueryOptions) {
    const { action, agentId, traceId, startDate, endDate, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (action) where.action = action;
    if (agentId) where.agentId = agentId;
    if (traceId) where.traceId = traceId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { agent: { select: { name: true, type: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async get(organizationId: string, id: string) {
    return prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: { agent: { select: { name: true, type: true } } },
    });
  },

  async exportLogs(organizationId: string, format: string) {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { name: true, type: true } } },
    });

    if (format === 'csv') {
      const headers = ['id', 'action', 'agentId', 'agentName', 'prompt', 'response', 'complianceFlags', 'metadata', 'traceId', 'parentSpanId', 'createdAt'];
      const rows = logs.map((log) => [
        log.id,
        log.action,
        log.agentId || '',
        log.agent?.name || '',
        (log.prompt || '').replace(/\n/g, ' '),
        (log.response || '').replace(/\n/g, ' '),
        log.complianceFlags.join(';'),
        log.metadata ? JSON.stringify(log.metadata).replace(/\n/g, ' ') : '',
        log.traceId || '',
        log.parentSpanId || '',
        log.createdAt.toISOString(),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    return JSON.stringify(logs, null, 2);
  },

  async getTrace(organizationId: string, traceId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId, traceId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: { agent: { select: { name: true, type: true } } },
      }),
      prisma.auditLog.count({ where: { organizationId, traceId } }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getChain(organizationId: string, id: string) {
    const root = await prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: { agent: { select: { name: true, type: true } } },
    });
    if (!root) return null;

    const descendants: typeof root[] = [];
    const queue = [root.id];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await prisma.auditLog.findMany({
        where: { organizationId, parentSpanId: parentId },
        orderBy: { createdAt: 'asc' },
        include: { agent: { select: { name: true, type: true } } },
      });
      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return { root, descendants };
  },
};

async function evaluateComplianceRules(
  organizationId: string,
  data: SubmitAuditBody
): Promise<string[]> {
  const flags: string[] = [];
  const rules = await prisma.complianceRule.findMany({
    where: { organizationId, isActive: true },
  });

  for (const rule of rules) {
    const condition = rule.condition as any;
    let triggered = false;

    switch (rule.ruleType) {
      case 'pii_detect':
        triggered = detectPII(data.prompt || '', condition) || detectPII(data.response || '', condition);
        break;
      case 'keyword_match':
        triggered = checkKeywords(data.prompt || '', condition.keywords) ||
                   checkKeywords(data.response || '', condition.keywords);
        break;
      case 'rate_limit':
        triggered = await checkRateLimit(organizationId, condition.maxRequests, condition.windowMinutes);
        break;
      case 'regex_match':
        triggered = checkRegex(data.prompt || '', condition.pattern) ||
                   checkRegex(data.response || '', condition.pattern);
        break;
      case 'sentiment_analysis':
        triggered = evaluateSentiment(data.prompt || '', condition) ||
                   evaluateSentiment(data.response || '', condition);
        break;
      case 'custom_validator':
        triggered = (await evaluateCustomValidator(data.prompt || '', data.prompt, data.response, condition)) ||
                   (await evaluateCustomValidator(data.response || '', data.prompt, data.response, condition));
        break;
    }

    if (triggered) {
      flags.push(`${rule.severity.toUpperCase()}_${rule.ruleType}_${rule.name}`);
    }
  }

  return flags;
}

function checkKeywords(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()));
}

async function checkRateLimit(
  organizationId: string,
  maxRequests: number,
  windowMinutes: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const count = await prisma.auditLog.count({
    where: {
      organizationId,
      createdAt: { gte: windowStart },
    },
  });
  return count > maxRequests;
}

function checkRegex(text: string, pattern: string): boolean {
  if (!text || !pattern || pattern.length > 500) return false;
  try {
    const regex = new RegExp(pattern);
    return regex.test(text);
  } catch {
    return false;
  }
}

async function createBatchAlerts(
  organizationId: string,
  results: Array<{ id: string; action: string; complianceFlags: string[]; createdAt: Date | string }>
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { email: true, notifyWebhook: true, notifyEmail: true, notifyMinSeverity: true },
  });
  if (!org) return;

  for (const result of results) {
    for (const flag of result.complianceFlags) {
      const severity = flag.startsWith('CRITICAL') ? 'critical' : 'warning';
      const alert = await prisma.alert.create({
        data: {
          organizationId,
          auditLogId: result.id,
          severity,
          message: `Compliance flag triggered: ${flag}`,
          details: { action: result.action },
        },
      });

      const shouldNotify = severity === 'critical' || org.notifyMinSeverity === 'warning';
      if (org.notifyWebhook !== false && shouldNotify) {
        alertService.deliverWebhook(alert).catch((err) => {
          logger.warn({ organizationId, alertId: alert.id, error: err }, 'Webhook delivery failed');
        });
      }
      if (org.notifyEmail !== false && shouldNotify && org.email) {
        emailService.sendAlert(org.email, {
          severity,
          message: `Compliance flag triggered: ${flag}`,
          action: result.action,
        }).catch((err) => {
          logger.warn({ organizationId, alertId: alert.id, error: err }, 'Alert email delivery failed');
        });
      }
    }
  }
}
