import { Router } from 'express';
import { complianceController } from './compliance.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createRuleSchema, updateRuleSchema, ruleIdSchema } from './compliance.types';

const router = Router();

router.get('/', authenticate, complianceController.list);
router.post('/', authenticate, validate(createRuleSchema), complianceController.create);
router.get('/:id', authenticate, validate(ruleIdSchema), complianceController.get);
router.patch('/:id', authenticate, validate(updateRuleSchema), complianceController.update);
router.delete('/:id', authenticate, validate(ruleIdSchema), complianceController.remove);

export default router;
