import { Router } from 'express'
import { AuthController } from '../controllers/authController'
import { authenticateToken } from '../middleware/auth'
import { authLimiter, loginSlowDown } from '../middleware/rateLimiter'
import { validateAuth } from '../middleware/validation'

const router = Router()
const authController = new AuthController()

router.post('/register', authLimiter as unknown, validateAuth, authController.register)
router.post('/login', authLimiter as unknown, loginSlowDown as unknown, validateAuth, authController.login)
router.post('/logout', authController.logout)
router.get('/me', authenticateToken as unknown, authController.getProfile)
router.post('/verify-email/:token', authController.verifyEmail)
router.post('/resend-verification', authLimiter as unknown, authController.resendVerification)
router.post('/forgot-password', authLimiter as unknown, authController.forgotPassword)
router.post('/reset-password', authLimiter as unknown, authController.resetPassword)
router.post('/change-password', authenticateToken as unknown, authController.changePassword)
router.put('/settings', authenticateToken as unknown, authController.updateSettings)
router.delete('/delete-account', authenticateToken as unknown, authController.deleteAccount)

export { router as authRoutes }
