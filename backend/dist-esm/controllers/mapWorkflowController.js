"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapWorkflowController = void 0;
const mapPermissionService_js_1 = require("../services/mapPermissionService.js");
const mapWorkflowService_js_1 = __importDefault(require("../services/mapWorkflowService.js"));
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
class MapWorkflowController {
    async saveDraft(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const draftData = req.body;
            const draft = await mapWorkflowService_js_1.default.saveDraft(userId, draftData);
            return res.json({
                success: true,
                draft,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to save draft');
            return res.status(500).json({
                error: 'Failed to save draft',
                message: 'An error occurred while saving your draft',
            });
        }
    }
    async getUserDrafts(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const drafts = await mapWorkflowService_js_1.default.getUserDrafts(userId);
            return res.json({
                success: true,
                drafts,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch drafts');
            return res.status(500).json({
                error: 'Failed to fetch drafts',
                message: 'An error occurred while fetching your drafts',
            });
        }
    }
    async getDraft(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { draftId } = req.params;
            const draft = await mapWorkflowService_js_1.default.getDraftById(draftId, userId);
            if (!draft) {
                return res.status(404).json({ error: 'Draft not found' });
            }
            return res.json({ success: true, draft });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch draft', 500, {
                draftId: req.params.draftId,
            });
            return res.status(500).json({
                error: 'Failed to fetch draft',
                message: 'An error occurred while loading the draft',
            });
        }
    }
    async publishDraft(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { draftId } = req.params;
            const map = await mapWorkflowService_js_1.default.publishDraft(draftId, userId);
            return res.json({ success: true, map });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to publish draft', 500, {
                draftId: req.params.draftId,
            });
            return res.status(500).json({
                error: 'Failed to publish draft',
                message: 'An error occurred while publishing your map',
            });
        }
    }
    async submitForReview(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            await mapWorkflowService_js_1.default.submitForReview(mapId, userId, {
                isAdmin: req.user?.isAdmin,
            });
            return res.json({
                success: true,
                message: 'Map submitted for review successfully',
            });
        }
        catch (error) {
            if (error instanceof mapPermissionService_js_1.MapPermissionError) {
                return res.status(403).json({ error: error.message });
            }
            if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
                return res.status(404).json({ error: error.message });
            }
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to submit map for review', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to submit map',
                message: 'An error occurred while submitting your map for review',
            });
        }
    }
    async getPendingReviews(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const reviews = await mapWorkflowService_js_1.default.getPendingReviews();
            return res.json({
                success: true,
                reviews,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch pending reviews');
            return res.status(500).json({
                error: 'Failed to fetch reviews',
                message: 'An error occurred while fetching pending reviews',
            });
        }
    }
    async approveMap(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            const { notes } = req.body;
            await mapWorkflowService_js_1.default.approveMap(mapId, adminId, {
                notes: notes ?? undefined,
                auditContext: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent') ?? undefined,
                },
            });
            return res.json({
                success: true,
                message: 'Map approved successfully',
            });
        }
        catch (error) {
            if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
                return res.status(404).json({ error: error.message });
            }
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to approve map', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to approve map',
                message: 'An error occurred while approving the map',
            });
        }
    }
    async rejectMap(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            const { reason } = req.body;
            if (!reason) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Rejection reason is required',
                });
            }
            await mapWorkflowService_js_1.default.rejectMap(mapId, adminId, {
                reason,
                auditContext: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent') ?? undefined,
                },
            });
            return res.json({
                success: true,
                message: 'Map rejected',
            });
        }
        catch (error) {
            if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
                return res.status(404).json({ error: error.message });
            }
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to reject map', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to reject map',
                message: 'An error occurred while rejecting the map',
            });
        }
    }
    async getAdminNotifications(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { unreadOnly } = req.query;
            const notifications = await mapWorkflowService_js_1.default.getAdminNotifications(adminId, unreadOnly === 'true');
            return res.json({
                success: true,
                notifications,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch map workflow notifications');
            return res.status(500).json({
                error: 'Failed to fetch notifications',
                message: 'An error occurred while fetching notifications',
            });
        }
    }
    async markNotificationRead(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { notificationId } = req.params;
            await mapWorkflowService_js_1.default.markNotificationRead(notificationId, adminId);
            return res.json({
                success: true,
                message: 'Notification marked as read',
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update notification', 500, {
                notificationId: req.params.notificationId,
            });
            return res.status(500).json({
                error: 'Failed to update notification',
                message: 'An error occurred while updating the notification',
            });
        }
    }
    async archiveMap(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            await mapWorkflowService_js_1.default.archiveMap(mapId, adminId, {
                auditContext: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent') ?? undefined,
                },
            });
            return res.json({
                success: true,
                message: 'Map archived successfully',
            });
        }
        catch (error) {
            if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
                return res.status(404).json({ error: error.message });
            }
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to archive map', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to archive map',
                message: 'An error occurred while archiving the map',
            });
        }
    }
    async toggleFeatured(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            const result = await mapWorkflowService_js_1.default.toggleFeatured(mapId, adminId, {
                auditContext: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent') ?? undefined,
                },
            });
            return res.json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
                return res.status(404).json({ error: error.message });
            }
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update map featured status', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to update map',
                message: 'An error occurred while updating the map',
            });
        }
    }
    async getMapsByStatus(req, res) {
        try {
            const adminId = req.userId;
            if (!adminId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { status } = req.params;
            const validStatuses = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    error: 'Invalid status',
                    message: `Status must be one of: ${validStatuses.join(', ')}`,
                });
            }
            const maps = await mapWorkflowService_js_1.default.getMapsByStatus(status);
            return res.json({
                success: true,
                maps,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch maps by status', 500, {
                status: req.params.status,
            });
            return res.status(500).json({
                error: 'Failed to fetch maps',
                message: 'An error occurred while fetching maps',
            });
        }
    }
    async getMapHistory(req, res) {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { mapId } = req.params;
            const context = await mapPermissionService_js_1.mapPermissionService.getMapEditorContext(mapId, {
                userId,
                isAdmin: req.user?.isAdmin,
            });
            if (!context.exists) {
                return res.status(404).json({ error: 'Map not found' });
            }
            if (!context.isAdmin && !context.canEdit) {
                return res
                    .status(403)
                    .json({ error: 'You do not have permission to view this map history' });
            }
            const history = await mapWorkflowService_js_1.default.getMapHistory(mapId);
            return res.json({
                success: true,
                history,
            });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch map history', 500, {
                mapId: req.params.mapId,
            });
            return res.status(500).json({
                error: 'Failed to fetch history',
                message: 'An error occurred while fetching map history',
            });
        }
    }
}
exports.MapWorkflowController = MapWorkflowController;
//# sourceMappingURL=mapWorkflowController.js.map