import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { validateAuth } from '../middleware/validation';
import { authLimiter, loginSlowDown } from '../middleware/rateLimiter';

const router = Router();
const authController = new AuthController();

router.post('/register', authLimiter, validateAuth, authController.register);
router.post('/login', authLimiter, loginSlowDown, validateAuth, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getProfile);

export { router as authRoutes };