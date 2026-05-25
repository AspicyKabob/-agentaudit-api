import { Request, Response } from 'express';
import { agentService } from './agent.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const agentController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const agents = await agentService.list(organizationId);
    res.status(200).json(agents);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const agent = await agentService.create(organizationId, req.body);
    logger.info({ organizationId, agentId: agent.id }, 'Agent created');
    res.status(201).json(agent);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const agent = await agentService.get(organizationId, id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(200).json(agent);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    const agent = await agentService.update(organizationId, id, req.body);
    logger.info({ organizationId, agentId: id }, 'Agent updated');
    res.status(200).json(agent);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { id } = req.params;
    await agentService.remove(organizationId, id);
    logger.info({ organizationId, agentId: id }, 'Agent deleted');
    res.status(204).send();
  }),
};
