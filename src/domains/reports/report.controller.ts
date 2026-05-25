import { Request, Response } from 'express';
import { reportService } from './report.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const reportController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const reports = await reportService.list(organizationId);
    res.status(200).json(reports);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const report = await reportService.create(organizationId, req.body);
    logger.info({ organizationId, reportId: report.id }, 'Report created');
    res.status(201).json(report);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const report = await reportService.get(organizationId, id);

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.status(200).json(report);
  }),

  download: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const result = await reportService.download(organizationId, id);

    if (!result) {
      res.status(404).json({ error: 'Report not found or not ready' });
      return;
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.data);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    await reportService.remove(organizationId, id);
    logger.info({ organizationId, reportId: id }, 'Report deleted');
    res.status(204).send();
  }),
};
