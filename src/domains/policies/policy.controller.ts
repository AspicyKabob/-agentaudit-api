import { Request, Response } from 'express';
import { policyService } from './policy.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const policyController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const policies = await policyService.list(organizationId);
    res.status(200).json(policies);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const policy = await policyService.create(organizationId, req.body);
    logger.info({ organizationId, policyId: policy.id }, 'Policy created');
    res.status(201).json(policy);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const policy = await policyService.get(organizationId, id);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    res.status(200).json(policy);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const policy = await policyService.update(organizationId, id, req.body);
    logger.info({ organizationId, policyId: id }, 'Policy updated');
    res.status(200).json(policy);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    await policyService.remove(organizationId, id);
    logger.info({ organizationId, policyId: id }, 'Policy deleted');
    res.status(204).send();
  }),

  clonePack: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const result = await policyService.clonePack(organizationId, req.body);
    logger.info({ organizationId, policyId: result.id, packId: req.body.packId }, 'Pack cloned to policy');
    res.status(201).json(result);
  }),

  assignToAgent: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const { agentId } = req.body;
    const assignment = await policyService.assignToAgent(organizationId, id, agentId);
    logger.info({ organizationId, policyId: id, agentId }, 'Policy assigned to agent');
    res.status(201).json(assignment);
  }),

  removeFromAgent: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const { agentId } = req.body;
    await policyService.removeFromAgent(organizationId, id, agentId);
    logger.info({ organizationId, policyId: id, agentId }, 'Policy removed from agent');
    res.status(204).send();
  }),
};
