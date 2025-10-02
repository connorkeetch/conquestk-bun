import type { Request, RequestHandler, Response } from 'express'
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import { termsService } from '../services/termsService'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()
const authenticateRequest: RequestHandler = async (req, res, next) => {
  try {
    await authenticateToken(req, res, next)
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)))
  }
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
      handleRouteError(error, req, 'Failed to check terms acceptance', 500, {
        featureType: req.params.featureType,
      })
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
      handleRouteError(error, req, 'Failed to accept terms', 500, {
        featureType: req.params.featureType,
      })
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
    handleRouteError(error, req, 'Failed to fetch terms history')
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
    handleRouteError(error, req, 'Failed to fetch terms content', 500, {
      featureType: req.params.featureType,
    })
    res.status(500).json({ error: 'Failed to fetch terms content' })
  }
})

export default router
