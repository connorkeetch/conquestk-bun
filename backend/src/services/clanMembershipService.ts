import { query, transaction } from '../config/database'
import type {
  ClanApplication,
  ClanApplicationStatus,
  ClanMember,
  ClanMemberStatus,
} from '../types/clans'
import { logClanActivity } from './clanActivityService'
import { clanService } from './clanService'

interface ClanApplicationRow {
  id: string
  clan_id: string
  user_id: string
  status: string
  message?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

const APPLICATION_STATUS_ORDER: Record<ClanApplicationStatus, number> = {
  pending: 0,
  accepted: 1,
  rejected: 2,
  withdrawn: 3,
}

const ACTIVE_MEMBER_STATUSES: ClanMemberStatus[] = ['active']

export class ClanMembershipServiceError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const mapApplication = (row: ClanApplicationRow): ClanApplication => ({
  id: row.id,
  clanId: row.clan_id,
  userId: row.user_id,
  status: row.status as ClanApplicationStatus,
  message: row.message ?? null,
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class ClanMembershipService {
  async applyToClan(
    userId: string,
    clanId: string,
    message?: string | null,
  ): Promise<ClanApplication> {
    const trimmedMessage = message?.trim() ?? null

    const applicationRow = await transaction<ClanApplicationRow>(async (client) => {
      const clanGate = await client.query<{
        recruitment_status: string
        recruitment_policy: string
      }>(
        `SELECT recruitment_status, recruitment_policy FROM clans WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
        [clanId],
      )

      const clanRow = clanGate.rows[0]
      if (!clanRow) {
        throw new ClanMembershipServiceError('CLAN_NOT_FOUND', 'Clan not found or unavailable')
      }

      if (clanRow.recruitment_status === 'closed') {
        throw new ClanMembershipServiceError(
          'CLAN_CLOSED',
          'This clan is not accepting new members at the moment',
        )
      }

      const activeMembership = await client.query(
        `SELECT id FROM clan_members WHERE user_id = $1 AND status = 'active' LIMIT 1`,
        [userId],
      )

      const activeMembershipCount = activeMembership.rowCount ?? 0
      if (activeMembershipCount > 0) {
        throw new ClanMembershipServiceError(
          'ALREADY_IN_CLAN',
          'You are already a member of a clan and cannot apply to another until you leave.',
        )
      }

      const existingApplication = await client.query<ClanApplicationRow>(
        `
          SELECT *
          FROM clan_applications
          WHERE clan_id = $1 AND user_id = $2
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [clanId, userId],
      )

      const lastApplication = existingApplication.rows[0]
      if (lastApplication && lastApplication.status === 'pending') {
        throw new ClanMembershipServiceError(
          'APPLICATION_EXISTS',
          'You already have a pending application for this clan.',
        )
      }

      const newApplication = await client.query<ClanApplicationRow>(
        `
          INSERT INTO clan_applications (clan_id, user_id, status, message)
          VALUES ($1, $2, 'pending', $3)
          RETURNING *
        `,
        [clanId, userId, trimmedMessage],
      )

      await logClanActivity({
        clanId,
        actorUserId: userId,
        actionType: 'application_submitted',
        metadata: { message: trimmedMessage },
        client,
      })

      return newApplication.rows[0]
    })

    return mapApplication(applicationRow)
  }

  private ensureCanReview(status: ClanMemberStatus, permissions?: Record<string, boolean>): void {
    if (!ACTIVE_MEMBER_STATUSES.includes(status)) {
      throw new ClanMembershipServiceError(
        'NOT_ACTIVE',
        'Only active clan members can review applications',
      )
    }

    if (!permissions?.manage_applications) {
      throw new ClanMembershipServiceError(
        'FORBIDDEN',
        'You do not have permission to manage applications',
      )
    }
  }

  async reviewApplication(
    reviewerId: string,
    clanId: string,
    applicationId: string,
    decision: 'accepted' | 'rejected',
  ): Promise<ClanApplication> {
    const updatedApplication = await transaction<ClanApplicationRow>(async (client) => {
      const applicationResult = await client.query<ClanApplicationRow>(
        `SELECT * FROM clan_applications WHERE id = $1 AND clan_id = $2 FOR UPDATE`,
        [applicationId, clanId],
      )

      const application = applicationResult.rows[0]
      if (!application) {
        throw new ClanMembershipServiceError('NOT_FOUND', 'Application not found')
      }

      if (APPLICATION_STATUS_ORDER[application.status as ClanApplicationStatus] > 0) {
        throw new ClanMembershipServiceError(
          'ALREADY_REVIEWED',
          'This application has already been processed',
        )
      }

      const reviewerMembership = await client.query<{
        status: string
        permissions: Record<string, boolean> | string | null
        clan_id: string
      }>(
        `
          SELECT
            m.status,
            r.permissions,
            m.clan_id
          FROM clan_members m
          LEFT JOIN clan_roles r ON r.id = m.role_id
          WHERE m.user_id = $1 AND m.clan_id = $2
          LIMIT 1
        `,
        [reviewerId, application.clan_id],
      )

      const membershipRow = reviewerMembership.rows[0]
      if (!membershipRow) {
        throw new ClanMembershipServiceError(
          'NOT_IN_CLAN',
          'Reviewer must be an active member of the clan',
        )
      }

      const permissions =
        typeof membershipRow.permissions === 'string'
          ? JSON.parse(membershipRow.permissions)
          : (membershipRow.permissions ?? {})

      this.ensureCanReview(membershipRow.status as ClanMemberStatus, permissions)

      const newStatus = decision === 'accepted' ? 'accepted' : 'rejected'

      const result = await client.query<ClanApplicationRow>(
        `
          UPDATE clan_applications
          SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `,
        [newStatus, reviewerId, applicationId],
      )

      if (decision === 'accepted') {
        const memberRoleId = await clanService.getMemberRoleId(
          application.clan_id,
          'Member',
          client,
        )
        await client.query(
          `
            INSERT INTO clan_members (clan_id, user_id, role_id, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (clan_id, user_id)
            DO UPDATE SET status = 'active', role_id = EXCLUDED.role_id, joined_at = CURRENT_TIMESTAMP
          `,
          [application.clan_id, application.user_id, memberRoleId],
        )

        await logClanActivity({
          clanId: application.clan_id,
          actorUserId: reviewerId,
          actionType: 'member_joined',
          metadata: { userId: application.user_id },
          targetId: application.user_id,
          client,
        })
      } else {
        await logClanActivity({
          clanId: application.clan_id,
          actorUserId: reviewerId,
          actionType: 'application_rejected',
          metadata: { userId: application.user_id },
          targetId: application.user_id,
          client,
        })
      }

      return result.rows[0]
    })

    return mapApplication(updatedApplication)
  }

  async getMembershipForUser(userId: string): Promise<ClanMember | null> {
    const result = await query<{
      id: string
      clan_id: string
      user_id: string
      role_id: string | null
      joined_at: string | Date
      probation_until?: string | Date | null
      last_active_at?: string | Date | null
      status: string
      last_role_change_at?: string | Date | null
      contribution_xp?: string | number | null
      contribution_matches?: string | number | null
    }>(
      `
        SELECT * FROM clan_members
        WHERE user_id = $1 AND status = 'active'
        LIMIT 1
      `,
      [userId],
    )

    const row = result.rows[0]
    if (!row) {
      return null
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
      status: row.status as ClanMemberStatus,
      lastRoleChangeAt: row.last_role_change_at ?? null,
      contributionXp:
        typeof row.contribution_xp === 'string'
          ? Number(row.contribution_xp)
          : Number(row.contribution_xp ?? 0),
      contributionMatches:
        typeof row.contribution_matches === 'string'
          ? Number(row.contribution_matches)
          : Number(row.contribution_matches ?? 0),
    }
  }
}

export const clanMembershipService = new ClanMembershipService()
