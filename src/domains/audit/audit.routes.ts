import { Router } from 'express';
import { auditController } from './audit.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticateApiKey } from '../../middleware/apiKey.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { submitAuditSchema, queryAuditSchema, auditIdSchema } from './audit.types';

const router = Router();

// Service-to-service: API key auth
router.post('/', authenticateApiKey, validate(submitAuditSchema), auditController.submit);

// Dashboard: JWT auth
router.get('/', authenticate, validate(queryAuditSchema), auditController.query);
router.get('/export', authenticate, auditController.exportLogs);
router.get('/:id', authenticate, validate(auditIdSchema), auditController.get);

export default router;
