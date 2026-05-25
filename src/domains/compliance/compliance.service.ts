import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { CreateRuleBody, UpdateRuleBody } from './compliance.types';

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
    return prisma.complianceRule.create({
      data: {
        organizationId,
        name: data.name,
        ruleType: data.ruleType,
        condition: data.condition,
        severity: data.severity,
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

    await prisma.complianceRule.delete({ where: { id } });
  },
};
