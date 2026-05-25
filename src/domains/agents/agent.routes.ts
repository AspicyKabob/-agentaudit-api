import { Router } from 'express';
import { agentController } from './agent.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createAgentSchema, updateAgentSchema, agentIdSchema } from './agent.types';

const router = Router();

router.get('/', authenticate, agentController.list);
router.post('/', authenticate, validate(createAgentSchema), agentController.create);
router.get('/:id', authenticate, validate(agentIdSchema), agentController.get);
router.patch('/:id', authenticate, validate(updateAgentSchema), agentController.update);
router.delete('/:id', authenticate, validate(agentIdSchema), agentController.remove);

export default router;
