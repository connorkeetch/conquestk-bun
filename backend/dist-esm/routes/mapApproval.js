import express from 'express';
import { logAdminActivity, requireAdmin, requirePermission } from '../middleware/adminAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import MapApprovalService from '../services/mapApprovalService.js';
import { MapNotFoundError, MapPermissionError, mapPermissionService, } from '../services/mapPermissionService.js';
import { getErrorMessage } from '../utils/errorHelpers.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = express.Router();
router.use(authenticateToken);
router.get('/maps/:mapId/versions', async (req, res) => {
    try {
        const { mapId } = req.params;
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const context = await mapPermissionService.getMapEditorContext(mapId, {
            userId,
            isAdmin: Boolean(req.user?.isAdmin),
        });
        if (!context.exists) {
            res.status(404).json({ message: 'Map not found' });
            return;
        }
        if (!context.isAdmin && !context.canEdit) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }
        const versions = await MapApprovalService.getVersionHistory(mapId);
        res.json({ versions });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load map version history', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to load version history' });
    }
});
router.get('/versions/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const version = await MapApprovalService.getVersionById(versionId);
        await mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: Boolean(req.user?.isAdmin),
        });
        res.json({ version });
    }
    catch (error) {
        if (error instanceof MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        const message = getErrorMessage(error);
        if (message === 'Version not found') {
            res.status(404).json({ message });
        }
        else {
            handleRouteError(error, req, 'Failed to load version details', 500, {
                versionId: req.params.versionId,
            });
            res.status(500).json({ message });
        }
    }
});
router.post('/maps/:mapId/versions', async (req, res) => {
    try {
        const { mapId } = req.params;
        const userId = req.userId;
        const versionData = req.body;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        await mapPermissionService.assertCanEditMap(mapId, {
            userId,
            isAdmin: Boolean(req.user?.isAdmin),
        });
        const version = await MapApprovalService.createVersion(mapId, userId, versionData);
        res.status(201).json({ version });
    }
    catch (error) {
        if (error instanceof MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        if (error instanceof MapNotFoundError) {
            res.status(404).json({ message: error.message });
            return;
        }
        handleRouteError(error, req, 'Failed to create map version', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to create version' });
    }
});
router.put('/versions/:versionId/current', async (req, res) => {
    try {
        const { versionId } = req.params;
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const version = await MapApprovalService.getVersionById(versionId);
        await mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: Boolean(req.user?.isAdmin),
        });
        await MapApprovalService.setCurrentVersion(versionId);
        res.json({ message: 'Current version updated' });
    }
    catch (error) {
        if (error instanceof MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        if (error instanceof MapNotFoundError) {
            res.status(404).json({ message: error.message });
            return;
        }
        handleRouteError(error, req, 'Failed to set current version', 500, {
            versionId: req.params.versionId,
        });
        res.status(500).json({ message: 'Failed to update current version' });
    }
});
router.post('/versions/:versionId/submit', async (req, res) => {
    try {
        const { versionId } = req.params;
        const userId = req.userId;
        const { submissionNotes } = req.body;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const version = await MapApprovalService.getVersionById(versionId);
        await mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: Boolean(req.user?.isAdmin),
        });
        const approvalRequest = await MapApprovalService.submitForApproval(versionId, userId, submissionNotes);
        res.status(201).json({ approvalRequest });
    }
    catch (error) {
        if (error instanceof MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        handleRouteError(error, req, 'Failed to submit version for approval', 400, {
            versionId: req.params.versionId,
        });
        res.status(400).json({ message: getErrorMessage(error) });
    }
});
router.get('/approval-requests/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const approvalRequest = await MapApprovalService.getApprovalRequestById(requestId);
        const reviewResults = await MapApprovalService.getReviewResults(requestId);
        res.json({ approvalRequest, reviewResults });
    }
    catch (error) {
        const message = getErrorMessage(error);
        if (message === 'Approval request not found') {
            res.status(404).json({ message });
        }
        else {
            handleRouteError(error, req, 'Failed to load approval request', 500, {
                requestId: req.params.requestId,
            });
            res.status(500).json({ message });
        }
    }
});
router.get('/approval-requests', requireAdmin, requirePermission('map_approval'), async (req, res) => {
    try {
        const requests = await MapApprovalService.getPendingApprovalRequests();
        res.json({ requests });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load approval requests');
        res.status(500).json({ message: 'Failed to load approval requests' });
    }
});
router.put('/approval-requests/:requestId/assign', requireAdmin, requirePermission('map_approval'), logAdminActivity('map_review_assign'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const { moderatorId } = req.body;
        const currentUserId = req.userId;
        if (!currentUserId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        const assignedModeratorId = moderatorId || currentUserId;
        await MapApprovalService.assignReviewer(requestId, currentUserId, assignedModeratorId, {
            ipAddress: String(req.ip),
            ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        });
        res.json({ message: 'Reviewer assigned successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to assign reviewer', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to assign reviewer' });
    }
});
router.delete('/approval-requests/:requestId/assign', requireAdmin, requirePermission('map_approval'), logAdminActivity('map_review_unassign'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const currentUserId = req.userId;
        if (!currentUserId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await MapApprovalService.unassignReviewer(requestId, currentUserId, {
            ipAddress: String(req.ip),
            ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        });
        res.json({ message: 'Reviewer unassigned successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to unassign reviewer', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to unassign reviewer' });
    }
});
router.get('/review-criteria', requireAdmin, requirePermission('map_approval'), async (req, res) => {
    try {
        const criteria = await MapApprovalService.getReviewCriteria();
        res.json({ criteria });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load review criteria');
        res.status(500).json({ message: 'Failed to load review criteria' });
    }
});
router.post('/approval-requests/:requestId/review', requireAdmin, requirePermission('map_approval'), logAdminActivity('map_review_decision'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const moderatorId = req.userId;
        const { results, decision, moderatorFeedback } = req.body;
        if (!moderatorId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        if (!results || !decision) {
            res.status(400).json({ message: 'Review results and decision are required' });
            return;
        }
        await MapApprovalService.submitReviewResults(requestId, moderatorId, results, decision, moderatorFeedback, {
            ipAddress: String(req.ip),
            ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        });
        res.json({ message: 'Review submitted successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to submit review results', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to submit review results' });
    }
});
router.post('/versions/:versionId/publish', requireAdmin, requirePermission('map_approval'), logAdminActivity('map_review_publish'), async (req, res) => {
    try {
        const { versionId } = req.params;
        const moderatorId = req.userId;
        if (!moderatorId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await MapApprovalService.publishVersion(versionId, moderatorId, {
            ipAddress: String(req.ip),
            ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        });
        res.json({ message: 'Version published successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to publish version', 400, {
            versionId: req.params.versionId,
        });
        res.status(400).json({ message: getErrorMessage(error) });
    }
});
router.post('/maps/:mapId/archive', requireAdmin, requirePermission('map_approval'), logAdminActivity('map_review_archive'), async (req, res) => {
    try {
        const { mapId } = req.params;
        const moderatorId = req.userId;
        const { reason } = req.body;
        if (!moderatorId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await MapApprovalService.archiveMap(mapId, moderatorId, reason, {
            ipAddress: String(req.ip),
            ...(req.get('User-Agent') ? { userAgent: String(req.get('User-Agent')) } : {}),
        });
        res.json({ message: 'Map archived successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to archive map', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to archive map' });
    }
});
router.get('/maps/:mapId/moderation-history', requireAdmin, requirePermission('map_approval'), async (req, res) => {
    try {
        const { mapId } = req.params;
        const history = await MapApprovalService.getMapModerationHistory(mapId);
        res.json({ history });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load moderation history', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to load moderation history' });
    }
});
router.get('/stats/approvals', requireAdmin, requirePermission('map_approval'), async (req, res) => {
    try {
        const stats = await MapApprovalService.getApprovalStats();
        res.json({ stats });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load approval stats');
        res.status(500).json({ message: 'Failed to load approval stats' });
    }
});
router.get('/my-maps', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        res.json({ maps: [] });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load user map permissions');
        res.status(500).json({ message: 'Failed to load user map permissions' });
    }
});
export default router;
//# sourceMappingURL=mapApproval.js.map