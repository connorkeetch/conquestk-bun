import express from 'express'
import { logAdminActivity, requireAdmin, requirePermission } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import MapApprovalService from '../services/mapApprovalService.js'
import {
  MapNotFoundError,
  MapPermissionError,
  mapPermissionService,
} from '../services/mapPermissionService.js'
import { getErrorMessage } from '../utils/errorHelpers.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * This file contains the routes for the map approval workflow.
 * It includes routes for managing map versions, submitting for approval, and admin/moderator actions.
 * All routes in this file are protected by the `authenticateToken` middleware.
 */

const router = express.Router()

// Apply auth middleware to all routes
router.use(authenticateToken)

// Version Management Routes

/**
 * @api {get} /maps/:mapId/versions Get version history for a map
 * @apiName GetMapVersionHistory
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} mapId The ID of the map.
 *
 * @apiSuccess {Object[]} versions The list of map versions.
 */
router.get('/maps/:mapId/versions', async (req, res) => {
  try {
    const { mapId } = req.params
    const userId = req.userId

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    const context = await mapPermissionService.getMapEditorContext(mapId, {
      userId,
      isAdmin: Boolean(req.user?.isAdmin),
    })

    if (!context.exists) {
      res.status(404).json({ message: 'Map not found' })
      return
    }

    if (!context.isAdmin && !context.canEdit) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const versions = await MapApprovalService.getVersionHistory(mapId)
    res.json({ versions })
  } catch (error) {
    handleRouteError(error, req, 'Failed to load map version history', 500, {
      mapId: req.params.mapId,
    })
    res.status(500).json({ message: 'Failed to load version history' })
  }
})

/**
 * @api {get} /versions/:versionId Get specific version details
 * @apiName GetMapVersionDetails
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} versionId The ID of the version.
 *
 * @apiSuccess {Object} version The details of the map version.
 */
router.get('/versions/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params
    const userId = req.userId

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    const version = await MapApprovalService.getVersionById(versionId)

    await mapPermissionService.assertCanEditMap(version.mapId, {
      userId,
      isAdmin: Boolean(req.user?.isAdmin),
    })

    res.json({ version })
  } catch (error) {
    if (error instanceof MapPermissionError) {
      res.status(403).json({ message: error.message })
      return
    }
    const message = getErrorMessage(error)
    if (message === 'Version not found') {
      res.status(404).json({ message })
    } else {
      handleRouteError(error, req, 'Failed to load version details', 500, {
        versionId: req.params.versionId,
      })
      res.status(500).json({ message })
    }
  }
})

/**
 * @api {post} /maps/:mapId/versions Create a new version of a map
 * @apiName CreateMapVersion
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} mapId The ID of the map.
 *
 * @apiSuccess {Object} version The newly created map version.
 */
router.post('/maps/:mapId/versions', async (req, res) => {
  try {
    const { mapId } = req.params
    const userId = req.userId

    const {
      name,
      description,
      imageUrl,
      imageWidth,
      imageHeight,
      tags,
      changelog,
      versionType,
      data,
      territories,
      sectors,
      adjacencies,
    } = req.body ?? {}

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'Version name is required' })
      return
    }

    await mapPermissionService.assertCanEditMap(mapId, {
      userId,
      isAdmin: Boolean(req.user?.isAdmin),
    })

    const version = await MapApprovalService.createVersion(mapId, userId, {
      name,
      description,
      imageUrl,
      imageWidth: typeof imageWidth === 'number' ? imageWidth : undefined,
      imageHeight: typeof imageHeight === 'number' ? imageHeight : undefined,
      tags: Array.isArray(tags)
        ? (tags.filter((tag) => typeof tag === 'string') as string[])
        : undefined,
      changelog,
      versionType,
      data: typeof data === 'object' && data !== null ? data : undefined,
      territories: Array.isArray(territories) ? territories : undefined,
      sectors: Array.isArray(sectors) ? sectors : undefined,
      adjacencies: Array.isArray(adjacencies) ? adjacencies : undefined,
    })

    res.status(201).json({ version })
  } catch (error) {
    if (error instanceof MapPermissionError) {
      res.status(403).json({ message: error.message })
      return
    }
    if (error instanceof MapNotFoundError) {
      res.status(404).json({ message: error.message })
      return
    }
    handleRouteError(error, req, 'Failed to create map version', 500, {
      mapId: req.params.mapId,
    })
    res.status(500).json({ message: 'Failed to create version' })
  }
})

/**
 * @api {put} /versions/:versionId/current Set the current version of a map
 * @apiName SetCurrentMapVersion
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} versionId The ID of the version to set as current.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.put('/versions/:versionId/current', async (req, res) => {
  try {
    const { versionId } = req.params
    const userId = req.userId

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    const version = await MapApprovalService.getVersionById(versionId)

    await mapPermissionService.assertCanEditMap(version.mapId, {
      userId,
      isAdmin: Boolean(req.user?.isAdmin),
    })

    await MapApprovalService.setCurrentVersion(versionId)
    res.json({ message: 'Current version updated' })
  } catch (error) {
    if (error instanceof MapPermissionError) {
      res.status(403).json({ message: error.message })
      return
    }
    if (error instanceof MapNotFoundError) {
      res.status(404).json({ message: error.message })
      return
    }
    handleRouteError(error, req, 'Failed to set current version', 500, {
      versionId: req.params.versionId,
    })
    res.status(500).json({ message: 'Failed to update current version' })
  }
})

// Approval Request Routes

/**
 * @api {post} /versions/:versionId/submit Submit a version for approval
 * @apiName SubmitMapVersionForApproval
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} versionId The ID of the version to submit.
 *
 * @apiSuccess {Object} approvalRequest The created approval request.
 */
router.post('/versions/:versionId/submit', async (req, res) => {
  try {
    const { versionId } = req.params
    const userId = req.userId
    const { submissionNotes } = req.body

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    const version = await MapApprovalService.getVersionById(versionId)

    await mapPermissionService.assertCanEditMap(version.mapId, {
      userId,
      isAdmin: Boolean(req.user?.isAdmin),
    })

    const approvalRequest = await MapApprovalService.submitForApproval(
      versionId,
      userId,
      submissionNotes,
    )

    res.status(201).json({ approvalRequest })
  } catch (error) {
    if (error instanceof MapPermissionError) {
      res.status(403).json({ message: error.message })
      return
    }
    handleRouteError(error, req, 'Failed to submit version for approval', 400, {
      versionId: req.params.versionId,
    })
    res.status(400).json({ message: getErrorMessage(error) })
  }
})

/**
 * @api {get} /approval-requests/:requestId Get approval request details
 * @apiName GetApprovalRequestDetails
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiParam {String} requestId The ID of the approval request.
 *
 * @apiSuccess {Object} approvalRequest The details of the approval request.
 * @apiSuccess {Object[]} reviewResults The results of the reviews for the request.
 */
router.get('/approval-requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params
    const approvalRequest = await MapApprovalService.getApprovalRequestById(requestId)
    const reviewResults = await MapApprovalService.getReviewResults(requestId)

    res.json({ approvalRequest, reviewResults })
  } catch (error) {
    const message = getErrorMessage(error)
    if (message === 'Approval request not found') {
      res.status(404).json({ message })
    } else {
      handleRouteError(error, req, 'Failed to load approval request', 500, {
        requestId: req.params.requestId,
      })
      res.status(500).json({ message })
    }
  }
})

// Admin/Moderator Routes - Require admin permissions

/**
 * @api {get} /approval-requests Get pending approval requests (admin only)
 * @apiName GetPendingApprovalRequests
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiSuccess {Object[]} requests The list of pending approval requests.
 */
router.get(
  '/approval-requests',
  requireAdmin,
  requirePermission('map_approval'),
  async (req, res) => {
    try {
      const requests = await MapApprovalService.getPendingApprovalRequests()
      res.json({ requests })
    } catch (error) {
      handleRouteError(error, req, 'Failed to load approval requests')
      res.status(500).json({ message: 'Failed to load approval requests' })
    }
  },
)

/**
 * @api {put} /approval-requests/:requestId/assign Assign a reviewer to an approval request (admin only)
 * @apiName AssignReviewer
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} requestId The ID of the approval request.
 * @apiBody {String} [moderatorId] The ID of the moderator to assign. Defaults to the current user.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.put(
  '/approval-requests/:requestId/assign',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_assign'),
  async (req, res) => {
    try {
      const { requestId } = req.params
      const { moderatorId } = req.body
      const currentUserId = req.userId

      if (!currentUserId) {
        res.status(401).json({ message: 'Moderator not authenticated' })
        return
      }

      const assignedModeratorId = moderatorId || currentUserId

      await MapApprovalService.assignReviewer(requestId, currentUserId, assignedModeratorId, {
        ipAddress: String(req.ip),
        ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
      })
      res.json({ message: 'Reviewer assigned successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to assign reviewer', 500, {
        requestId: req.params.requestId,
      })
      res.status(500).json({ message: 'Failed to assign reviewer' })
    }
  },
)

/**
 * @api {delete} /approval-requests/:requestId/assign Unassign a reviewer from an approval request (admin only)
 * @apiName UnassignReviewer
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} requestId The ID of the approval request.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.delete(
  '/approval-requests/:requestId/assign',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_unassign'),
  async (req, res) => {
    try {
      const { requestId } = req.params
      const currentUserId = req.userId

      if (!currentUserId) {
        res.status(401).json({ message: 'Moderator not authenticated' })
        return
      }

      await MapApprovalService.unassignReviewer(requestId, currentUserId, {
        ipAddress: String(req.ip),
        ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
      })
      res.json({ message: 'Reviewer unassigned successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to unassign reviewer', 500, {
        requestId: req.params.requestId,
      })
      res.status(500).json({ message: 'Failed to unassign reviewer' })
    }
  },
)

/**
 * @api {get} /review-criteria Get the review criteria (admin only)
 * @apiName GetReviewCriteria
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiSuccess {Object[]} criteria The list of review criteria.
 */
router.get(
  '/review-criteria',
  requireAdmin,
  requirePermission('map_approval'),
  async (req, res) => {
    try {
      const criteria = await MapApprovalService.getReviewCriteria()
      res.json({ criteria })
    } catch (error) {
      handleRouteError(error, req, 'Failed to load review criteria')
      res.status(500).json({ message: 'Failed to load review criteria' })
    }
  },
)

/**
 * @api {post} /approval-requests/:requestId/review Submit review results (admin only)
 * @apiName SubmitReviewResults
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} requestId The ID of the approval request.
 *
 * @apiBody {Object[]} results The review results.
 * @apiBody {String} decision The decision of the review ('approved' or 'rejected').
 * @apiBody {String} [moderatorFeedback] Feedback from the moderator.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.post(
  '/approval-requests/:requestId/review',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_decision'),
  async (req, res) => {
    try {
      const { requestId } = req.params
      const moderatorId = req.userId
      const { results, decision, moderatorFeedback } = req.body

      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' })
        return
      }

      if (!results || !decision) {
        res.status(400).json({ message: 'Review results and decision are required' })
        return
      }

      await MapApprovalService.submitReviewResults(
        requestId,
        moderatorId,
        results,
        decision,
        moderatorFeedback,
        {
          ipAddress: String(req.ip),
          ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        },
      )

      res.json({ message: 'Review submitted successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to submit review results', 500, {
        requestId: req.params.requestId,
      })
      res.status(500).json({ message: 'Failed to submit review results' })
    }
  },
)

/**
 * @api {post} /versions/:versionId/publish Publish an approved version (admin only)
 * @apiName PublishMapVersion
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} versionId The ID of the version to publish.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.post(
  '/versions/:versionId/publish',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_publish'),
  async (req, res) => {
    try {
      const { versionId } = req.params
      const moderatorId = req.userId

      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' })
        return
      }

      await MapApprovalService.publishVersion(versionId, moderatorId, {
        ipAddress: String(req.ip),
        ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
      })
      res.json({ message: 'Version published successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to publish version', 400, {
        versionId: req.params.versionId,
      })
      res.status(400).json({ message: getErrorMessage(error) })
    }
  },
)

/**
 * @api {post} /maps/:mapId/archive Archive a map (admin only)
 * @apiName ArchiveMap
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} mapId The ID of the map to archive.
 * @apiBody {String} reason The reason for archiving the map.
 *
 * @apiSuccess {String} message A confirmation message.
 */
router.post(
  '/maps/:mapId/archive',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_archive'),
  async (req, res) => {
    try {
      const { mapId } = req.params
      const moderatorId = req.userId
      const { reason } = req.body

      if (!moderatorId) {
        res.status(401).json({ message: 'Moderator not authenticated' })
        return
      }

      await MapApprovalService.archiveMap(mapId, moderatorId, reason, {
        ipAddress: String(req.ip),
        ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
      })
      res.json({ message: 'Map archived successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to archive map', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ message: 'Failed to archive map' })
    }
  },
)

/**
 * @api {get} /maps/:mapId/moderation-history Get the moderation history for a map (admin only)
 * @apiName GetMapModerationHistory
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiParam {String} mapId The ID of the map.
 *
 * @apiSuccess {Object[]} history The moderation history for the map.
 */
router.get(
  '/maps/:mapId/moderation-history',
  requireAdmin,
  requirePermission('map_approval'),
  async (req, res) => {
    try {
      const { mapId } = req.params
      const history = await MapApprovalService.getMapModerationHistory(mapId)
      res.json({ history })
    } catch (error) {
      handleRouteError(error, req, 'Failed to load moderation history', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ message: 'Failed to load moderation history' })
    }
  },
)

/**
 * @api {get} /stats/approvals Get approval statistics (admin only)
 * @apiName GetApprovalStats
 * @apiGroup MapApproval
 * @apiPermission admin
 *
 * @apiSuccess {Object} stats The approval statistics.
 */
router.get(
  '/stats/approvals',
  requireAdmin,
  requirePermission('map_approval'),
  async (req, res) => {
    try {
      const stats = await MapApprovalService.getApprovalStats()
      res.json({ stats })
    } catch (error) {
      handleRouteError(error, req, 'Failed to load approval stats')
      res.status(500).json({ message: 'Failed to load approval stats' })
    }
  },
)

// User Permission Routes

/**
 * @api {get} /my-maps Get the current user's maps and their permissions
 * @apiName GetMyMaps
 * @apiGroup MapApproval
 * @apiPermission user
 *
 * @apiSuccess {Object[]} maps The list of the user's maps.
 */
router.get('/my-maps', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    // TODO: Implement getting user's maps with permission levels
    // This would query maps table joined with map_permissions
    res.json({ maps: [] })
  } catch (error) {
    handleRouteError(error, req, 'Failed to load user map permissions')
    res.status(500).json({ message: 'Failed to load user map permissions' })
  }
})

export default router
