import { Router } from 'express'
import { MapWorkflowController } from '../controllers/mapWorkflowController'
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
  mapWorkflowController.getPendingReviews.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/approve',
  mapWorkflowController.approveMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/reject',
  mapWorkflowController.rejectMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/archive',
  mapWorkflowController.archiveMap.bind(mapWorkflowController),
)
router.post(
  '/admin/maps/:mapId/toggle-featured',
  mapWorkflowController.toggleFeatured.bind(mapWorkflowController),
)
router.get(
  '/admin/maps/status/:status',
  mapWorkflowController.getMapsByStatus.bind(mapWorkflowController),
)

// Admin notifications
router.get(
  '/admin/notifications',
  mapWorkflowController.getAdminNotifications.bind(mapWorkflowController),
)
router.post(
  '/admin/notifications/:notificationId/read',
  mapWorkflowController.markNotificationRead.bind(mapWorkflowController),
)

export default router
