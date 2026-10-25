import { Router } from 'express';
import { auditController } from './audit.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticateApiKey } from '../../middleware/apiKey.middleware';
import { authenticateEither } from '../../middleware/apiKey.middleware';
import { singleLimiter, batchLimiter, readLimiter } from '../../middleware/rateLimit.middleware';
import { submitAuditSchema, queryAuditSchema, auditIdSchema, traceAuditSchema, batchAuditSchema } from './audit.types';

const router = Router();

// Service-to-service: API key auth — write paths with higher limits
router.post('/', authenticateApiKey, singleLimiter, validate(submitAuditSchema), auditController.submit);
router.post('/batch', authenticateApiKey, batchLimiter, validate(batchAuditSchema), auditController.submitBatch);

// Dashboard: JWT auth — read-only paths
router.get('/', authenticateEither, readLimiter, validate(queryAuditSchema), auditController.query);
router.get('/export', authenticateEither, readLimiter, auditController.exportLogs);
router.get('/trace/:traceId', authenticateEither, readLimiter, validate(traceAuditSchema), auditController.getTrace);
router.get('/:id/chain', authenticateEither, readLimiter, validate(auditIdSchema), auditController.getChain);
router.get('/:id', authenticateEither, readLimiter, validate(auditIdSchema), auditController.get);

export default router;
