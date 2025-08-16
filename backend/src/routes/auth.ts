import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { validateAuth } from '../middleware/validation';

const router = Router();
const authController = new AuthController();

router.post('/register', validateAuth, authController.register);
router.post('/login', validateAuth, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getProfile);

export { router as authRoutes };