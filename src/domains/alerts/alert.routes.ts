import { Router } from 'express';
import { alertController } from './alert.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { resolveAlertSchema, alertIdSchema } from './alert.types';
import { validate } from '../../middleware/validate.middleware';

const router = Router();

router.get('/', authenticate, alertController.list);
router.get('/:id', authenticate, validate(alertIdSchema), alertController.get);
router.patch('/:id/resolve', authenticate, validate(resolveAlertSchema), alertController.resolve);

export default router;
