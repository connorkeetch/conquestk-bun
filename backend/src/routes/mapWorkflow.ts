import { Router } from 'express'
import { MapWorkflowController } from '../controllers/mapWorkflowController'
import { logAdminActivity, requireAdmin, requirePermission } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import { standardLimiter } from '../middleware/rateLimiter'

const router = Router()
const mapWorkflowController = new MapWorkflowController()

// All routes require authentication
router.use(authenticateToken)
router.use(standardLimiter)

// Draft management
router.post('/drafts', mapWorkflowController.saveDraft.bind(mapWorkflowController))
router.get('/drafts', mapWorkflowController.getUserDrafts.bind(mapWorkflowController))
router.get('/drafts/:draftId', mapWorkflowController.getDraft.bind(mapWorkflowController))
router.post(
  '/drafts/:draftId/publish',
  mapWorkflowController.publishDraft.bind(mapWorkflowController),
)

// Map submission
router.post(
  '/maps/:mapId/submit',
  mapWorkflowController.submitForReview.bind(mapWorkflowController),
)
router.get('/maps/:mapId/history', mapWorkflowController.getMapHistory.bind(mapWorkflowController))

// Admin routes
router.get(
  '/admin/reviews/pending',
  requireAdmin,
  requirePermission('map_approval'),
  mapWorkflowController.getPendingReviews.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/approve',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_approve'),
  mapWorkflowController.approveMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/reject',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_reject'),
  mapWorkflowController.rejectMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/archive',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_archive'),
  mapWorkflowController.archiveMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/toggle-featured',
  requireAdmin,
  requirePermission('map_approval'),
  logAdminActivity('map_review_toggle_featured'),
  mapWorkflowController.toggleFeatured.bind(mapWorkflowController),
)
router.get(
  '/admin/maps/status/:status',
  requireAdmin,
  requirePermission('map_approval'),
  mapWorkflowController.getMapsByStatus.bind(mapWorkflowController),
)

// Admin notifications
router.get(
  '/admin/notifications',
  requireAdmin,
  requirePermission('map_approval'),
  mapWorkflowController.getAdminNotifications.bind(mapWorkflowController),
)
router.post(
  '/admin/notifications/:notificationId/read',
  requireAdmin,
  requirePermission('map_approval'),
  mapWorkflowController.markNotificationRead.bind(mapWorkflowController),
)

export default router
