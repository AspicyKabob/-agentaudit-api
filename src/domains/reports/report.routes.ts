import { Router } from 'express';
import { reportController } from './report.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createReportSchema, reportIdSchema } from './report.types';

const router = Router();

router.get('/', authenticate, reportController.list);
router.post('/', authenticate, validate(createReportSchema), reportController.create);
router.get('/:id', authenticate, validate(reportIdSchema), reportController.get);
router.get('/:id/download', authenticate, validate(reportIdSchema), reportController.download);
router.delete('/:id', authenticate, validate(reportIdSchema), reportController.remove);

export default router;
