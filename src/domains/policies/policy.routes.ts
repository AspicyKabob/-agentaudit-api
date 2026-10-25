import { Router } from 'express';
import { policyController } from './policy.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticateEither } from '../../middleware/apiKey.middleware';
import { createPolicySchema, updatePolicySchema, policyIdSchema, clonePackToPolicySchema, policyAnalyticsQuerySchema, createVersionSchema, policyVersionIdSchema } from './policy.types';
import { policyAnalyticsController } from './policy-analytics.controller';
import { policyVersionController } from './policy-version.controller';
import { z } from 'zod/v3';

const agentAssignmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    agentId: z.string().uuid(),
  }),
});

const router = Router();

router.get('/', authenticateEither, policyController.list);
router.post('/', authenticateEither, validate(createPolicySchema), policyController.create);
router.post('/clone-pack', authenticateEither, validate(clonePackToPolicySchema), policyController.clonePack);
router.get('/analytics', authenticateEither, validate(policyAnalyticsQuerySchema), policyAnalyticsController.getOrganizationPolicyAnalytics);
router.get('/:id', authenticateEither, validate(policyIdSchema), policyController.get);
router.get('/:id/analytics', authenticateEither, validate(policyAnalyticsQuerySchema), policyAnalyticsController.getPolicyAnalytics);
router.post('/:id/versions', authenticateEither, validate(createVersionSchema), policyVersionController.createVersion);
router.get('/:id/versions', authenticateEither, validate(policyIdSchema), policyVersionController.listVersions);
router.get('/:id/versions/:versionId', authenticateEither, validate(policyVersionIdSchema), policyVersionController.getVersion);
router.post('/:id/versions/:versionId/restore', authenticateEither, validate(policyVersionIdSchema), policyVersionController.restoreVersion);
router.patch('/:id', authenticateEither, validate(updatePolicySchema), policyController.update);
router.delete('/:id', authenticateEither, validate(policyIdSchema), policyController.remove);
router.post('/:id/agents', authenticateEither, validate(agentAssignmentSchema), policyController.assignToAgent);
router.delete('/:id/agents', authenticateEither, validate(agentAssignmentSchema), policyController.removeFromAgent);

export default router;
