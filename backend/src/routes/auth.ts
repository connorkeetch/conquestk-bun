import { Router } from 'express'
import { AuthController } from '../controllers/authController'
import { authLimiter, loginSlowDown } from '../middleware/rateLimiter'
import { validateAuth } from '../middleware/validation'

const router = Router()
const authController = new AuthController()

router.post('/register', authLimiter as any, validateAuth, authController.register)
router.post('/login', authLimiter as any, loginSlowDown as any, validateAuth, authController.login)
router.post('/logout', authController.logout)
router.get('/me', authController.getProfile)
router.post('/verify-email/:token', authController.verifyEmail)
router.post('/resend-verification', authLimiter as any, authController.resendVerification)
router.post('/forgot-password', authLimiter as any, authController.forgotPassword)
router.post('/reset-password', authLimiter as any, authController.resetPassword)

export { router as authRoutes }
