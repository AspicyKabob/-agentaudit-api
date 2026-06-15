import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { CreateRuleBody, UpdateRuleBody, PACKS, PackId, PACK_IDS } from './compliance.types';
import { policyVersionService } from '../policies/policy-version.service';

async function snapshotPolicyIfRuleChanged(policyId: string | null | undefined, organizationId: string) {
  if (!policyId) return;
  const policy = await prisma.policy.findFirst({ where: { id: policyId, organizationId } });
  if (!policy) return;
  await policyVersionService.createVersion(organizationId, policyId, {
    name: `${policy.name} (auto-saved before rule change)`,
  });
}

export const complianceService = {
  async list(organizationId: string) {
    return prisma.complianceRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { alerts: true },
        },
      },
    });
  },

  async create(organizationId: string, data: CreateRuleBody) {
    if (data.policyId) {
      const policy = await prisma.policy.findFirst({
        where: { id: data.policyId, organizationId },
      });
      if (!policy) {
        throw new Error('Policy not found');
      }
      await snapshotPolicyIfRuleChanged(data.policyId, organizationId);
    }

    return prisma.complianceRule.create({
      data: {
        organizationId,
        policyId: data.policyId ?? null,
        name: data.name,
        ruleType: data.ruleType,
        condition: data.condition,
        severity: data.severity,
        actionOverride: data.actionOverride ?? null,
        packId: data.packId ?? null,
      },
    });
  },

  async get(organizationId: string, id: string) {
    return prisma.complianceRule.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: { alerts: true },
        },
      },
    });
  },

  async update(organizationId: string, id: string, data: UpdateRuleBody) {
    const rule = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!rule) {
      throw new Error('Compliance rule not found');
    }

    await snapshotPolicyIfRuleChanged(rule.policyId, organizationId);

    const updateData: any = {
      name: data.name ?? rule.name,
    };

    if (data.condition !== undefined) {
      updateData.condition = data.condition === null ? Prisma.JsonNull : data.condition;
    }

    if (data.severity !== undefined) {
      updateData.severity = data.severity;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    if (data.actionOverride !== undefined) {
      updateData.actionOverride = data.actionOverride ?? null;
    }

    if (data.policyId !== undefined) {
      if (data.policyId) {
        const policy = await prisma.policy.findFirst({
          where: { id: data.policyId, organizationId },
        });
        if (!policy) {
          throw new Error('Policy not found');
        }
      }
      await snapshotPolicyIfRuleChanged(rule.policyId, organizationId);
      await snapshotPolicyIfRuleChanged(data.policyId, organizationId);
      updateData.policyId = data.policyId ?? null;
    }

    return prisma.complianceRule.update({
      where: { id },
      data: updateData,
    });
  },

  async remove(organizationId: string, id: string) {
    const rule = await prisma.complianceRule.findFirst({
      where: { id, organizationId },
    });

    if (!rule) {
      throw new Error('Compliance rule not found');
    }

    await snapshotPolicyIfRuleChanged(rule.policyId, organizationId);

    if (rule.packId) {
      throw new Error(`This rule belongs to pack ${rule.packId}. Delete the pack instead, or remove packId first.`);
    }

    await prisma.complianceRule.delete({ where: { id } });
  },

  // ─── Pack Operations ─────────────────────────────────────────────

  listPacks() {
    return PACK_IDS.map((id) => {
      const pack = PACKS[id];
      return { id, name: pack.name, description: pack.description, rules: pack.rules.length };
    });
  },

  async installedPacks(organizationId: string) {
    const rows = await prisma.complianceRule.findMany({
      distinct: ['packId'],
      select: { packId: true },
      where: { organizationId, packId: { not: null } },
    });
    return rows.map((r) => {
      const pack = PACKS[r.packId as PackId];
      return {
        id: r.packId,
        name: pack?.name,
        description: pack?.description,
        rules: pack?.rules?.length ?? 0,
      };
    });
  },

  async installPack(organizationId: string, packId: PackId) {
    const pack = PACKS[packId];
    if (!pack) {
      throw new Error(`Unknown pack: ${packId}`);
    }

    const existing = await prisma.complianceRule.findMany({
      where: { organizationId, packId },
    });
    if (existing.length > 0) {
      throw new Error(`Pack ${packId} is already installed.`);
    }

    const created = await prisma.$transaction(
      pack.rules.map((rule) =>
        prisma.complianceRule.create({
          data: {
            organizationId,
            name: rule.name,
            ruleType: rule.ruleType,
            condition: rule.condition as Prisma.InputJsonValue,
            severity: rule.severity,
            packId,
          },
        })
      )
    );
    return created;
  },

  async removePack(organizationId: string, packId: string) {
    const pack = PACKS[packId as PackId];
    if (!pack) {
      throw new Error(`Unknown pack: ${packId}`);
    }

    const { count } = await prisma.complianceRule.deleteMany({
      where: { organizationId, packId },
    });
    return { deleted: count };
  },
};

