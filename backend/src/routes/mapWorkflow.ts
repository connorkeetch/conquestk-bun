import { Router } from 'express'
import { MapWorkflowController } from '../controllers/mapWorkflowController'
import { authenticateToken } from '../middleware/auth'
import { standardLimiter } from '../middleware/rateLimiter'

const router = Router()
const mapWorkflowController = new MapWorkflowController()

// All routes require authentication
router.use(authenticateToken)
router.use(standardLimiter as unknown)

// Draft management
router.post('/drafts', mapWorkflowController.saveDraft)
router.get('/drafts', mapWorkflowController.getUserDrafts)

// Map submission
router.post('/maps/:mapId/submit', mapWorkflowController.submitForReview)
router.get('/maps/:mapId/history', mapWorkflowController.getMapHistory)

// Admin routes
router.get('/admin/reviews/pending', mapWorkflowController.getPendingReviews)
router.post('/admin/maps/:mapId/approve', mapWorkflowController.approveMap)
router.post('/admin/maps/:mapId/reject', mapWorkflowController.rejectMap)
router.post('/admin/maps/:mapId/archive', mapWorkflowController.archiveMap)
router.post('/admin/maps/:mapId/toggle-featured', mapWorkflowController.toggleFeatured)
router.get('/admin/maps/status/:status', mapWorkflowController.getMapsByStatus)

// Admin notifications
router.get('/admin/notifications', mapWorkflowController.getAdminNotifications)
router.post('/admin/notifications/:notificationId/read', mapWorkflowController.markNotificationRead)

export default router
