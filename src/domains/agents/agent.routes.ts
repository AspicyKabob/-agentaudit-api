import { Router } from 'express';
import { agentController } from './agent.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticateEither } from '../../middleware/apiKey.middleware';
import { createAgentSchema, updateAgentSchema, agentIdSchema } from './agent.types';

const router = Router();

router.get('/', authenticateEither, agentController.list);
router.post('/', authenticateEither, validate(createAgentSchema), agentController.create);
router.get('/:id', authenticateEither, validate(agentIdSchema), agentController.get);
router.patch('/:id', authenticateEither, validate(updateAgentSchema), agentController.update);
router.delete('/:id', authenticateEither, validate(agentIdSchema), agentController.remove);

export default router;
