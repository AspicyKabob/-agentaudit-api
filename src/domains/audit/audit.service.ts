import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { SubmitAuditBody, QueryAuditQuery } from './audit.types';
import { logger } from '../../utils/logger';

interface QueryOptions {
  action?: string;
  agentId?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
}

export const auditService = {
  async submit(organizationId: string, data: SubmitAuditBody) {
    // Evaluate compliance rules
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
      },
    });

    // Create alerts for critical flags
    for (const flag of flags) {
      const severity = flag.startsWith('CRITICAL') ? 'critical' : 'warning';
      await prisma.alert.create({
        data: {
          organizationId,
          auditLogId: log.id,
          severity,
          message: `Compliance flag triggered: ${flag}`,
          details: { action: data.action, agentId: data.agentId },
        },
      });
    }

    // Increment API usage
    await prisma.organization.update({
      where: { id: organizationId },
      data: { apiUsed: { increment: 1 } },
    });

    return log;
  },

  async query(organizationId: string, options: QueryOptions) {
    const { action, agentId, startDate, endDate, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (action) where.action = action;
    if (agentId) where.agentId = agentId;
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
      const headers = ['id', 'action', 'agentId', 'agentName', 'prompt', 'response', 'complianceFlags', 'metadata', 'createdAt'];
      const rows = logs.map((log) => [
        log.id,
        log.action,
        log.agentId || '',
        log.agent?.name || '',
        (log.prompt || '').replace(/\n/g, ' '),
        (log.response || '').replace(/\n/g, ' '),
        log.complianceFlags.join(';'),
        log.metadata ? JSON.stringify(log.metadata).replace(/\n/g, ' ') : '',
        log.createdAt.toISOString(),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    return JSON.stringify(logs, null, 2);
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
        triggered = detectPII(data.prompt || '') || detectPII(data.response || '');
        break;
      case 'keyword_match':
        triggered = checkKeywords(data.prompt || '', condition.keywords) ||
                   checkKeywords(data.response || '', condition.keywords);
        break;
      case 'rate_limit':
        triggered = await checkRateLimit(organizationId, condition.maxRequests, condition.windowMinutes);
        break;
    }

    if (triggered) {
      flags.push(`${rule.severity.toUpperCase()}_${rule.ruleType}_${rule.name}`);
    }
  }

  return flags;
}

function detectPII(text: string): boolean {
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b(?:\d[ -]*?){13,16}\b/, // Credit card-ish
    /\b\d{3}-\d{3}-\d{4}\b/, // Phone
  ];
  return piiPatterns.some((pattern) => pattern.test(text));
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
