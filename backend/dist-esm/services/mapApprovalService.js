"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapApprovalService = void 0;
const database_js_1 = require("../config/database.js");
const adminService_js_1 = require("./adminService.js");
const notificationService_js_1 = __importDefault(require("./notificationService.js"));
class MapApprovalService {
    static async createVersion(mapId, userId, versionData) {
        const currentVersion = await MapApprovalService.getCurrentVersion(mapId);
        let major = 1;
        let minor = 0;
        let patch = 0;
        if (currentVersion) {
            major = currentVersion.versionMajor;
            minor = currentVersion.versionMinor;
            patch = currentVersion.versionPatch;
            switch (versionData.versionType || 'patch') {
                case 'major':
                    major++;
                    minor = 0;
                    patch = 0;
                    break;
                case 'minor':
                    minor++;
                    patch = 0;
                    break;
                case 'patch':
                    patch++;
                    break;
            }
        }
        const versionNumber = `${major}.${minor}.${patch}`;
        const draftStatusId = await MapApprovalService.getStatusId('draft');
        const result = await (0, database_js_1.query)(`
      INSERT INTO map_versions (
        map_id, version_number, version_major, version_minor, version_patch,
        status_id, name, description, image_url, image_width, image_height,
        tags, changelog, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14
      )
    `, [
            mapId,
            versionNumber,
            major,
            minor,
            patch,
            draftStatusId,
            versionData.name,
            versionData.description,
            versionData.imageUrl,
            versionData.imageWidth || 600,
            versionData.imageHeight || 450,
            versionData.tags ? JSON.stringify(versionData.tags) : null,
            versionData.changelog,
            userId,
        ]);
        return MapApprovalService.getVersionById(result.rows[0]?.id || '1');
    }
    static async getCurrentVersion(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.map_id = $1 AND v.is_current = 1
    `, [mapId]);
        return result.rows[0] || null;
    }
    static async getVersionById(versionId) {
        const result = await (0, database_js_1.query)(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.id = $1
    `, [versionId]);
        if (!result.rows[0]) {
            throw new Error('Version not found');
        }
        return result.rows[0];
    }
    static async getVersionHistory(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.map_id = $1
      ORDER BY v.version_major DESC, v.version_minor DESC, v.version_patch DESC
    `, [mapId]);
        return result.rows;
    }
    static async setCurrentVersion(versionId) {
        const _version = await MapApprovalService.getVersionById(versionId);
        await (0, database_js_1.query)(`
      UPDATE map_versions SET is_current = 1 WHERE id = $1
    `, [versionId]);
    }
    static async submitForApproval(versionId, userId, submissionNotes) {
        const version = await MapApprovalService.getVersionById(versionId);
        const draftStatusId = await MapApprovalService.getStatusId('draft');
        if (version.statusId !== draftStatusId) {
            throw new Error('Only draft versions can be submitted for approval');
        }
        const submittedStatusId = await MapApprovalService.getStatusId('submitted');
        await (0, database_js_1.query)(`
      UPDATE map_versions SET status_id = $1 WHERE id = $2
    `, [submittedStatusId, versionId]);
        const result = await (0, database_js_1.query)(`
      INSERT INTO map_approval_requests (
        version_id, requester_id, submission_notes, priority_level
      ) VALUES ($1, $2, $3, $4)
    `, [versionId, userId, submissionNotes, 'normal']);
        return MapApprovalService.getApprovalRequestById(result.rows[0]?.id || '1');
    }
    static async getApprovalRequestById(requestId) {
        const result = await (0, database_js_1.query)(`
      SELECT * FROM map_approval_requests WHERE id = $1
    `, [requestId]);
        if (!result.rows[0]) {
            throw new Error('Approval request not found');
        }
        return result.rows[0];
    }
    static async getPendingApprovalRequests() {
        const result = await (0, database_js_1.query)(`
      SELECT ar.*, v.name as version_name, v.version_number,
             u.username as requester_username
      FROM map_approval_requests ar
      JOIN map_versions v ON ar.version_id = v.id
      JOIN users u ON ar.requester_id = u.id
      WHERE ar.decision IS NULL
      ORDER BY ar.created_at ASC
    `);
        return result.rows;
    }
    static async assignReviewer(requestId, actorId, moderatorId, auditContext) {
        const requestBefore = await MapApprovalService.getApprovalRequestById(requestId);
        const versionBefore = await MapApprovalService.getVersionById(requestBefore.versionId);
        await (0, database_js_1.query)(`
      UPDATE map_approval_requests 
      SET assigned_moderator_id = $1, review_started_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [moderatorId, requestId]);
        const underReviewStatusId = await MapApprovalService.getStatusId('under_review');
        await (0, database_js_1.query)(`
      UPDATE map_versions SET status_id = $1 WHERE id = $2
    `, [underReviewStatusId, requestBefore.versionId]);
        const requestAfter = await MapApprovalService.getApprovalRequestById(requestId);
        const versionAfter = await MapApprovalService.getVersionById(requestBefore.versionId);
        await notificationService_js_1.default.createInAppNotification(moderatorId, {
            type: 'map_review',
            title: 'Map assigned for review',
            message: `"${versionAfter.name}" is ready for your review.`,
            data: { mapId: versionAfter.mapId, versionId: versionAfter.id, requestId },
            actionUrl: `/admin/maps/${versionAfter.mapId}/review`,
            actionLabel: 'Open review',
            sendPush: false,
        });
        await adminService_js_1.adminService.logAdminAction(actorId, 'map_reviewer_assigned', {
            requestId,
            assignedModeratorId: moderatorId,
            before: {
                assignedModeratorId: requestBefore.assignedModeratorId,
                reviewStartedAt: requestBefore.reviewStartedAt,
                versionStatusId: versionBefore.statusId,
            },
            after: {
                assignedModeratorId: requestAfter.assignedModeratorId,
                reviewStartedAt: requestAfter.reviewStartedAt,
                versionStatusId: versionAfter.statusId,
            },
        }, 'map_version', versionAfter.id, auditContext?.ipAddress, auditContext?.userAgent);
    }
    static async unassignReviewer(requestId, actorId, auditContext) {
        const requestBefore = await MapApprovalService.getApprovalRequestById(requestId);
        await (0, database_js_1.query)(`
      UPDATE map_approval_requests 
      SET assigned_moderator_id = NULL, review_started_at = NULL
      WHERE id = $1
    `, [requestId]);
        const requestAfter = await MapApprovalService.getApprovalRequestById(requestId);
        await adminService_js_1.adminService.logAdminAction(actorId, 'map_reviewer_unassigned', {
            requestId,
            before: {
                assignedModeratorId: requestBefore.assignedModeratorId,
                reviewStartedAt: requestBefore.reviewStartedAt,
            },
            after: {
                assignedModeratorId: requestAfter.assignedModeratorId,
                reviewStartedAt: requestAfter.reviewStartedAt,
            },
        }, 'map_approval_request', requestId, auditContext?.ipAddress, auditContext?.userAgent);
    }
    static async getReviewCriteria() {
        const result = await (0, database_js_1.query)(`
      SELECT * FROM map_review_criteria 
      ORDER BY category, check_order
    `);
        return result.rows;
    }
    static async submitReviewResults(requestId, moderatorId, results, decision, moderatorFeedback, auditContext) {
        const requestBefore = await MapApprovalService.getApprovalRequestById(requestId);
        const versionBefore = await MapApprovalService.getVersionById(requestBefore.versionId);
        const mapSnapshotBefore = await MapApprovalService.fetchMapSnapshot(versionBefore.mapId);
        for (const result of results) {
            await (0, database_js_1.query)(`
        INSERT INTO map_review_results (
          approval_request_id,
          criteria_id,
          reviewer_id,
          status,
          reviewer_notes
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (approval_request_id, criteria_id) DO UPDATE SET
          reviewer_id = EXCLUDED.reviewer_id,
          status = EXCLUDED.status,
          reviewer_notes = EXCLUDED.reviewer_notes,
          updated_at = CURRENT_TIMESTAMP
      `, [requestId, result.criteriaId, moderatorId, result.status, result.reviewerNotes ?? null]);
        }
        await (0, database_js_1.query)(`
      UPDATE map_approval_requests 
      SET decision = $1, moderator_feedback = $2, review_completed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [decision, moderatorFeedback, requestId]);
        const request = await MapApprovalService.getApprovalRequestById(requestId);
        let newStatusId;
        switch (decision) {
            case 'approved':
                newStatusId = await MapApprovalService.getStatusId('approved');
                break;
            case 'rejected':
                newStatusId = await MapApprovalService.getStatusId('rejected');
                break;
            case 'needs_changes':
                newStatusId = await MapApprovalService.getStatusId('draft');
                break;
            default:
                throw new Error('Invalid decision');
        }
        await (0, database_js_1.query)(`
      UPDATE map_versions SET status_id = $1 WHERE id = $2
    `, [newStatusId, request.versionId]);
        await MapApprovalService.recordModerationAction(request.versionId, moderatorId, decision, moderatorFeedback, { reviewResults: results });
        const version = await MapApprovalService.getVersionById(request.versionId);
        const mapInfo = await (0, database_js_1.query)('SELECT creator_id, name FROM maps WHERE id = $1', [version.mapId]);
        const creatorId = mapInfo.rows?.[0]?.creator_id;
        const mapName = mapInfo.rows?.[0]?.name ?? 'Your map';
        const baseData = {
            mapId: version.mapId,
            versionId: version.id,
            requestId,
        };
        if (creatorId) {
            let type;
            let title;
            let message;
            let pushTitle;
            let pushBody;
            switch (decision) {
                case 'approved':
                    type = 'map_approved';
                    title = 'Map approved';
                    message = `"${mapName}" has been approved.`;
                    pushTitle = '✅ Map approved';
                    pushBody = `"${mapName}" is now approved.`;
                    break;
                case 'rejected':
                    type = 'map_rejected';
                    title = 'Map rejected';
                    message = moderatorFeedback
                        ? `"${mapName}" was rejected: ${moderatorFeedback}`
                        : `"${mapName}" was rejected.`;
                    pushTitle = '❗ Map review update';
                    pushBody = `"${mapName}" was rejected.`;
                    break;
                case 'needs_changes':
                    type = 'map_review';
                    title = 'Map needs changes';
                    message = moderatorFeedback
                        ? `Review feedback for "${mapName}": ${moderatorFeedback}`
                        : `Reviewers requested changes for "${mapName}".`;
                    pushTitle = 'ℹ️ Map review feedback';
                    pushBody = `"${mapName}" needs updates before approval.`;
                    break;
                default:
                    type = 'map_review';
                    title = 'Map review updated';
                    message = `Review updated for "${mapName}".`;
                    pushTitle = 'ℹ️ Map review updated';
                    pushBody = `Review updated for "${mapName}".`;
            }
            await notificationService_js_1.default.createInAppNotification(creatorId, {
                type,
                title,
                message,
                data: { ...baseData, decision, moderatorFeedback },
                actionUrl: `/maps/${version.mapId}`,
                actionLabel: 'Review map',
                sendPush: true,
                pushPayload: {
                    title: pushTitle,
                    body: pushBody,
                    data: {
                        url: `/maps/${version.mapId}`,
                        decision,
                        ...baseData,
                    },
                },
            });
        }
        const requestAfter = await MapApprovalService.getApprovalRequestById(requestId);
        const versionAfter = await MapApprovalService.getVersionById(request.versionId);
        const mapSnapshotAfter = await MapApprovalService.fetchMapSnapshot(versionAfter.mapId);
        await adminService_js_1.adminService.logAdminAction(moderatorId, decision === 'approved'
            ? 'map_review_approved'
            : decision === 'rejected'
                ? 'map_review_rejected'
                : 'map_review_needs_changes', {
            requestId,
            decision,
            moderatorFeedback,
            before: {
                approvalRequest: requestBefore,
                version: versionBefore,
                map: mapSnapshotBefore,
            },
            after: {
                approvalRequest: requestAfter,
                version: versionAfter,
                map: mapSnapshotAfter,
            },
            reviewResults: results,
        }, 'map', versionAfter.mapId, auditContext?.ipAddress, auditContext?.userAgent);
    }
    static async getReviewResults(requestId) {
        const result = await (0, database_js_1.query)(`
      SELECT rr.*, rc.name as criteria_name, rc.description as criteria_description,
             rc.category as criteria_category, rc.is_required
      FROM map_review_results rr
      JOIN map_review_criteria rc ON rr.criteria_id = rc.id
      WHERE rr.approval_request_id = $1
      ORDER BY rc.category, rc.check_order
    `, [requestId]);
        return result.rows;
    }
    static async publishVersion(versionId, moderatorId, auditContext) {
        const version = await MapApprovalService.getVersionById(versionId);
        const mapSnapshotBefore = await MapApprovalService.fetchMapSnapshot(version.mapId);
        const approvedStatusId = await MapApprovalService.getStatusId('approved');
        if (version.statusId !== approvedStatusId) {
            throw new Error('Only approved versions can be published');
        }
        const publishedStatusId = await MapApprovalService.getStatusId('published');
        await (0, database_js_1.query)(`
      UPDATE map_versions 
      SET status_id = $1, published_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [publishedStatusId, versionId]);
        await MapApprovalService.setCurrentVersion(versionId);
        await MapApprovalService.recordModerationAction(versionId, moderatorId, 'publish', 'Published to public');
        const versionAfter = await MapApprovalService.getVersionById(versionId);
        const mapSnapshotAfter = await MapApprovalService.fetchMapSnapshot(version.mapId);
        await adminService_js_1.adminService.logAdminAction(moderatorId, 'map_review_published', {
            versionId,
            before: {
                version,
                map: mapSnapshotBefore,
            },
            after: {
                version: versionAfter,
                map: mapSnapshotAfter,
            },
        }, 'map', version.mapId, auditContext?.ipAddress, auditContext?.userAgent);
    }
    static async archiveMap(mapId, moderatorId, reason, auditContext) {
        const beforeSnapshot = await MapApprovalService.fetchMapSnapshot(mapId);
        const archivedStatusId = await MapApprovalService.getStatusId('archived');
        await (0, database_js_1.query)(`
      UPDATE maps SET status_id = $1 WHERE id = $2
    `, [archivedStatusId, mapId]);
        await MapApprovalService.recordModerationAction(mapId, moderatorId, 'archive', reason);
        const afterSnapshot = await MapApprovalService.fetchMapSnapshot(mapId);
        await adminService_js_1.adminService.logAdminAction(moderatorId, 'map_review_archived', {
            mapId,
            reason,
            before: beforeSnapshot,
            after: afterSnapshot,
        }, 'map', mapId, auditContext?.ipAddress, auditContext?.userAgent);
    }
    static async getStatusId(statusName) {
        const result = await (0, database_js_1.query)(`
      SELECT id FROM map_status WHERE name = $1
    `, [statusName]);
        if (!result.rows[0]) {
            throw new Error(`Status '${statusName}' not found`);
        }
        return result.rows[0].id;
    }
    static async recordModerationAction(mapId, moderatorId, actionType, reason, details, versionId) {
        await (0, database_js_1.query)(`
      INSERT INTO map_moderation_actions 
      (map_id, version_id, moderator_id, action_type, reason, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [mapId, versionId, moderatorId, actionType, reason, details ? JSON.stringify(details) : null]);
    }
    static async getMapModerationHistory(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT ma.*, u.username as moderator_username
      FROM map_moderation_actions ma
      JOIN users u ON ma.moderator_id = u.id
      WHERE ma.map_id = $1
      ORDER BY ma.created_at DESC
    `, [mapId]);
        return result.rows;
    }
    static async fetchMapSnapshot(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT 
        status_id,
        status,
        is_public,
        reviewed_at,
        reviewed_by,
        review_notes,
        rejection_reason,
        is_featured,
        updated_at
      FROM maps
      WHERE id = $1
    `, [mapId]);
        return result.rows[0] ?? null;
    }
    static async getApprovalStats() {
        const result = await (0, database_js_1.query)(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) as pending,
        AVG(CASE
          WHEN review_completed_at IS NOT NULL AND review_started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (review_completed_at - review_started_at)) / 3600
        END) as avg_review_hours
      FROM map_approval_requests
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
        return result.rows[0];
    }
}
exports.MapApprovalService = MapApprovalService;
exports.default = MapApprovalService;
//# sourceMappingURL=mapApprovalService.js.map