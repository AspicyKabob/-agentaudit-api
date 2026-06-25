import { Request, Response } from 'express';
import { alertService } from './alert.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const alertController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { isResolved, severity } = req.query as { isResolved?: string; severity?: string };
    
    const alerts = await alertService.list(organizationId, {
      isResolved: isResolved === 'true' ? true : isResolved === 'false' ? false : undefined,
      severity: severity as 'warning' | 'critical' | undefined,
    });
    
    res.status(200).json(alerts);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const alert = await alertService.get(organizationId, id);
    res.status(200).json(alert);
  }),

  resolve: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const alert = await alertService.resolve(organizationId, id);
    logger.info({ organizationId, alertId: id }, 'Alert resolved');
    res.status(200).json(alert);
  }),
};
