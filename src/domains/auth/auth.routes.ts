import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import {
  registerSchema,
  loginSchema,
  createApiKeySchema,
  revokeApiKeySchema,
} from './auth.types';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.get('/me', authenticate, authController.me);
router.post('/api-keys', authenticate, validate(createApiKeySchema), authController.createApiKey);
router.get('/api-keys', authenticate, authController.listApiKeys);
router.delete('/api-keys/:id', authenticate, validate(revokeApiKeySchema), authController.revokeApiKey);

export default router;
