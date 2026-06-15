import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { CreatePolicyBody, UpdatePolicyBody, ClonePackToPolicyBody } from './policy.types';
import { PACKS, PackId } from '../compliance/compliance.types';

export const policyService = {
  async list(organizationId: string) {
    return prisma.policy.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rules: true, agentPolicies: true } },
      },
    });
  },

  async create(organizationId: string, data: CreatePolicyBody) {
    return prisma.policy.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        mode: data.mode ?? 'flag',
        priority: data.priority ?? 0,
        sourcePackId: data.sourcePackId ?? null,
      },
    });
  },

  async get(organizationId: string, id: string) {
    return prisma.policy.findFirst({
      where: { id, organizationId },
      include: {
        rules: { orderBy: { createdAt: 'desc' } },
        agentPolicies: { include: { agent: { select: { id: true, name: true, type: true } } } },
      },
    });
  },

  async update(organizationId: string, id: string, data: UpdatePolicyBody) {
    const policy = await prisma.policy.findFirst({
      where: { id, organizationId },
    });
    if (!policy) {
      throw new Error('Policy not found');
    }

    const updateData: any = {
      name: data.name ?? policy.name,
    };

    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.mode !== undefined) {
      updateData.mode = data.mode;
    }
    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    return prisma.policy.update({
      where: { id },
      data: updateData,
    });
  },

  async remove(organizationId: string, id: string) {
    const policy = await prisma.policy.findFirst({
      where: { id, organizationId },
    });
    if (!policy) {
      throw new Error('Policy not found');
    }

    await prisma.policy.delete({ where: { id } });
  },

  async clonePack(organizationId: string, data: ClonePackToPolicyBody) {
    const pack = PACKS[data.packId as PackId];
    if (!pack) {
      throw new Error(`Unknown pack: ${data.packId}`);
    }

    const policy = await prisma.policy.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        sourcePackId: data.packId,
      },
    });

    const rules = await Promise.all(
      pack.rules.map((rule) =>
        prisma.complianceRule.create({
          data: {
            organizationId,
            policyId: policy.id,
            name: rule.name,
            ruleType: rule.ruleType,
            condition: rule.condition as Prisma.InputJsonValue,
            severity: rule.severity,
            packId: data.packId,
          },
        })
      )
    );

    return { ...policy, rules };
  },

  async assignToAgent(organizationId: string, policyId: string, agentId: string) {
    const [policy, agent] = await Promise.all([
      prisma.policy.findFirst({ where: { id: policyId, organizationId } }),
      prisma.agent.findFirst({ where: { id: agentId, organizationId } }),
    ]);

    if (!policy) {
      throw new Error('Policy not found');
    }
    if (!agent) {
      throw new Error('Agent not found');
    }

    return prisma.agentPolicy.upsert({
      where: {
        agentId_policyId: { agentId, policyId },
      },
      create: { agentId, policyId },
      update: {},
    });
  },

  async removeFromAgent(organizationId: string, policyId: string, agentId: string) {
    const agentPolicy = await prisma.agentPolicy.findFirst({
      where: {
        agentId,
        policyId,
        agent: { organizationId },
        policy: { organizationId },
      },
    });

    if (!agentPolicy) {
      throw new Error('Policy assignment not found');
    }

    await prisma.agentPolicy.delete({ where: { id: agentPolicy.id } });
  },
};
