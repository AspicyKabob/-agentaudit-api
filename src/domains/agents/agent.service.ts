import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { CreateAgentBody, UpdateAgentBody } from './agent.types';
import { getAgentLimitForPlan } from '../billing/plans';

export const agentService = {
  async list(organizationId: string) {
    return prisma.agent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(organizationId: string, data: CreateAgentBody) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    const limit = getAgentLimitForPlan(org?.plan ?? 'free');

    if (limit !== -1) {
      const count = await prisma.agent.count({ where: { organizationId } });
      if (count >= limit) {
        throw Object.assign(
          new Error(`Agent limit reached. Your ${org?.plan ?? 'free'} plan allows up to ${limit} agents. Upgrade to add more.`),
          { statusCode: 403 }
        );
      }
    }

    return prisma.agent.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type,
        description: data.description,
        config: data.config ?? Prisma.JsonNull,
      },
    });
  },

  async get(organizationId: string, id: string) {
    return prisma.agent.findFirst({
      where: { id, organizationId },
    });
  },

  async update(organizationId: string, id: string, data: UpdateAgentBody) {
    const agent = await prisma.agent.findFirst({
      where: { id, organizationId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    const updateData: any = {
      name: data.name ?? agent.name,
    };

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    if (data.config !== undefined) {
      updateData.config = data.config === null ? Prisma.JsonNull : data.config;
    }

    return prisma.agent.update({
      where: { id },
      data: updateData,
    });
  },

  async remove(organizationId: string, id: string) {
    const agent = await prisma.agent.findFirst({
      where: { id, organizationId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    await prisma.agent.delete({ where: { id } });
  },
};
