import { errorBody } from '../../utils/errorBody';
import { Request, Response } from 'express';
import { authService } from './auth.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import * as oauth from './oauth.service';

function oauthCallbackUri(provider: string): string {
  return `${config.get('frontendUrl')}/api/v1/auth/oauth/${provider}/callback`;
}

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
      notifyWebhook: req.organization!.notifyWebhook,
      notifyEmail: req.organization!.notifyEmail,
      notifyMinSeverity: req.organization!.notifyMinSeverity,
      retentionDays: req.organization!.retentionDays,
      provider: req.organization!.provider,
      hasPassword: req.organization!.password != null,
    });
  }),

  getRetention: asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ retentionDays: req.organization!.retentionDays, cleanupEnabled: false });
  }),

  previewRetention: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.previewRetention(req.organization!.id, req.body.retentionDays);
    res.status(200).json(result);
  }),

  updateRetention: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { retentionDays, password } = req.body;
    const result = await authService.updateRetention(organizationId, retentionDays, password);
    logger.info({ organizationId, retentionDays }, 'Retention preference updated; cleanup disabled');
    res.status(200).json(result);
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { webhookUrl, notifyWebhook, notifyEmail, notifyMinSeverity } = req.body;

    const validSeverities = ['low', 'medium', 'high', 'warning', 'critical'];
    if (notifyMinSeverity !== undefined && !validSeverities.includes(notifyMinSeverity)) {
      res.status(400).json(errorBody(req, 'notifyMinSeverity must be low, medium, high, warning, or critical', 'bad_request'));
      return;
    }

    const updated = await authService.updateProfile(organizationId, {
      webhookUrl,
      notifyWebhook,
      notifyEmail,
      notifyMinSeverity,
    });
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

  oauthProviders: asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ providers: oauth.enabledProviders() });
  }),

  oauthAuthorize: asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    oauth.assertProviderEnabled(provider);
    const state = oauth.signState();
    res.redirect(oauth.authorizeUrl(provider, oauthCallbackUri(provider), state));
  }),

  oauthCallback: asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    oauth.assertProviderEnabled(provider);
    const frontend = config.get('frontendUrl');
    const fail = (reason: string) => res.redirect(`${frontend}/?oauth_error=${encodeURIComponent(reason)}#oauth`);

    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error) return fail(error);
    if (!code || !state || !oauth.verifyState(state)) return fail('invalid_state');
    const profile = await oauth.fetchProfile(provider, code, oauthCallbackUri(provider));
    const result = await oauth.loginWithProvider(provider, profile);
    logger.info({ organizationId: result.organization.id, provider }, 'Organization logged in via OAuth');
    res.redirect(`${frontend}/?oauth_token=${encodeURIComponent(result.accessToken)}&refresh=${encodeURIComponent(result.refreshToken)}#oauth`);
  }),

  setPassword: asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const result = await oauth.setPassword(req.organization!.id, currentPassword, newPassword);
    logger.info({ organizationId: req.organization!.id }, 'Password set');
    res.status(200).json(result);
  }),

  deleteOrganization: asyncHandler(async (req: Request, res: Response) => {
    const organizationId = req.organization!.id;
    const { password } = req.body;
    await authService.deleteOrganization(organizationId, password);
    logger.info({ organizationId }, 'Organization deleted');
    res.status(204).send();
  }),
};
