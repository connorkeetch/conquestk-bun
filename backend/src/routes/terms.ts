import type { Request, RequestHandler, Response } from 'express'
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import { termsService } from '../services/termsService'
import { logger } from '../utils/logger'

const router = Router()
const authenticateRequest: RequestHandler = (req, res, next) => {
  authenticateToken(req, res, next).catch((error: unknown) => {
    next(error instanceof Error ? error : new Error(String(error)))
  })
}

// Check if user has accepted terms for a feature
router.get(
  '/check/:featureType',
  authenticateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureType } = req.params
      const userId = req.userId || req.user?.id

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const hasAccepted = await termsService.hasAcceptedTerms(userId, featureType)
      const termsContent = termsService.getTermsContent(featureType)

      res.json({
        hasAccepted,
        currentVersion: termsService.getCurrentVersion(featureType),
        termsContent: !hasAccepted ? termsContent : undefined,
      })
    } catch (error: unknown) {
      logger.error('Error checking terms acceptance:', error)
      res.status(500).json({ error: 'Failed to check terms acceptance' })
    }
  },
)

// Accept terms for a feature
router.post(
  '/accept/:featureType',
  authenticateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureType } = req.params
      const userId = req.userId || req.user?.id
      const ipAddress = req.ip
      const userAgent = req.get('user-agent')

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const acceptance = await termsService.acceptTerms(userId, featureType, ipAddress, userAgent)

      res.json({
        success: true,
        acceptance,
      })
    } catch (error: unknown) {
      logger.error('Error accepting terms:', error)
      res.status(500).json({ error: 'Failed to accept terms' })
    }
  },
)

// Get user's terms acceptance history
router.get('/history', authenticateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId || req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const history = await termsService.getUserTermsHistory(userId)
    res.json(history)
  } catch (error: unknown) {
    logger.error('Error fetching terms history:', error)
    res.status(500).json({ error: 'Failed to fetch terms history' })
  }
})

// Get terms content for a feature (public)
router.get('/content/:featureType', (req: Request, res: Response): void => {
  try {
    const { featureType } = req.params
    const content = termsService.getTermsContent(featureType)

    res.json({
      ...content,
      currentVersion: termsService.getCurrentVersion(featureType),
    })
  } catch (error: unknown) {
    logger.error('Error fetching terms content:', error)
    res.status(500).json({ error: 'Failed to fetch terms content' })
  }
})

export default router
