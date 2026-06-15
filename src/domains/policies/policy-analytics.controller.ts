import { Request, Response } from 'express';
import { policyAnalyticsService } from './policy-analytics.service';
import { asyncHandler } from '../../utils/asyncHandler';

function parseDate(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export const policyAnalyticsController = {
  getPolicyAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const { startDate, endDate, agentId, ruleType, severity } = req.query as Record<string, string | undefined>;

    const result = await policyAnalyticsService.getPolicyAnalytics(organizationId, id, {
      startDate: parseDate(startDate),
      endDate: parseDate(endDate),
      agentId,
      ruleType,
      severity: severity === 'warning' || severity === 'critical' ? severity : undefined,
    });

    if (!result) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    res.status(200).json(result);
  }),

  getOrganizationPolicyAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { startDate, endDate, agentId, ruleType, severity } = req.query as Record<string, string | undefined>;

    const results = await policyAnalyticsService.getOrganizationPolicyAnalytics(organizationId, {
      startDate: parseDate(startDate),
      endDate: parseDate(endDate),
      agentId,
      ruleType,
      severity: severity === 'warning' || severity === 'critical' ? severity : undefined,
    });

    res.status(200).json({ data: results });
  }),
};

export default policyAnalyticsController;
