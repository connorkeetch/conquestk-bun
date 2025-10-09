import type { Request, Response } from 'express'
import { Router } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import { body, param, query, validationResult } from 'express-validator'
import { authenticateToken } from '../middleware/auth.js'
import {
  ClanMembershipServiceError,
  clanMembershipService,
} from '../services/clanMembershipService.js'
import { ClanServiceError, clanService } from '../services/clanService.js'
import type {
  ClanCreateRequest,
  ClanListFilters,
  ClanPrivacy,
  ClanRecruitmentStatus,
} from '../types/clans.js'
import type { AuthenticatedRequest } from '../types/express.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()

const validateRequest = (req: Request, res: Response): boolean => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() })
    return true
  }
  return false
}

// Clans are generally available

const handleKnownError = (error: unknown, res: Response): boolean => {
  if (error instanceof ClanServiceError) {
    const status = error.code === 'ALREADY_IN_CLAN' ? 409 : 400
    res.status(status).json({ message: error.message, code: error.code })
    return true
  }

  if (error instanceof ClanMembershipServiceError) {
    const statusMap: Record<string, number> = {
      ALREADY_IN_CLAN: 409,
      APPLICATION_EXISTS: 409,
      NOT_FOUND: 404,
      NOT_IN_CLAN: 403,
      FORBIDDEN: 403,
      CLAN_CLOSED: 403,
      CLAN_NOT_FOUND: 404,
      ALREADY_REVIEWED: 409,
      NOT_ACTIVE: 403,
    }
    const status = statusMap[error.code] ?? 400
    res.status(status).json({ message: error.message, code: error.code })
    return true
  }

  return false
}

// Temporary feature guard shim (always enabled). Replace with real flag if needed.
const ensureFeatureEnabled = async (_req: Request, _res: Response): Promise<boolean> => true

router.get(
  '/',
  [
    query('search').optional().isString().isLength({ max: 64 }),
    query('region').optional().isString().isLength({ max: 32 }),
    query('recruitmentStatus').optional().isIn(['active', 'closed']),
    query('privacy').optional().isIn(['public', 'hidden']),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cursor').optional().isString().isLength({ max: 128 }),
  ],
  async (req: Request, res: Response) => {
    if (validateRequest(req, res)) return

    try {
      // no feature gating

      const filters: ClanListFilters = {
        search: (req.query.search as string | undefined)?.trim() || undefined,
        region: (req.query.region as string | undefined)?.trim() || undefined,
        recruitmentStatus: req.query.recruitmentStatus as ClanRecruitmentStatus | undefined,
        privacy: req.query.privacy as ClanPrivacy | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor as string | undefined,
      }

      const result = await clanService.listClans(filters)
      res.json(result)
    } catch (error) {
      if (handleKnownError(error, res)) {
        return
      }
      handleRouteError(error, req, 'Failed to list clans')
    }
  },
)

router.post(
  '/',
  authenticateToken,
  [
    body('name').isString().isLength({ min: 3, max: 64 }),
    body('tag').isString().isLength({ min: 2, max: 5 }),
    body('motto').optional().isString().isLength({ max: 120 }),
    body('description').optional().isString().isLength({ max: 1024 }),
    body('crestAssetUrl').optional().isString().isURL(),
    body('bannerAssetUrl').optional().isString().isURL(),
    body('recruitmentPolicy').optional().isIn(['open', 'application', 'invite']),
    body('recruitmentStatus').optional().isIn(['active', 'closed']),
    body('privacy').optional().isIn(['public', 'hidden']),
    body('minimumRank').optional().isInt({ min: 0 }),
    body('autoAcceptThresholds').optional().isObject(),
    body('language').optional().isString().isLength({ max: 16 }),
    body('region').optional().isString().isLength({ max: 32 }),
    body('timeZone').optional().isString().isLength({ max: 64 }),
  ],
  async (
    req: AuthenticatedRequest<ParamsDictionary, unknown, ClanCreateRequest>,
    res: Response,
  ) => {
    if (validateRequest(req as Request, res)) return

    try {
      // no feature gating

      const clanRequest: ClanCreateRequest = {
        name: req.body.name,
        tag: req.body.tag,
        motto: req.body.motto,
        description: req.body.description,
        crestAssetUrl: req.body.crestAssetUrl,
        bannerAssetUrl: req.body.bannerAssetUrl,
        recruitmentPolicy: req.body.recruitmentPolicy,
        recruitmentStatus: req.body.recruitmentStatus,
        minimumRank: req.body.minimumRank,
        autoAcceptThresholds: req.body.autoAcceptThresholds,
        language: req.body.language,
        region: req.body.region,
        timeZone: req.body.timeZone,
        privacy: req.body.privacy,
      }

      const clan = await clanService.createClan(req.userId as string, clanRequest)
      res.status(201).json({ clan })
    } catch (error) {
      if (handleKnownError(error, res)) {
        return
      }
      handleRouteError(error, req, 'Failed to create clan')
    }
  },
)

router.get(
  '/:slug',
  [param('slug').isString().isLength({ min: 3, max: 120 })],
  async (req: Request<{ slug: string }>, res: Response) => {
    if (validateRequest(req, res)) return

    try {
      // no feature gating

      const clan = await clanService.getClanBySlug(req.params.slug)
      if (!clan) {
        res.status(404).json({ message: 'Clan not found' })
        return
      }

      res.json({ clan })
    } catch (error) {
      if (handleKnownError(error, res)) {
        return
      }
      handleRouteError(error, req, 'Failed to load clan detail', 500, { slug: req.params.slug })
    }
  },
)

router.post(
  '/:slug/applications',
  authenticateToken,
  [param('slug').isString(), body('message').optional().isString().isLength({ max: 500 })],
  async (
    req: AuthenticatedRequest<{ slug: string }, unknown, { message?: string }>,
    res: Response,
  ) => {
    if (validateRequest(req as Request, res)) return

    try {
      // no feature gating

      const clan = await clanService.getClanBySlug(req.params.slug)
      if (!clan) {
        res.status(404).json({ message: 'Clan not found' })
        return
      }

      const application = await clanMembershipService.applyToClan(
        req.userId as string,
        clan.id,
        req.body.message,
      )

      res.status(201).json({ application })
    } catch (error) {
      if (handleKnownError(error, res)) {
        return
      }
      handleRouteError(error, req, 'Failed to submit clan application', 500, {
        slug: req.params.slug,
        userId: req.userId,
      })
    }
  },
)

router.patch(
  '/:slug/applications/:applicationId',
  authenticateToken,
  [
    param('slug').isString(),
    param('applicationId').isUUID(),
    body('decision').isIn(['accepted', 'rejected']),
  ],
  async (
    req: AuthenticatedRequest<
      { slug: string; applicationId: string },
      unknown,
      { decision: string }
    >,
    res: Response,
  ) => {
    if (validateRequest(req as Request, res)) return

    try {
      if (!(await ensureFeatureEnabled(req as Request, res))) {
        return
      }

      const clan = await clanService.getClanBySlug(req.params.slug)
      if (!clan) {
        res.status(404).json({ message: 'Clan not found' })
        return
      }

      const application = await clanMembershipService.reviewApplication(
        req.userId as string,
        clan.id,
        req.params.applicationId,
        req.body.decision === 'accepted' ? 'accepted' : 'rejected',
      )

      res.json({ application })
    } catch (error) {
      if (handleKnownError(error, res)) {
        return
      }
      handleRouteError(error, req, 'Failed to review clan application', 500, {
        slug: req.params.slug,
        applicationId: req.params.applicationId,
        userId: req.userId,
      })
    }
  },
)

export default router
