import { prisma } from '../../db/prisma';

interface ListFilters {
  isResolved?: boolean;
  severity?: 'warning' | 'critical';
}

export const alertService = {
  async list(organizationId: string, filters: ListFilters = {}) {
    const where: any = { organizationId };
    
    if (filters.isResolved !== undefined) {
      where.isResolved = filters.isResolved;
    }
    
    if (filters.severity) {
      where.severity = filters.severity;
    }

    return prisma.alert.findMany({
      where,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        rule: {
          select: {
            name: true,
            ruleType: true,
          },
        },
      },
    });
  },

  async resolve(organizationId: string, id: string) {
    const alert = await prisma.alert.findFirst({
      where: { id, organizationId },
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    return prisma.alert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  },
};
