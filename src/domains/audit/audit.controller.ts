import { Request, Response } from 'express';
import { auditService } from './audit.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const auditController = {
  submit: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const log = await auditService.submit(organizationId, req.body);
    logger.info(
      { organizationId, auditLogId: log.id, action: log.action },
      'Audit log submitted'
    );
    res.status(201).json(log);
  }),

  query: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { action, agentId, startDate, endDate, page, limit } = req.query as {
      action?: string;
      agentId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    };

    const result = await auditService.query(organizationId, {
      action,
      agentId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    res.status(200).json(result);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const log = await auditService.get(organizationId, id);

    if (!log) {
      res.status(404).json({ error: 'Audit log not found' });
      return;
    }

    res.status(200).json(log);
  }),

  exportLogs: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { format } = req.query as { format?: string };
    const data = await auditService.exportLogs(organizationId, format || 'json');
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.json"');
    }
    
    res.status(200).send(data);
  }),
};
