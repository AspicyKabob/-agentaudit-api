import { Router } from 'express';
import { policyController } from './policy.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createPolicySchema, updatePolicySchema, policyIdSchema, clonePackToPolicySchema, policyAnalyticsQuerySchema, createVersionSchema, policyVersionIdSchema } from './policy.types';
import { policyAnalyticsController } from './policy-analytics.controller';
import { policyVersionController } from './policy-version.controller';
import { z } from 'zod';

const agentAssignmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    agentId: z.string().uuid(),
  }),
});

const router = Router();

router.get('/', authenticate, policyController.list);
router.post('/', authenticate, validate(createPolicySchema), policyController.create);
router.post('/clone-pack', authenticate, validate(clonePackToPolicySchema), policyController.clonePack);
router.get('/analytics', authenticate, validate(policyAnalyticsQuerySchema), policyAnalyticsController.getOrganizationPolicyAnalytics);
router.get('/:id', authenticate, validate(policyIdSchema), policyController.get);
router.get('/:id/analytics', authenticate, validate(policyAnalyticsQuerySchema), policyAnalyticsController.getPolicyAnalytics);
router.post('/:id/versions', authenticate, validate(createVersionSchema), policyVersionController.createVersion);
router.get('/:id/versions', authenticate, validate(policyIdSchema), policyVersionController.listVersions);
router.get('/:id/versions/:versionId', authenticate, validate(policyVersionIdSchema), policyVersionController.getVersion);
router.post('/:id/versions/:versionId/restore', authenticate, validate(policyVersionIdSchema), policyVersionController.restoreVersion);
router.patch('/:id', authenticate, validate(updatePolicySchema), policyController.update);
router.delete('/:id', authenticate, validate(policyIdSchema), policyController.remove);
router.post('/:id/agents', authenticate, validate(agentAssignmentSchema), policyController.assignToAgent);
router.delete('/:id/agents', authenticate, validate(agentAssignmentSchema), policyController.removeFromAgent);

export default router;
