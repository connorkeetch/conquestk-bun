"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const mapApprovalService_js_1 = __importDefault(require("../services/mapApprovalService.js"));
const mapPermissionService_js_1 = require("../services/mapPermissionService.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = express_1.default.Router();
router.use(auth_js_1.authenticateToken);
router.get('/maps/:mapId/versions', async (req, res) => {
    try {
        const { mapId } = req.params;
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        const context = await mapPermissionService_js_1.mapPermissionService.getMapEditorContext(mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        if (!context.exists) {
            res.status(404).json({ message: 'Map not found' });
            return;
        }
        if (!context.isAdmin && !context.canEdit) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }
        const versions = await mapApprovalService_js_1.default.getVersionHistory(mapId);
        res.json({ versions });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load map version history', 500, {
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
        const version = await mapApprovalService_js_1.default.getVersionById(versionId);
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        res.json({ version });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        const message = (0, errorHelpers_js_1.getErrorMessage)(error);
        if (message === 'Version not found') {
            res.status(404).json({ message });
        }
        else {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load version details', 500, {
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
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        const version = await mapApprovalService_js_1.default.createVersion(mapId, userId, versionData);
        res.status(201).json({ version });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            res.status(404).json({ message: error.message });
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create map version', 500, {
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
        const version = await mapApprovalService_js_1.default.getVersionById(versionId);
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        await mapApprovalService_js_1.default.setCurrentVersion(versionId);
        res.json({ message: 'Current version updated' });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            res.status(404).json({ message: error.message });
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to set current version', 500, {
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
        const version = await mapApprovalService_js_1.default.getVersionById(versionId);
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(version.mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        const approvalRequest = await mapApprovalService_js_1.default.submitForApproval(versionId, userId, submissionNotes);
        res.status(201).json({ approvalRequest });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            res.status(403).json({ message: error.message });
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to submit version for approval', 400, {
            versionId: req.params.versionId,
        });
        res.status(400).json({ message: (0, errorHelpers_js_1.getErrorMessage)(error) });
    }
});
router.get('/approval-requests/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const approvalRequest = await mapApprovalService_js_1.default.getApprovalRequestById(requestId);
        const reviewResults = await mapApprovalService_js_1.default.getReviewResults(requestId);
        res.json({ approvalRequest, reviewResults });
    }
    catch (error) {
        const message = (0, errorHelpers_js_1.getErrorMessage)(error);
        if (message === 'Approval request not found') {
            res.status(404).json({ message });
        }
        else {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load approval request', 500, {
                requestId: req.params.requestId,
            });
            res.status(500).json({ message });
        }
    }
});
router.get('/approval-requests', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), async (req, res) => {
    try {
        const requests = await mapApprovalService_js_1.default.getPendingApprovalRequests();
        res.json({ requests });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load approval requests');
        res.status(500).json({ message: 'Failed to load approval requests' });
    }
});
router.put('/approval-requests/:requestId/assign', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), (0, adminAuth_js_1.logAdminActivity)('map_review_assign'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const { moderatorId } = req.body;
        const currentUserId = req.userId;
        if (!currentUserId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        const assignedModeratorId = moderatorId || currentUserId;
        await mapApprovalService_js_1.default.assignReviewer(requestId, currentUserId, assignedModeratorId, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') ?? undefined,
        });
        res.json({ message: 'Reviewer assigned successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to assign reviewer', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to assign reviewer' });
    }
});
router.delete('/approval-requests/:requestId/assign', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), (0, adminAuth_js_1.logAdminActivity)('map_review_unassign'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const currentUserId = req.userId;
        if (!currentUserId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await mapApprovalService_js_1.default.unassignReviewer(requestId, currentUserId, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') ?? undefined,
        });
        res.json({ message: 'Reviewer unassigned successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to unassign reviewer', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to unassign reviewer' });
    }
});
router.get('/review-criteria', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), async (req, res) => {
    try {
        const criteria = await mapApprovalService_js_1.default.getReviewCriteria();
        res.json({ criteria });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load review criteria');
        res.status(500).json({ message: 'Failed to load review criteria' });
    }
});
router.post('/approval-requests/:requestId/review', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), (0, adminAuth_js_1.logAdminActivity)('map_review_decision'), async (req, res) => {
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
        await mapApprovalService_js_1.default.submitReviewResults(requestId, moderatorId, results, decision, moderatorFeedback, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') ?? undefined,
        });
        res.json({ message: 'Review submitted successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to submit review results', 500, {
            requestId: req.params.requestId,
        });
        res.status(500).json({ message: 'Failed to submit review results' });
    }
});
router.post('/versions/:versionId/publish', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), (0, adminAuth_js_1.logAdminActivity)('map_review_publish'), async (req, res) => {
    try {
        const { versionId } = req.params;
        const moderatorId = req.userId;
        if (!moderatorId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await mapApprovalService_js_1.default.publishVersion(versionId, moderatorId, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') ?? undefined,
        });
        res.json({ message: 'Version published successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to publish version', 400, {
            versionId: req.params.versionId,
        });
        res.status(400).json({ message: (0, errorHelpers_js_1.getErrorMessage)(error) });
    }
});
router.post('/maps/:mapId/archive', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), (0, adminAuth_js_1.logAdminActivity)('map_review_archive'), async (req, res) => {
    try {
        const { mapId } = req.params;
        const moderatorId = req.userId;
        const { reason } = req.body;
        if (!moderatorId) {
            res.status(401).json({ message: 'Moderator not authenticated' });
            return;
        }
        await mapApprovalService_js_1.default.archiveMap(mapId, moderatorId, reason, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') ?? undefined,
        });
        res.json({ message: 'Map archived successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to archive map', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to archive map' });
    }
});
router.get('/maps/:mapId/moderation-history', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), async (req, res) => {
    try {
        const { mapId } = req.params;
        const history = await mapApprovalService_js_1.default.getMapModerationHistory(mapId);
        res.json({ history });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load moderation history', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ message: 'Failed to load moderation history' });
    }
});
router.get('/stats/approvals', adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.requirePermission)('map_approval'), async (req, res) => {
    try {
        const stats = await mapApprovalService_js_1.default.getApprovalStats();
        res.json({ stats });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load approval stats');
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
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load user map permissions');
        res.status(500).json({ message: 'Failed to load user map permissions' });
    }
});
exports.default = router;
//# sourceMappingURL=mapApproval.js.map