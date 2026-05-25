import { prisma } from '../../db/prisma';
import { CreateReportBody } from './report.types';

export const reportService = {
  async list(organizationId: string) {
    return prisma.complianceReport.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        dateRangeStart: true,
        dateRangeEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async create(organizationId: string, data: CreateReportBody) {
    return prisma.complianceReport.create({
      data: {
        organizationId,
        name: data.name,
        format: data.format,
        dateRangeStart: new Date(data.dateRangeStart),
        dateRangeEnd: new Date(data.dateRangeEnd),
        status: 'pending',
      },
    });
  },

  async get(organizationId: string, id: string) {
    return prisma.complianceReport.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        dateRangeStart: true,
        dateRangeEnd: true,
        downloadUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async download(organizationId: string, id: string) {
    const report = await prisma.complianceReport.findFirst({
      where: { id, organizationId, status: 'ready' },
    });

    if (!report) {
      return null;
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: report.dateRangeStart,
          lte: report.dateRangeEnd,
        },
      },
      include: { agent: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (report.format === 'csv') {
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
      return {
        data: [headers.join(','), ...rows.map((r) => r.join(','))].join('\n'),
        contentType: 'text/csv',
        filename: `report-${report.name}.csv`,
      };
    }

    return {
      data: JSON.stringify({
        report: {
          id: report.id,
          name: report.name,
          dateRangeStart: report.dateRangeStart,
          dateRangeEnd: report.dateRangeEnd,
          generatedAt: new Date().toISOString(),
        },
        logs,
      }, null, 2),
      contentType: 'application/json',
      filename: `report-${report.name}.json`,
    };
  },

  async remove(organizationId: string, id: string) {
    const report = await prisma.complianceReport.findFirst({
      where: { id, organizationId },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    await prisma.complianceReport.delete({ where: { id } });
  },
};
