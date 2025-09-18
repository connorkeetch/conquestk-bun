import { Router } from 'express'
import { AuthController } from '../controllers/authController'
import { authenticateToken } from '../middleware/auth'
import { authLimiter, loginSlowDown } from '../middleware/rateLimiter'
import { validateAuth } from '../middleware/validation'

const router = Router()
const authController = new AuthController()

router.post('/register', authLimiter, validateAuth, authController.register)
router.post('/login', authLimiter, loginSlowDown, validateAuth, authController.login)
router.post('/logout', authController.logout)
router.get('/me', authenticateToken, authController.getProfile)
router.post('/verify-email/:token', authController.verifyEmail)
router.post('/resend-verification', authLimiter, authController.resendVerification)
router.post('/forgot-password', authLimiter, authController.forgotPassword)
router.post('/reset-password', authLimiter, authController.resetPassword)
router.post('/change-password', authenticateToken, authController.changePassword)
router.put('/settings', authenticateToken, authController.updateSettings)
router.delete('/delete-account', authenticateToken, authController.deleteAccount)

export { router as authRoutes }
