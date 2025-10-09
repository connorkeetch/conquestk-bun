"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clanMembershipService = exports.ClanMembershipService = exports.ClanMembershipServiceError = void 0;
const database_js_1 = require("../config/database.js");
const clanActivityService_js_1 = require("./clanActivityService.js");
const clanService_js_1 = require("./clanService.js");
const APPLICATION_STATUS_ORDER = {
    pending: 0,
    accepted: 1,
    rejected: 2,
    withdrawn: 3,
};
const ACTIVE_MEMBER_STATUSES = ['active'];
class ClanMembershipServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.ClanMembershipServiceError = ClanMembershipServiceError;
const mapApplication = (row) => ({
    id: row.id,
    clanId: row.clan_id,
    userId: row.user_id,
    status: row.status,
    message: row.message ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
class ClanMembershipService {
    async applyToClan(userId, clanId, message) {
        const trimmedMessage = message?.trim() ?? null;
        const applicationRow = await (0, database_js_1.transaction)(async (client) => {
            const clanGate = await client.query(`SELECT recruitment_status, recruitment_policy FROM clans WHERE id = $1 AND deleted_at IS NULL FOR SHARE`, [clanId]);
            const clanRow = clanGate.rows[0];
            if (!clanRow) {
                throw new ClanMembershipServiceError('CLAN_NOT_FOUND', 'Clan not found or unavailable');
            }
            if (clanRow.recruitment_status === 'closed') {
                throw new ClanMembershipServiceError('CLAN_CLOSED', 'This clan is not accepting new members at the moment');
            }
            const activeMembership = await client.query(`SELECT id FROM clan_members WHERE user_id = $1 AND status = 'active' LIMIT 1`, [userId]);
            const activeMembershipCount = activeMembership.rowCount ?? 0;
            if (activeMembershipCount > 0) {
                throw new ClanMembershipServiceError('ALREADY_IN_CLAN', 'You are already a member of a clan and cannot apply to another until you leave.');
            }
            const existingApplication = await client.query(`
          SELECT id, clan_id, user_id, status, message, reviewed_by, reviewed_at, created_at, updated_at
          FROM clan_join_requests
          WHERE clan_id = $1 AND user_id = $2 AND type = 'application'
          ORDER BY created_at DESC
          LIMIT 1
        `, [clanId, userId]);
            const lastApplication = existingApplication.rows[0];
            if (lastApplication && lastApplication.status === 'pending') {
                throw new ClanMembershipServiceError('APPLICATION_EXISTS', 'You already have a pending application for this clan.');
            }
            const newApplication = await client.query(`
          INSERT INTO clan_join_requests (clan_id, user_id, type, status, message, created_by)
          VALUES ($1, $2, 'application', 'pending', $3, $2)
          RETURNING id, clan_id, user_id, status, message, reviewed_by, reviewed_at, created_at, updated_at
        `, [clanId, userId, trimmedMessage]);
            await (0, clanActivityService_js_1.logClanActivity)({
                clanId,
                actorUserId: userId,
                actionType: 'application_submitted',
                metadata: { message: trimmedMessage },
                client,
            });
            return newApplication.rows[0];
        });
        return mapApplication(applicationRow);
    }
    ensureCanReview(status, permissions) {
        if (!ACTIVE_MEMBER_STATUSES.includes(status)) {
            throw new ClanMembershipServiceError('NOT_ACTIVE', 'Only active clan members can review applications');
        }
        if (!permissions?.manage_applications) {
            throw new ClanMembershipServiceError('FORBIDDEN', 'You do not have permission to manage applications');
        }
    }
    async reviewApplication(reviewerId, clanId, applicationId, decision) {
        const updatedApplication = await (0, database_js_1.transaction)(async (client) => {
            const applicationResult = await client.query(`
          SELECT id, clan_id, user_id, status, message, reviewed_by, reviewed_at, created_at, updated_at
          FROM clan_join_requests
          WHERE id = $1 AND clan_id = $2 AND type = 'application'
          FOR UPDATE
        `, [applicationId, clanId]);
            const application = applicationResult.rows[0];
            if (!application) {
                throw new ClanMembershipServiceError('NOT_FOUND', 'Application not found');
            }
            if (APPLICATION_STATUS_ORDER[application.status] > 0) {
                throw new ClanMembershipServiceError('ALREADY_REVIEWED', 'This application has already been processed');
            }
            const reviewerMembership = await client.query(`
          SELECT
            m.status,
            r.permissions,
            m.clan_id
          FROM clan_members m
          LEFT JOIN clan_roles r ON r.id = m.role_id
          WHERE m.user_id = $1 AND m.clan_id = $2
          LIMIT 1
        `, [reviewerId, application.clan_id]);
            const membershipRow = reviewerMembership.rows[0];
            if (!membershipRow) {
                throw new ClanMembershipServiceError('NOT_IN_CLAN', 'Reviewer must be an active member of the clan');
            }
            const permissions = typeof membershipRow.permissions === 'string'
                ? JSON.parse(membershipRow.permissions)
                : (membershipRow.permissions ?? {});
            this.ensureCanReview(membershipRow.status, permissions);
            const newStatus = decision === 'accepted' ? 'accepted' : 'rejected';
            const result = await client.query(`
          UPDATE clan_join_requests
          SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING id, clan_id, user_id, status, message, reviewed_by, reviewed_at, created_at, updated_at
        `, [newStatus, reviewerId, applicationId]);
            if (decision === 'accepted') {
                const memberRoleId = await clanService_js_1.clanService.getMemberRoleId(application.clan_id, 'Member', client);
                await client.query(`
            INSERT INTO clan_members (clan_id, user_id, role_id, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (clan_id, user_id)
            DO UPDATE SET status = 'active', role_id = EXCLUDED.role_id, joined_at = CURRENT_TIMESTAMP
          `, [application.clan_id, application.user_id, memberRoleId]);
                await (0, clanActivityService_js_1.logClanActivity)({
                    clanId: application.clan_id,
                    actorUserId: reviewerId,
                    actionType: 'member_joined',
                    metadata: { userId: application.user_id },
                    targetId: application.user_id,
                    client,
                });
            }
            else {
                await (0, clanActivityService_js_1.logClanActivity)({
                    clanId: application.clan_id,
                    actorUserId: reviewerId,
                    actionType: 'application_rejected',
                    metadata: { userId: application.user_id },
                    targetId: application.user_id,
                    client,
                });
            }
            return result.rows[0];
        });
        return mapApplication(updatedApplication);
    }
    async getMembershipForUser(userId) {
        const result = await (0, database_js_1.query)(`
        SELECT * FROM clan_members
        WHERE user_id = $1 AND status = 'active'
        LIMIT 1
      `, [userId]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            clanId: row.clan_id,
            userId: row.user_id,
            roleId: row.role_id,
            roleName: null,
            roleHierarchy: null,
            joinedAt: row.joined_at,
            probationUntil: row.probation_until ?? null,
            lastActiveAt: row.last_active_at ?? null,
            status: row.status,
            lastRoleChangeAt: row.last_role_change_at ?? null,
            contributionXp: typeof row.contribution_xp === 'string'
                ? Number(row.contribution_xp)
                : Number(row.contribution_xp ?? 0),
            contributionMatches: typeof row.contribution_matches === 'string'
                ? Number(row.contribution_matches)
                : Number(row.contribution_matches ?? 0),
        };
    }
}
exports.ClanMembershipService = ClanMembershipService;
exports.clanMembershipService = new ClanMembershipService();
//# sourceMappingURL=clanMembershipService.js.map