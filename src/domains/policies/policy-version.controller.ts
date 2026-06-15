import { Request, Response } from 'express';
import { policyVersionService } from './policy-version.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const policyVersionController = {
  createVersion: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const { name } = req.body;

    const version = await policyVersionService.createVersion(organizationId, id, { name });
    logger.info({ organizationId, policyId: id, versionId: version.id }, 'Policy version created');
    res.status(201).json(version);
  }),

  listVersions: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;

    const versions = await policyVersionService.listVersions(organizationId, id);
    res.status(200).json(versions);
  }),

  getVersion: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id, versionId } = req.params;

    const version = await policyVersionService.getVersion(organizationId, id, versionId);
    if (!version) {
      res.status(404).json({ error: 'Policy version not found' });
      return;
    }

    res.status(200).json(version);
  }),

  restoreVersion: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id, versionId } = req.params;

    const version = await policyVersionService.restoreVersion(organizationId, id, versionId);
    logger.info({ organizationId, policyId: id, versionId, restoredVersionId: version.id }, 'Policy restored from version');
    res.status(200).json(version);
  }),
};

export default policyVersionController;
