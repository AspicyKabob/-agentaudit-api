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

    const evaluation = await evaluateComplianceRules(organizationId, data);

    const log = await prisma.auditLog.create({
      data: {
        organizationId,
        agentId: data.agentId,
        action: data.action,
        prompt: data.prompt,
        response: data.response,
        metadata: data.metadata ?? Prisma.JsonNull,
        complianceFlags: evaluation.flags,
        enforcementAction: evaluation.action,
        violationDetails: evaluation.violations.length > 0 ? (evaluation.violations as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        traceId: data.traceId ?? null,
        parentSpanId: data.parentSpanId ?? null,
      },
    });

    // Create alerts for critical flags and deliver webhooks + emails
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { email: true, notifyWebhook: true, notifyEmail: true, notifyMinSeverity: true },
    });
    for (const violation of evaluation.violations) {
      const severity = violation.severity;
      const flag = `${severity.toUpperCase()}_${violation.ruleType}_${violation.name}`;
      const alert = await prisma.alert.create({
        data: {
          organizationId,
          auditLogId: log.id,
          severity,
          message: `Compliance flag triggered: ${flag}`,
          details: { action: data.action, agentId: data.agentId, enforcementAction: violation.action },
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

    const results: Array<{ id: string; action: string; complianceFlags: string[]; enforcementAction: string; createdAt: Date | string }> = [];
    let errors = 0;

    // Evaluate compliance and create logs in a single Prisma transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const data of entries) {
        try {
          const evaluation = await evaluateComplianceRules(organizationId, data);
          const log = await tx.auditLog.create({
            data: {
              organizationId,
              agentId: data.agentId,
              action: data.action,
              prompt: data.prompt,
              response: data.response,
              metadata: data.metadata ?? Prisma.JsonNull,
              complianceFlags: evaluation.flags,
              enforcementAction: evaluation.action,
              violationDetails: evaluation.violations.length > 0 ? (evaluation.violations as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
              traceId: data.traceId ?? null,
              parentSpanId: data.parentSpanId ?? null,
            },
          });
          results.push({
            id: log.id,
            action: log.action,
            complianceFlags: log.complianceFlags,
            enforcementAction: log.enforcementAction,
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

type EnforcementAction = 'allow' | 'block' | 'flag' | 'log';

interface Violation {
  ruleId: string;
  name: string;
  ruleType: string;
  severity: 'warning' | 'critical';
  action: EnforcementAction;
}

interface EvaluationResult {
  action: EnforcementAction;
  flags: string[];
  violations: Violation[];
}

const ACTION_RANK: Record<EnforcementAction, number> = {
  allow: 0,
  log: 1,
  flag: 2,
  block: 3,
};

function strongerAction(a: EnforcementAction, b: EnforcementAction): EnforcementAction {
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b;
}

function resolveAction(action?: string | null): EnforcementAction {
  if (action === 'block' || action === 'flag' || action === 'log') return action;
  return 'flag';
}

interface PolicyConditions {
  timeOfDay?: {
    start: string;
    end: string;
    timezone?: string;
  };
  daysOfWeek?: number[];
  agentTypes?: string[];
  metadata?: Array<{
    key: string;
    operator: 'eq' | 'ne' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
    value: any;
  }>;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function evaluatePolicyConditions(
  conditions: PolicyConditions | null | undefined,
  agentType: string | null | undefined,
  metadata: Record<string, any> | null | undefined,
  now: Date
): boolean {
  if (!conditions) return true;

  if (conditions.timeOfDay) {
    const tz = conditions.timeOfDay.timezone || 'UTC';
    const timeString = now.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const currentMinutes = toMinutes(timeString);
    const startMinutes = toMinutes(conditions.timeOfDay.start);
    const endMinutes = toMinutes(conditions.timeOfDay.end);
    const inWindow = startMinutes <= endMinutes
      ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
      : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    if (!inWindow) return false;
  }

  if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
    const day = now.getDay();
    if (!conditions.daysOfWeek.includes(day)) return false;
  }

  if (conditions.agentTypes && conditions.agentTypes.length > 0) {
    if (!agentType || !conditions.agentTypes.includes(agentType)) return false;
  }

  if (conditions.metadata && conditions.metadata.length > 0) {
    const meta = metadata || {};
    for (const criterion of conditions.metadata) {
      const actual = meta[criterion.key];
      const expected = criterion.value;
      let match = false;
      switch (criterion.operator) {
        case 'eq':
          match = actual === expected;
          break;
        case 'ne':
          match = actual !== expected;
          break;
        case 'contains':
          match = typeof actual === 'string' && actual.includes(String(expected));
          break;
        case 'gt':
          match = typeof actual === 'number' && actual > expected;
          break;
        case 'lt':
          match = typeof actual === 'number' && actual < expected;
          break;
        case 'gte':
          match = typeof actual === 'number' && actual >= expected;
          break;
        case 'lte':
          match = typeof actual === 'number' && actual <= expected;
          break;
      }
      if (!match) return false;
    }
  }

  return true;
}

async function buildRuleScope(
  organizationId: string,
  data: SubmitAuditBody,
  now: Date = new Date()
) {
  const scope: any = { organizationId, isActive: true };

  if (!data.agentId) {
    scope.policyId = null;
    return scope;
  }

  const [agent, assignments] = await Promise.all([
    prisma.agent.findFirst({
      where: { id: data.agentId, organizationId },
      select: { type: true },
    }),
    prisma.agentPolicy.findMany({
      where: { agentId: data.agentId },
      select: { policyId: true, policy: { select: { conditions: true } } },
    }),
  ]);

  const activePolicyIds = assignments
    .filter((a) => evaluatePolicyConditions(a.policy?.conditions as PolicyConditions | null, agent?.type, data.metadata, now))
    .map((a) => a.policyId);

  if (activePolicyIds.length > 0) {
    scope.OR = [{ policyId: null }, { policyId: { in: activePolicyIds } }];
  } else {
    scope.policyId = null;
  }

  return scope;
}

async function evaluateComplianceRules(
  organizationId: string,
  data: SubmitAuditBody
): Promise<EvaluationResult> {
  const violations: Violation[] = [];
  const where = await buildRuleScope(organizationId, data);
  const rules = await prisma.complianceRule.findMany({
    where,
    include: { policy: { select: { mode: true, priority: true } } },
  });

  // Group triggered rules by ruleId so overlapping policies can be resolved.
  const triggeredByRuleId = new Map<string, { rule: typeof rules[number]; actions: EnforcementAction[] }>();

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
      const existing = triggeredByRuleId.get(rule.id);
      const action = resolveAction(rule.actionOverride ?? rule.policy?.mode ?? 'flag');
      if (existing) {
        existing.actions.push(action);
      } else {
        triggeredByRuleId.set(rule.id, { rule, actions: [action] });
      }
    }
  }

  for (const { rule, actions } of triggeredByRuleId.values()) {
    const priorities = rule.policy ? [rule.policy.priority] : [0];
    // Combine priority with action restrictiveness for deterministic resolution.
    // Higher priority wins; on tie, stronger action wins.
    const bestAction = actions
      .map((action, idx) => ({ action, priority: priorities[idx] ?? 0 }))
      .sort((a, b) => (b.priority - a.priority) || (ACTION_RANK[b.action] - ACTION_RANK[a.action]))[0].action;

    const severity = rule.severity as 'warning' | 'critical';
    violations.push({
      ruleId: rule.id,
      name: rule.name,
      ruleType: rule.ruleType,
      severity,
      action: bestAction,
    });
  }

  const flags = violations.map((v) => `${v.severity.toUpperCase()}_${v.ruleType}_${v.name}`);
  const finalAction = violations.reduce(
    (acc, v) => strongerAction(acc, v.action),
    'allow' as EnforcementAction
  );

  return { action: finalAction, flags, violations };
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
  results: Array<{ id: string; action: string; complianceFlags: string[]; enforcementAction: string; createdAt: Date | string }>
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
          details: { action: result.action, enforcementAction: result.enforcementAction },
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
