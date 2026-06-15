import { Router } from 'express';
import { policyController } from './policy.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createPolicySchema, updatePolicySchema, policyIdSchema, clonePackToPolicySchema } from './policy.types';
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
router.get('/:id', authenticate, validate(policyIdSchema), policyController.get);
router.patch('/:id', authenticate, validate(updatePolicySchema), policyController.update);
router.delete('/:id', authenticate, validate(policyIdSchema), policyController.remove);
router.post('/:id/agents', authenticate, validate(agentAssignmentSchema), policyController.assignToAgent);
router.delete('/:id/agents', authenticate, validate(agentAssignmentSchema), policyController.removeFromAgent);

export default router;
