import { Request, Response } from 'express';
import { authService } from './auth.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    const result = await authService.register(name, email, password);
    logger.info({ organizationId: result.id }, 'Organization registered');
    res.status(201).json(result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    logger.info({ organizationId: result.organization.id }, 'Organization logged in');
    res.status(200).json(result);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      id: req.organization!.id,
      name: req.organization!.name,
      email: req.organization!.email,
      plan: req.organization!.plan,
      apiQuota: req.organization!.apiQuota,
      apiUsed: req.organization!.apiUsed,
      webhookUrl: req.organization!.webhookUrl,
    });
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { webhookUrl } = req.body;
    const updated = await authService.updateProfile(organizationId, { webhookUrl });
    logger.info({ organizationId }, 'Profile updated');
    res.status(200).json(updated);
  }),

  createApiKey: asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.body;
    const organizationId = req.organization!.id;
    const result = await authService.createApiKey(organizationId, name);
    logger.info({ organizationId, apiKeyId: result.id }, 'API key created');
    res.status(201).json(result);
  }),

  listApiKeys: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const keys = await authService.listApiKeys(organizationId);
    res.status(200).json(keys);
  }),

  revokeApiKey: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const organizationId = req.organization!.id;
    await authService.revokeApiKey(organizationId, id);
    logger.info({ organizationId, apiKeyId: id }, 'API key revoked');
    res.status(204).send();
  }),
};
