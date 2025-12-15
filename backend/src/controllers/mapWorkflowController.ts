import type { Response } from 'express'
import {
  MapNotFoundError,
  MapPermissionError,
  mapPermissionService,
} from '../services/mapPermissionService.js'
import mapWorkflowService from '../services/mapWorkflowService.js'
import type { AuthenticatedRequest } from '../types/express.js'
import type { MapDraft, MapStatus } from '../types/maps.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * Handles requests related to the map creation and review workflow.
 */
export class MapWorkflowController {
  /**
   * Saves a map draft.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async saveDraft(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const draftData = req.body as Partial<MapDraft>

      const draft = await mapWorkflowService.saveDraft(userId, draftData)

      return res.json({
        success: true,
        draft,
      })
    } catch (error: unknown) {
      // Check for quota exceeded error
      if (error instanceof Error && error.message.includes('Quota exceeded')) {
        handleRouteError(error, req, 'Quota exceeded', 429)
        return res.status(429).json({
          error: 'Quota exceeded',
          message: error.message,
        })
      }

      handleRouteError(error, req, 'Failed to save draft')
      return res.status(500).json({
        error: 'Failed to save draft',
        message: 'An error occurred while saving your draft',
      })
    }
  }

  /**
   * Gets the drafts for the currently authenticated user.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getUserDrafts(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const drafts = await mapWorkflowService.getUserDrafts(userId)

      return res.json({
        success: true,
        drafts,
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch drafts')
      return res.status(500).json({
        error: 'Failed to fetch drafts',
        message: 'An error occurred while fetching your drafts',
      })
    }
  }

  /**
   * Gets a specific draft by its ID.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getDraft(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const { draftId } = req.params
      const draft = await mapWorkflowService.getDraftById(draftId, userId)

      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' })
      }

      return res.json({ success: true, draft })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch draft', 500, {
        draftId: req.params.draftId,
      })
      return res.status(500).json({
        error: 'Failed to fetch draft',
        message: 'An error occurred while loading the draft',
      })
    }
  }

  /**
   * Publishes a draft, creating a new map from it.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async publishDraft(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const { draftId } = req.params
      const map = await mapWorkflowService.publishDraft(draftId, userId)

      return res.json({ success: true, map })
    } catch (error: unknown) {
      // Check for PostgreSQL duplicate key violation (unique constraint)
      const pgError = error as { code?: string; constraint?: string; message?: string }
      if (pgError.code === '23505') {
        const isDuplicateName = pgError.constraint === 'maps_name_key'
        handleRouteError(error, req, 'Duplicate map name', 409, {
          draftId: req.params.draftId,
        })
        return res.status(409).json({
          error: 'Duplicate map name',
          message: isDuplicateName
            ? 'A map with this name already exists. Please choose a different name.'
            : 'This map conflicts with an existing entry. Please try again with different details.',
        })
      }

      // Check for other known errors
      if (error instanceof Error) {
        const message = error.message
        if (message.includes('Draft not found')) {
          return res.status(404).json({
            error: 'Draft not found',
            message: 'The draft could not be found or you do not have access to it.',
          })
        }
        if (message.includes('Quota exceeded')) {
          return res.status(429).json({
            error: 'Quota exceeded',
            message,
          })
        }
      }

      handleRouteError(error, req, 'Failed to publish draft', 500, {
        draftId: req.params.draftId,
      })
      return res.status(500).json({
        error: 'Failed to publish draft',
        message: 'An error occurred while publishing your map',
      })
    }
  }

  /**
   * Submits a map for review.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async submitForReview(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params

      await mapWorkflowService.submitForReview(mapId, userId, {
        isAdmin: Boolean(req.user?.isAdmin),
      })

      return res.json({
        success: true,
        message: 'Map submitted for review successfully',
      })
    } catch (error: unknown) {
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to submit map for review', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to submit map',
        message: 'An error occurred while submitting your map for review',
      })
    }
  }

  /**
   * Gets a list of maps that are pending review. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getPendingReviews(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const reviews = await mapWorkflowService.getPendingReviews()

      return res.json({
        success: true,
        reviews,
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch pending reviews')
      return res.status(500).json({
        error: 'Failed to fetch reviews',
        message: 'An error occurred while fetching pending reviews',
      })
    }
  }

  /**
   * Approves a map. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async approveMap(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params
      const { notes } = req.body as { notes?: string }

      await mapWorkflowService.approveMap(mapId, adminId, {
        ...(notes ? { notes } : {}),
        auditContext: {
          ipAddress: String(req.ip),
          ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        },
      })

      return res.json({
        success: true,
        message: 'Map approved successfully',
      })
    } catch (error: unknown) {
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to approve map', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to approve map',
        message: 'An error occurred while approving the map',
      })
    }
  }

  /**
   * Rejects a map. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async rejectMap(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params
      const { reason } = req.body as { reason?: string }

      if (!reason) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Rejection reason is required',
        })
      }

      await mapWorkflowService.rejectMap(mapId, adminId, {
        reason,
        auditContext: {
          ipAddress: String(req.ip),
          ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        },
      })

      return res.json({
        success: true,
        message: 'Map rejected',
      })
    } catch (error: unknown) {
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to reject map', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to reject map',
        message: 'An error occurred while rejecting the map',
      })
    }
  }

  /**
   * Gets admin notifications for the map workflow.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getAdminNotifications(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { unreadOnly } = req.query

      const notifications = await mapWorkflowService.getAdminNotifications(
        adminId,
        unreadOnly === 'true',
      )

      return res.json({
        success: true,
        notifications,
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch map workflow notifications')
      return res.status(500).json({
        error: 'Failed to fetch notifications',
        message: 'An error occurred while fetching notifications',
      })
    }
  }

  /**
   * Marks a notification as read.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async markNotificationRead(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { notificationId } = req.params

      await mapWorkflowService.markNotificationRead(notificationId, adminId)

      return res.json({
        success: true,
        message: 'Notification marked as read',
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to update notification', 500, {
        notificationId: req.params.notificationId,
      })
      return res.status(500).json({
        error: 'Failed to update notification',
        message: 'An error occurred while updating the notification',
      })
    }
  }

  /**
   * Archives a map. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async archiveMap(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params

      await mapWorkflowService.archiveMap(mapId, adminId, {
        auditContext: {
          ipAddress: String(req.ip),
          ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        },
      })

      return res.json({
        success: true,
        message: 'Map archived successfully',
      })
    } catch (error: unknown) {
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to archive map', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to archive map',
        message: 'An error occurred while archiving the map',
      })
    }
  }

  /**
   * Toggles the featured status of a map. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async toggleFeatured(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params

      const result = await mapWorkflowService.toggleFeatured(mapId, adminId, {
        auditContext: {
          ipAddress: String(req.ip),
          ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        },
      })

      return res.json({
        success: true,
        ...result,
      })
    } catch (error: unknown) {
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to update map featured status', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to update map',
        message: 'An error occurred while updating the map',
      })
    }
  }

  /**
   * Gets a list of maps by their status. (Admin only)
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getMapsByStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.userId
      if (!adminId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { status } = req.params

      const validStatuses = ['draft', 'pending_review', 'approved', 'rejected', 'archived']
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        })
      }

      const maps = await mapWorkflowService.getMapsByStatus(status as MapStatus)

      return res.json({
        success: true,
        maps,
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch maps by status', 500, {
        status: req.params.status,
      })
      return res.status(500).json({
        error: 'Failed to fetch maps',
        message: 'An error occurred while fetching maps',
      })
    }
  }

  /**
   * Gets the submission history for a map.
   * @param {AuthenticatedRequest} req - The Express request object.
   * @param {Response} res - The Express response object.
   */
  async getMapHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { mapId } = req.params

      const context = await mapPermissionService.getMapEditorContext(mapId, {
        userId,
        isAdmin: Boolean(req.user?.isAdmin),
      })

      if (!context.exists) {
        return res.status(404).json({ error: 'Map not found' })
      }

      if (!context.isAdmin && !context.canEdit) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to view this map history' })
      }

      const history = await mapWorkflowService.getMapHistory(mapId)

      return res.json({
        success: true,
        history,
      })
    } catch (error: unknown) {
      handleRouteError(error, req, 'Failed to fetch map history', 500, {
        mapId: req.params.mapId,
      })
      return res.status(500).json({
        error: 'Failed to fetch history',
        message: 'An error occurred while fetching map history',
      })
    }
  }
}
