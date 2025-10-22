/**
 * @fileoverview This file defines the Express routes for handling terms of service (ToS) acceptance.
 * It includes endpoints for checking if a user has accepted terms for a feature, accepting terms,
 * retrieving a user's acceptance history, and fetching the content of the terms.
 * @module routes/terms
 */
import type { Request, RequestHandler, Response } from 'express'
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { termsService } from '../services/termsService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()
const authenticateRequest: RequestHandler = async (req, res, next) => {
  try {
    await authenticateToken(req, res, next)
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Route to check if a user has accepted the terms for a specific feature.
 * @name GET /terms/check/:featureType
 * @function
 * @memberof module:routes/terms
 * @param {Request} req - The Express request object, with `featureType` as a URL parameter.
 * @param {Response} res - The Express response object, returning whether the terms have been accepted and the current terms content if not.
 */
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

/**
 * Route for a user to accept the terms for a specific feature.
 * @name POST /terms/accept/:featureType
 * @function
 * @memberof module:routes/terms
 * @param {Request} req - The Express request object, with `featureType` as a URL parameter.
 * @param {Response} res - The Express response object, confirming the acceptance.
 */
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

/**
 * Route to get a user's history of terms acceptance.
 * @name GET /terms/history
 * @function
 * @memberof module:routes/terms
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object, returning the user's acceptance history.
 */
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

/**
 * Route to get the content of the terms for a specific feature.
 * This is a public endpoint.
 * @name GET /terms/content/:featureType
 * @function
 * @memberof module:routes/terms
 * @param {Request} req - The Express request object, with `featureType` as a URL parameter.
 * @param {Response} res - The Express response object, returning the terms content.
 */
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
