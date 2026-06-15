import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';

export interface PolicyVersionSummary {
  id: string;
  policyId: string;
  versionNumber: number;
  name: string;
  description: string | null;
  mode: string;
  priority: number;
  restoredFromId: string | null;
  createdAt: Date;
}

export interface PolicyVersionDetail extends PolicyVersionSummary {
  conditions: any;
  rules: any[];
}

export const policyVersionService = {
  async createVersion(
    organizationId: string,
    policyId: string,
    options: { name?: string; restoredFromId?: string } = {}
  ): Promise<PolicyVersionSummary> {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organizationId },
      include: { rules: true },
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    const latest = await prisma.policyVersion.findFirst({
      where: { policyId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await prisma.policyVersion.create({
      data: {
        policyId,
        organizationId,
        versionNumber,
        name: options.name ?? `${policy.name} v${versionNumber}`,
        description: policy.description,
        mode: policy.mode,
        priority: policy.priority,
        conditions: policy.conditions ?? Prisma.JsonNull,
        rules: (policy.rules ?? []).map((rule) => ({
          id: rule.id,
          name: rule.name,
          ruleType: rule.ruleType,
          condition: rule.condition,
          severity: rule.severity,
          actionOverride: rule.actionOverride,
          isActive: rule.isActive,
          packId: rule.packId,
        })) as Prisma.InputJsonValue,
        restoredFromId: options.restoredFromId ?? null,
      },
    });

    return {
      id: version.id,
      policyId: version.policyId,
      versionNumber: version.versionNumber,
      name: version.name,
      description: version.description,
      mode: version.mode,
      priority: version.priority,
      restoredFromId: version.restoredFromId,
      createdAt: version.createdAt,
    };
  },

  async listVersions(organizationId: string, policyId: string): Promise<PolicyVersionSummary[]> {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organizationId },
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    const versions = await prisma.policyVersion.findMany({
      where: { policyId, organizationId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        policyId: true,
        versionNumber: true,
        name: true,
        description: true,
        mode: true,
        priority: true,
        restoredFromId: true,
        createdAt: true,
      },
    });

    return versions;
  },

  async getVersion(organizationId: string, policyId: string, versionId: string): Promise<PolicyVersionDetail | null> {
    const version = await prisma.policyVersion.findFirst({
      where: { id: versionId, policyId, organizationId },
    });

    if (!version) {
      return null;
    }

    return {
      id: version.id,
      policyId: version.policyId,
      versionNumber: version.versionNumber,
      name: version.name,
      description: version.description,
      mode: version.mode,
      priority: version.priority,
      restoredFromId: version.restoredFromId,
      createdAt: version.createdAt,
      conditions: version.conditions,
      rules: version.rules as any[],
    };
  },

  async restoreVersion(organizationId: string, policyId: string, versionId: string): Promise<PolicyVersionSummary> {
    const version = await prisma.policyVersion.findFirst({
      where: { id: versionId, policyId, organizationId },
    });

    if (!version) {
      throw new Error('Policy version not found');
    }

    const rules = Array.isArray(version.rules) ? version.rules : [];

    await prisma.$transaction(async (tx) => {
      await tx.policy.update({
        where: { id: policyId },
        data: {
          name: version.name,
          description: version.description,
          mode: version.mode,
          priority: version.priority,
          conditions: version.conditions ?? Prisma.JsonNull,
        },
      });

      await tx.complianceRule.deleteMany({ where: { policyId } });

      await Promise.all(
        rules.map((rule: any) =>
          tx.complianceRule.create({
            data: {
              organizationId,
              policyId,
              name: rule.name,
              ruleType: rule.ruleType,
              condition: rule.condition as Prisma.InputJsonValue,
              severity: rule.severity,
              actionOverride: rule.actionOverride ?? null,
              isActive: rule.isActive ?? true,
              packId: rule.packId ?? null,
            },
          })
        )
      );
    });

    return this.createVersion(organizationId, policyId, {
      name: `${version.name} (restored from v${version.versionNumber})`,
      restoredFromId: version.id,
    });
  },
};

export default policyVersionService;
