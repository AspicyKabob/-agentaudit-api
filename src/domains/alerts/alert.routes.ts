import { Router } from 'express';
import { alertController } from './alert.controller';
import { authenticateEither } from '../../middleware/apiKey.middleware';
import { resolveAlertSchema, alertIdSchema } from './alert.types';
import { validate } from '../../middleware/validate.middleware';

const router = Router();

router.get('/', authenticateEither, alertController.list);
router.get('/:id', authenticateEither, validate(alertIdSchema), alertController.get);
router.patch('/:id/resolve', authenticateEither, validate(resolveAlertSchema), alertController.resolve);

export default router;
