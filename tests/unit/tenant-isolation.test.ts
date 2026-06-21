jest.mock('../../src/db/prisma', () => ({
  __esModule: true,
  prisma: {
    $transaction: jest.fn(),
    organization: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    agent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    apiKey: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    complianceRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    complianceReport: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    alert: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    policy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policyVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    agentPolicy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/db/prisma';
import { agentService } from '../../src/domains/agents/agent.service';
import { alertService } from '../../src/domains/alerts/alert.service';
import { auditService } from '../../src/domains/audit/audit.service';
import { authService } from '../../src/domains/auth/auth.service';
import { complianceService } from '../../src/domains/compliance/compliance.service';
import { policyService } from '../../src/domains/policies/policy.service';
import { policyVersionService } from '../../src/domains/policies/policy-version.service';
import { reportService } from '../../src/domains/reports/report.service';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const ORG_A = 'org-a';
const FOREIGN_ID = '00000000-0000-0000-0000-000000000002';

describe('tenant isolation contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes every organization-owned collection query', async () => {
    db.agent.findMany.mockResolvedValue([]);
    db.apiKey.findMany.mockResolvedValue([]);
    db.auditLog.findMany.mockResolvedValue([]);
    db.auditLog.count.mockResolvedValue(0);
    db.complianceRule.findMany.mockResolvedValue([]);
    db.complianceReport.findMany.mockResolvedValue([]);
    db.alert.findMany.mockResolvedValue([]);
    db.policy.findMany.mockResolvedValue([]);

    await agentService.list(ORG_A);
    await authService.listApiKeys(ORG_A);
    await auditService.query(ORG_A, { page: 1, limit: 20 });
    await complianceService.list(ORG_A);
    await reportService.list(ORG_A);
    await alertService.list(ORG_A);
    await policyService.list(ORG_A);

    expect(db.agent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
    expect(db.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A, revokedAt: null } }));
    expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
    expect(db.auditLog.count).toHaveBeenCalledWith({ where: { organizationId: ORG_A } });
    expect(db.complianceRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
    expect(db.complianceReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
    expect(db.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
    expect(db.policy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }));
  });

  it('scopes direct reads by both resource id and organization id', async () => {
    db.agent.findFirst.mockResolvedValue(null);
    db.auditLog.findFirst.mockResolvedValue(null);
    db.complianceRule.findFirst.mockResolvedValue(null);
    db.complianceReport.findFirst.mockResolvedValue(null);
    db.policy.findFirst.mockResolvedValue(null);
    db.policyVersion.findFirst.mockResolvedValue(null);

    await agentService.get(ORG_A, FOREIGN_ID);
    await auditService.get(ORG_A, FOREIGN_ID);
    await complianceService.get(ORG_A, FOREIGN_ID);
    await reportService.get(ORG_A, FOREIGN_ID);
    await policyService.get(ORG_A, FOREIGN_ID);
    await policyVersionService.getVersion(ORG_A, FOREIGN_ID, FOREIGN_ID);

    expect(db.agent.findFirst).toHaveBeenCalledWith({ where: { id: FOREIGN_ID, organizationId: ORG_A } });
    expect(db.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: FOREIGN_ID, organizationId: ORG_A },
    }));
    expect(db.complianceRule.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: FOREIGN_ID, organizationId: ORG_A } }));
    expect(db.complianceReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: FOREIGN_ID, organizationId: ORG_A } }));
    expect(db.policy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: FOREIGN_ID, organizationId: ORG_A } }));
    expect(db.policyVersion.findFirst).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, policyId: FOREIGN_ID, organizationId: ORG_A },
    });
  });

  it('blocks cross-tenant mutations before any write occurs', async () => {
    db.agent.findFirst.mockResolvedValue(null);
    db.apiKey.findFirst.mockResolvedValue(null);
    db.complianceRule.findFirst.mockResolvedValue(null);
    db.complianceReport.findFirst.mockResolvedValue(null);
    db.alert.findFirst.mockResolvedValue(null);
    db.policy.findFirst.mockResolvedValue(null);
    db.agentPolicy.findFirst.mockResolvedValue(null);
    db.policyVersion.findFirst.mockResolvedValue(null);

    await expect(agentService.update(ORG_A, FOREIGN_ID, { name: 'nope' })).rejects.toThrow('Agent not found');
    await expect(agentService.remove(ORG_A, FOREIGN_ID)).rejects.toThrow('Agent not found');
    await expect(authService.revokeApiKey(ORG_A, FOREIGN_ID)).rejects.toThrow('API key not found');
    await expect(complianceService.update(ORG_A, FOREIGN_ID, { name: 'nope' })).rejects.toThrow('Compliance rule not found');
    await expect(complianceService.remove(ORG_A, FOREIGN_ID)).rejects.toThrow('Compliance rule not found');
    await expect(reportService.remove(ORG_A, FOREIGN_ID)).rejects.toThrow('Report not found');
    await expect(alertService.resolve(ORG_A, FOREIGN_ID)).rejects.toThrow('Alert not found');
    await expect(policyService.update(ORG_A, FOREIGN_ID, { name: 'nope' })).rejects.toThrow('Policy not found');
    await expect(policyService.remove(ORG_A, FOREIGN_ID)).rejects.toThrow('Policy not found');
    await expect(policyService.removeFromAgent(ORG_A, FOREIGN_ID, FOREIGN_ID)).rejects.toThrow('Policy assignment not found');
    await expect(policyVersionService.restoreVersion(ORG_A, FOREIGN_ID, FOREIGN_ID)).rejects.toThrow('Policy version not found');

    expect(db.agent.update).not.toHaveBeenCalled();
    expect(db.agent.delete).not.toHaveBeenCalled();
    expect(db.apiKey.update).not.toHaveBeenCalled();
    expect(db.complianceRule.update).not.toHaveBeenCalled();
    expect(db.complianceRule.delete).not.toHaveBeenCalled();
    expect(db.complianceReport.delete).not.toHaveBeenCalled();
    expect(db.alert.update).not.toHaveBeenCalled();
    expect(db.policy.update).not.toHaveBeenCalled();
    expect(db.policy.delete).not.toHaveBeenCalled();
    expect(db.agentPolicy.delete).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects assigning a policy when either resource belongs to another organization', async () => {
    db.policy.findFirst.mockResolvedValue(null);
    db.agent.findFirst.mockResolvedValue({ id: FOREIGN_ID });

    await expect(policyService.assignToAgent(ORG_A, FOREIGN_ID, FOREIGN_ID)).rejects.toThrow('Policy not found');
    expect(db.policy.findFirst).toHaveBeenCalledWith({ where: { id: FOREIGN_ID, organizationId: ORG_A } });
    expect(db.agent.findFirst).toHaveBeenCalledWith({ where: { id: FOREIGN_ID, organizationId: ORG_A } });
    expect(db.agentPolicy.upsert).not.toHaveBeenCalled();
  });

  it('rejects a foreign agent before consuming quota or writing an audit log', async () => {
    db.agent.findMany.mockResolvedValue([]);

    await expect(auditService.submit(ORG_A, {
      agentId: FOREIGN_ID,
      action: 'cross_tenant_attempt',
    })).rejects.toThrow('Agent not found');

    expect(db.agent.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, id: { in: [FOREIGN_ID] } },
      select: { id: true },
    });
    expect(db.organization.findUnique).not.toHaveBeenCalled();
    expect(db.organization.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a batch containing any foreign agent before consuming quota', async () => {
    db.agent.findMany.mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001' }]);

    await expect(auditService.submitBatch(ORG_A, [
      { agentId: '00000000-0000-0000-0000-000000000001', action: 'owned' },
      { agentId: FOREIGN_ID, action: 'foreign' },
    ])).rejects.toThrow('Agent not found');

    expect(db.organization.findUnique).not.toHaveBeenCalled();
    expect(db.organization.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('scopes policy assignments by both agent and policy organization', async () => {
    const ownedAgentId = '00000000-0000-0000-0000-000000000001';
    db.agent.findMany.mockResolvedValue([{ id: ownedAgentId }]);
    db.organization.findUnique
      .mockResolvedValueOnce({ plan: 'free', apiUsed: 0, apiQuota: 5000, usagePeriodStart: new Date() })
      .mockResolvedValueOnce({ notifyWebhook: false, notifyEmail: false });
    db.organization.updateMany.mockResolvedValue({ count: 1 });
    db.agent.findFirst.mockResolvedValue({ type: 'custom' });
    db.agentPolicy.findMany.mockResolvedValue([]);
    db.complianceRule.findMany.mockResolvedValue([]);
    db.auditLog.create.mockResolvedValue({ id: 'log-1', action: 'owned', complianceFlags: [] });

    await auditService.submit(ORG_A, { agentId: ownedAgentId, action: 'owned' });

    expect(db.agentPolicy.findMany).toHaveBeenCalledWith({
      where: {
        agentId: ownedAgentId,
        agent: { organizationId: ORG_A },
        policy: { organizationId: ORG_A },
      },
      select: { policyId: true, policy: { select: { conditions: true } } },
    });
  });
});
