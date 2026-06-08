import { Router } from 'express';
import { complianceController } from './compliance.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { createRuleSchema, updateRuleSchema, ruleIdSchema, installPackSchema, packIdParamSchema } from './compliance.types';

const router = Router();

// ─── Packs must come before /:id to avoid id='packs' shadowing ────
router.get('/packs', authenticate, complianceController.listPacks);
router.get('/packs/installed', authenticate, complianceController.installedPacks);
router.post('/packs', authenticate, validate(installPackSchema), complianceController.installPack);
router.delete('/packs/:id', authenticate, validate(packIdParamSchema), complianceController.removePack);

// ─── Rules ──────────────────────────────────────────────────────
router.get('/', authenticate, complianceController.list);
router.post('/', authenticate, validate(createRuleSchema), complianceController.create);
router.get('/:id', authenticate, validate(ruleIdSchema), complianceController.get);
router.patch('/:id', authenticate, validate(updateRuleSchema), complianceController.update);
router.delete('/:id', authenticate, validate(ruleIdSchema), complianceController.remove);

export default router;

