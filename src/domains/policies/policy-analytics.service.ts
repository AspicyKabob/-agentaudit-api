import { prisma } from '../../db/prisma';

export interface AnalyticsWindow {
  start: Date;
  end: Date;
}

export interface PolicyAnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  ruleType?: string;
  severity?: 'warning' | 'critical';
}

interface ViolationDetail {
  ruleId: string;
  policyId?: string;
  name: string;
  ruleType: string;
  severity: string;
  action?: string;
}

export interface PolicyAnalyticsResult {
  policyId: string;
  policyName: string;
  mode: string;
  priority: number;
  window: AnalyticsWindow;
  totalAudits: number;
  totalViolations: number;
  blockCount: number;
  flagCount: number;
  logCount: number;
  ruleBreakdown: Array<{
    ruleId: string;
    ruleName: string;
    ruleType: string;
    severity: string;
    count: number;
  }>;
  agentBreakdown: Array<{
    agentId: string | null;
    agentName: string | null;
    count: number;
  }>;
  dailyTrend: Array<{
    date: string;
    audits: number;
    violations: number;
    blocks: number;
  }>;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function resolveWindow(filters?: { startDate?: Date; endDate?: Date }): AnalyticsWindow {
  const end = filters?.endDate ? new Date(filters.endDate) : new Date();
  const start = filters?.startDate ? new Date(filters.startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const policyAnalyticsService = {
  async getPolicyAnalytics(
    organizationId: string,
    policyId: string,
    filters: PolicyAnalyticsFilters = {}
  ): Promise<PolicyAnalyticsResult | null> {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organizationId },
      include: { agentPolicies: { include: { agent: { select: { id: true, name: true } } } } },
    });

    if (!policy) {
      return null;
    }

    const window = resolveWindow(filters);
    const where: any = {
      organizationId,
      createdAt: { gte: window.start, lte: window.end },
    };

    if (filters.agentId) {
      where.agentId = filters.agentId;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const ruleCounts = new Map<string, { ruleId: string; ruleName: string; ruleType: string; severity: string; count: number }>();
    const agentCounts = new Map<string | null, { agentId: string | null; agentName: string | null; count: number }>();
    const dailyCounts = new Map<string, { date: string; audits: number; violations: number; blocks: number }>();

    let totalAudits = 0;
    let totalViolations = 0;
    let blockCount = 0;
    let flagCount = 0;
    let logCount = 0;

    for (const log of logs) {
      const details = Array.isArray(log.violationDetails) ? (log.violationDetails as unknown as ViolationDetail[]) : [];
      const matching = details.filter(
        (v) =>
          v.policyId === policyId &&
          (!filters.ruleType || v.ruleType === filters.ruleType) &&
          (!filters.severity || v.severity === filters.severity)
      );

      if (matching.length === 0) {
        continue;
      }

      const dateKey = toISODate(log.createdAt);
      const day = dailyCounts.get(dateKey) || { date: dateKey, audits: 0, violations: 0, blocks: 0 };
      day.audits += 1;
      day.violations += matching.length;
      day.blocks += log.enforcementAction === 'block' ? 1 : 0;
      dailyCounts.set(dateKey, day);

      totalAudits += 1;
      totalViolations += matching.length;

      if (log.enforcementAction === 'block') blockCount += 1;
      else if (log.enforcementAction === 'flag') flagCount += 1;
      else if (log.enforcementAction === 'log') logCount += 1;

      for (const v of matching) {
        const key = v.ruleId;
        const existing = ruleCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          ruleCounts.set(key, {
            ruleId: v.ruleId,
            ruleName: v.name,
            ruleType: v.ruleType,
            severity: v.severity,
            count: 1,
          });
        }
      }

      const agentId = log.agentId ?? null;
      const agentName = log.agent?.name ?? null;
      const agentKey = agentId ?? '__none__';
      const agentEntry = agentCounts.get(agentKey) || { agentId, agentName, count: 0 };
      agentEntry.count += 1;
      agentCounts.set(agentKey, agentEntry);
    }

    return {
      policyId: policy.id,
      policyName: policy.name,
      mode: policy.mode,
      priority: policy.priority,
      window,
      totalAudits,
      totalViolations,
      blockCount,
      flagCount,
      logCount,
      ruleBreakdown: Array.from(ruleCounts.values()).sort((a, b) => b.count - a.count),
      agentBreakdown: Array.from(agentCounts.values()).sort((a, b) => b.count - a.count),
      dailyTrend: Array.from(dailyCounts.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  },

  async getOrganizationPolicyAnalytics(
    organizationId: string,
    filters: PolicyAnalyticsFilters = {}
  ): Promise<Array<Pick<PolicyAnalyticsResult, 'policyId' | 'policyName' | 'mode' | 'priority' | 'totalAudits' | 'totalViolations' | 'blockCount' | 'flagCount' | 'logCount'>>> {
    const policies = await prisma.policy.findMany({
      where: { organizationId },
      orderBy: { priority: 'desc' },
    });

    const window = resolveWindow(filters);
    const results = [];

    for (const policy of policies) {
      const summary = await this.getPolicyAnalytics(organizationId, policy.id, filters);
      if (!summary) continue;
      results.push({
        policyId: summary.policyId,
        policyName: summary.policyName,
        mode: summary.mode,
        priority: summary.priority,
        totalAudits: summary.totalAudits,
        totalViolations: summary.totalViolations,
        blockCount: summary.blockCount,
        flagCount: summary.flagCount,
        logCount: summary.logCount,
      });
    }

    return results;
  },
};

export default policyAnalyticsService;
