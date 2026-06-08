import { Request, Response } from 'express';
import { complianceService } from './compliance.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const complianceController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const rules = await complianceService.list(organizationId);
    res.status(200).json(rules);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const rule = await complianceService.create(organizationId, req.body);
    logger.info({ organizationId, ruleId: rule.id }, 'Compliance rule created');
    res.status(201).json(rule);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const rule = await complianceService.get(organizationId, id);
    if (!rule) {
      res.status(404).json({ error: 'Compliance rule not found' });
      return;
    }
    res.status(200).json(rule);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const rule = await complianceService.update(organizationId, id, req.body);
    logger.info({ organizationId, ruleId: id }, 'Compliance rule updated');
    res.status(200).json(rule);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    await complianceService.remove(organizationId, id);
    logger.info({ organizationId, ruleId: id }, 'Compliance rule deleted');
    res.status(204).send();
  }),

  // ─── Packs ──────────────────────────────────────────────────────

  listPacks: asyncHandler(async (_req: Request, res: Response) => {
    const packs = complianceService.listPacks();
    res.status(200).json(packs);
  }),

  installPack: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { packId } = req.body;
    const result = await complianceService.installPack(organizationId, packId);
    logger.info({ organizationId, packId, installed: result.length }, 'Pack installed');
    res.status(201).json(result);
  }),

  removePack: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const result = await complianceService.removePack(organizationId, id);
    logger.info({ organizationId, packId: id, deleted: result.deleted }, 'Pack removed');
    res.status(200).json(result);
  }),
};

