import type { PoolClient } from 'pg'
import { query, transaction } from '../config/database'
import type {
  Clan,
  ClanAnnouncement,
  ClanCreateRequest,
  ClanDetails,
  ClanListFilters,
  ClanListResult,
  ClanMember,
  ClanMemberStatus,
  ClanMembershipContext,
  ClanPrivacy,
  ClanRecruitmentPolicy,
  ClanRecruitmentStatus,
} from '../types/clans'
import { logClanActivity } from './clanActivityService'
import { clanProgressionService } from './clanProgressionService'

interface ClanRow {
  id: string
  owner_user_id: string
  name: string
  tag: string
  slug: string
  motto?: string | null
  description?: string | null
  crest_asset_url?: string | null
  banner_asset_url?: string | null
  recruitment_policy: string
  recruitment_status: string
  minimum_rank?: number | null
  auto_accept_thresholds?: Record<string, unknown> | string | null
  language?: string | null
  region?: string | null
  time_zone?: string | null
  privacy: string
  total_xp?: string | number | null
  level?: string | number | null
  created_at: string | Date
  updated_at: string | Date
  deleted_at?: string | Date | null
  member_count?: string | number | null
  owner_username?: string | null
}

interface ClanMemberRow {
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
  username?: string | null
  avatar_url?: string | null
  role_name?: string | null
  hierarchy_rank?: number | string | null
}

interface ClanAnnouncementRow {
  id: string
  clan_id: string
  author_user_id: string
  title: string
  body_markdown: string
  pinned: boolean
  created_at: string | Date
  updated_at: string | Date
  expires_at?: string | Date | null
}

interface ClanActivityRow {
  id: string
  clan_id: string
  actor_user_id: string | null
  action_type: string
  metadata: Record<string, unknown> | string | null
  target_id: string | null
  created_at: string | Date
  actor_username: string | null
}

export class ClanServiceError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const DEFAULT_ROLE_DEFINITIONS = [
  {
    name: 'Leader',
    permissions: {
      manage_settings: true,
      manage_applications: true,
      manage_members: true,
      invite_members: true,
      post_announcements: true,
      manage_wars: true,
    },
    hierarchyRank: 100,
    displayOrder: 0,
  },
  {
    name: 'Officer',
    permissions: {
      manage_settings: false,
      manage_applications: true,
      manage_members: true,
      invite_members: true,
      post_announcements: true,
      manage_wars: true,
    },
    hierarchyRank: 75,
    displayOrder: 1,
  },
  {
    name: 'Member',
    permissions: {
      manage_settings: false,
      manage_applications: false,
      manage_members: false,
      invite_members: true,
      post_announcements: true,
      manage_wars: false,
    },
    hierarchyRank: 50,
    displayOrder: 2,
  },
  {
    name: 'Recruit',
    permissions: {
      manage_settings: false,
      manage_applications: false,
      manage_members: false,
      invite_members: false,
      post_announcements: false,
      manage_wars: false,
    },
    hierarchyRank: 25,
    displayOrder: 3,
  },
] as const

export class ClanService {
  private normalizeName(name: string): string {
    const trimmed = name.trim()
    if (trimmed.length < 3) {
      throw new ClanServiceError('INVALID_NAME', 'Clan names must be at least 3 characters')
    }
    if (trimmed.length > 64) {
      throw new ClanServiceError('INVALID_NAME', 'Clan names must be 64 characters or fewer')
    }
    return trimmed
  }

  private normalizeTag(tag: string): string {
    const normalized = tag.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,5}$/.test(normalized)) {
      throw new ClanServiceError(
        'INVALID_TAG',
        'Clan tags must be 2-5 alphanumeric characters with no spaces',
      )
    }
    return normalized
  }

  private normalizeRecruitmentPolicy(policy?: ClanRecruitmentPolicy): ClanRecruitmentPolicy {
    if (!policy) {
      return 'application'
    }
    return policy
  }

  private normalizeSlugBase(name: string): string {
    const lower = name.toLowerCase()
    const slug = lower
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    return slug || `clan-${Date.now()}`
  }

  private mapClan(row: ClanRow): Clan {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      tag: row.tag,
      slug: row.slug,
      motto: row.motto ?? null,
      description: row.description ?? null,
      crestAssetUrl: row.crest_asset_url ?? null,
      bannerAssetUrl: row.banner_asset_url ?? null,
      recruitmentPolicy: row.recruitment_policy as ClanRecruitmentPolicy,
      recruitmentStatus: row.recruitment_status as ClanRecruitmentStatus,
      minimumRank: row.minimum_rank ?? null,
      autoAcceptThresholds:
        typeof row.auto_accept_thresholds === 'string'
          ? JSON.parse(row.auto_accept_thresholds)
          : ((row.auto_accept_thresholds as Record<string, unknown> | null) ?? {}),
      language: row.language ?? null,
      region: row.region ?? null,
      timeZone: row.time_zone ?? null,
      privacy: row.privacy as ClanPrivacy,
      totalXp: typeof row.total_xp === 'string' ? Number(row.total_xp) : Number(row.total_xp ?? 0),
      level: typeof row.level === 'string' ? Number(row.level) : Number(row.level ?? 1),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
      memberCount:
        typeof row.member_count === 'string'
          ? Number(row.member_count)
          : Number(row.member_count ?? 0),
    }
  }

  private mapMember(row: ClanMemberRow): ClanMember {
    return {
      id: row.id,
      clanId: row.clan_id,
      userId: row.user_id,
      roleId: row.role_id,
      roleName: row.role_name ?? null,
      roleHierarchy:
        typeof row.hierarchy_rank === 'string'
          ? Number(row.hierarchy_rank)
          : (row.hierarchy_rank ?? null),
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
      username: row.username ?? null,
      avatarUrl: row.avatar_url ?? null,
    }
  }

  private mapAnnouncement(row: ClanAnnouncementRow): ClanAnnouncement {
    return {
      id: row.id,
      clanId: row.clan_id,
      authorUserId: row.author_user_id,
      title: row.title,
      bodyMarkdown: row.body_markdown,
      pinned: Boolean(row.pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? null,
    }
  }

  private buildListConditions(filters: ClanListFilters, values: unknown[]): string {
    const clauses: string[] = ['c.deleted_at IS NULL']

    if (filters.search) {
      values.push(`%${filters.search.toLowerCase()}%`)
      clauses.push(`(LOWER(c.name) LIKE $${values.length} OR LOWER(c.tag) LIKE $${values.length})`)
    }

    if (filters.region) {
      values.push(filters.region)
      clauses.push(`c.region = $${values.length}`)
    }

    if (filters.recruitmentStatus) {
      values.push(filters.recruitmentStatus)
      clauses.push(`c.recruitment_status = $${values.length}`)
    }

    if (filters.privacy) {
      values.push(filters.privacy)
      clauses.push(`c.privacy = $${values.length}`)
    }

    if (filters.cursor) {
      const [cursorCreatedAt, cursorId] = filters.cursor.split('|')
      const parsedDate = cursorCreatedAt ? new Date(cursorCreatedAt) : null
      if (parsedDate && !Number.isNaN(parsedDate.valueOf())) {
        const createdAtIndex = values.push(parsedDate)
        if (cursorId) {
          const idIndex = values.push(cursorId)
          clauses.push(`(c.created_at, c.id) < ($${createdAtIndex}, $${idIndex})`)
        } else {
          clauses.push(`c.created_at < $${createdAtIndex}`)
        }
      }
    }

    return clauses.join(' AND ')
  }

  private buildListQuery(filters: ClanListFilters, values: unknown[]): string {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50)
    values.push(limit + 1)

    return `
      SELECT
        c.id,
        c.owner_user_id,
        c.name,
        c.tag,
        c.slug,
        c.motto,
        c.description,
        c.crest_asset_url,
        c.banner_asset_url,
        c.recruitment_policy,
        c.recruitment_status,
        c.minimum_rank,
        c.auto_accept_thresholds,
        c.language,
        c.region,
        c.time_zone,
        c.privacy,
        c.total_xp,
        c.level,
        c.created_at,
        c.updated_at,
        c.deleted_at,
        COUNT(cm.id) FILTER (WHERE cm.status = 'active') AS member_count
      FROM clans c
      LEFT JOIN clan_members cm ON cm.clan_id = c.id AND cm.status = 'active'
      WHERE ${this.buildListConditions(filters, values)}
      GROUP BY c.id
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${values.length}
    `
  }

  private async ensureUniqueSlug(baseSlug: string, client: PoolClient): Promise<string> {
    let candidate = baseSlug
    let suffix = 1

    while (true) {
      const result = await client.query('SELECT 1 FROM clans WHERE slug = $1 LIMIT 1', [candidate])
      if (result.rowCount === 0) {
        return candidate
      }
      suffix += 1
      candidate = `${baseSlug}-${suffix}`
    }
  }

  async listClans(filters: ClanListFilters = {}): Promise<ClanListResult> {
    const values: unknown[] = []
    const sql = this.buildListQuery(filters, values)

    const result = await query<ClanRow>(sql, values)
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50)
    const rows = result.rows.slice(0, limit)
    const clans = rows.map((row) => this.mapClan(row))

    let nextCursor: string | null = null
    if (result.rows.length > limit && rows.length > 0) {
      const last = rows[rows.length - 1]
      nextCursor = `${new Date(last.created_at).toISOString()}|${last.id}`
    }

    return { clans, nextCursor }
  }

  async getClanBySlug(slug: string): Promise<ClanDetails | null> {
    const sql = `
      SELECT
        c.*, u.username AS owner_username,
        COUNT(cm.id) FILTER (WHERE cm.status = 'active') AS member_count
      FROM clans c
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN clan_members cm ON cm.clan_id = c.id AND cm.status = 'active'
      WHERE c.slug = $1 AND c.deleted_at IS NULL
      GROUP BY c.id, u.username
    `

    const clanResult = await query<ClanRow>(sql, [slug])
    const row = clanResult.rows[0]
    if (!row) {
      return null
    }

    const membersResult = await query<ClanMemberRow>(
      `
        SELECT
          m.id,
          m.clan_id,
          m.user_id,
          m.role_id,
          m.joined_at,
          m.probation_until,
          m.last_active_at,
          m.status,
          m.last_role_change_at,
          m.contribution_xp,
          m.contribution_matches,
          u.username,
          u.avatar_url,
          r.name AS role_name,
          r.hierarchy_rank
        FROM clan_members m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN clan_roles r ON r.id = m.role_id
        WHERE m.clan_id = $1
        ORDER BY COALESCE(r.hierarchy_rank, 0) DESC, m.joined_at ASC
      `,
      [row.id],
    )

    const announcementsResult = await query<ClanAnnouncementRow>(
      `
        SELECT id, clan_id, author_user_id, title, body_markdown, pinned, created_at, updated_at, expires_at
        FROM clan_announcements
        WHERE clan_id = $1
        ORDER BY pinned DESC, created_at DESC
        LIMIT 5
      `,
      [row.id],
    )

    const activityResult = await query<ClanActivityRow>(
      `
        SELECT
          a.id,
          a.clan_id,
          a.actor_user_id,
          a.action_type,
          a.metadata,
          a.target_id,
          a.created_at,
          u.username AS actor_username
        FROM clan_activity_log a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.clan_id = $1
        ORDER BY a.created_at DESC
        LIMIT 20
      `,
      [row.id],
    )

    const clan = this.mapClan(row)
    const [progression, activeObjectives] = await Promise.all([
      clanProgressionService.getProgressionSummary(row.id),
      clanProgressionService.ensureWeeklyObjectives(row.id),
    ])

    return {
      ...clan,
      ownerUsername: row.owner_username ?? null,
      memberCount:
        typeof row.member_count === 'string'
          ? Number(row.member_count)
          : Number(row.member_count ?? 0),
      members: membersResult.rows.map((memberRow) => this.mapMember(memberRow)),
      recentAnnouncements: announcementsResult.rows.map((announcement) =>
        this.mapAnnouncement(announcement),
      ),
      progression,
      activeObjectives,
      recentActivity: activityResult.rows.map((activity) => this.mapActivityEvent(activity)),
    }
  }

  async getClanById(clanId: string): Promise<Clan | null> {
    const result = await query<ClanRow>(
      'SELECT * FROM clans WHERE id = $1 AND deleted_at IS NULL',
      [clanId],
    )
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return this.mapClan(row)
  }

  async createClan(ownerUserId: string, payload: ClanCreateRequest): Promise<ClanDetails> {
    const name = this.normalizeName(payload.name)
    const tag = this.normalizeTag(payload.tag)
    const recruitmentPolicy = this.normalizeRecruitmentPolicy(payload.recruitmentPolicy)
    const slugBase = this.normalizeSlugBase(name)

    const clanRow = await transaction<ClanRow>(async (client) => {
      const membershipCheck = await client.query(
        `SELECT clan_id FROM clan_members WHERE user_id = $1 AND status = 'active' LIMIT 1`,
        [ownerUserId],
      )
      const activeMembershipCount = membershipCheck.rowCount ?? 0
      if (activeMembershipCount > 0) {
        throw new ClanServiceError(
          'ALREADY_IN_CLAN',
          'You must leave your current clan before creating a new one',
        )
      }

      const slug = await this.ensureUniqueSlug(slugBase, client)

      const insertResult = await client.query<ClanRow>(
        `
          INSERT INTO clans (
            owner_user_id,
            name,
            tag,
            slug,
            motto,
            description,
            crest_asset_url,
            banner_asset_url,
            recruitment_policy,
            recruitment_status,
            minimum_rank,
            auto_accept_thresholds,
            language,
            region,
            time_zone,
            privacy
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
          )
          RETURNING *
        `,
        [
          ownerUserId,
          name,
          tag,
          slug,
          payload.motto ?? null,
          payload.description ?? null,
          payload.crestAssetUrl ?? null,
          payload.bannerAssetUrl ?? null,
          recruitmentPolicy,
          payload.recruitmentStatus ?? 'active',
          payload.minimumRank ?? null,
          JSON.stringify(payload.autoAcceptThresholds ?? {}),
          payload.language ?? null,
          payload.region ?? null,
          payload.timeZone ?? null,
          payload.privacy ?? 'public',
        ],
      )

      const createdClan = insertResult.rows[0]
      const clanId = createdClan.id

      const roleIdMap = new Map<string, string>()

      for (const role of DEFAULT_ROLE_DEFINITIONS) {
        const roleResult = await client.query<{ id: string }>(
          `
            INSERT INTO clan_roles (clan_id, name, permissions, hierarchy_rank, display_order)
            VALUES ($1, $2, $3::jsonb, $4, $5)
            RETURNING id
          `,
          [
            clanId,
            role.name,
            JSON.stringify(role.permissions),
            role.hierarchyRank,
            role.displayOrder,
          ],
        )
        roleIdMap.set(role.name, roleResult.rows[0].id)
      }

      const leaderRoleId = roleIdMap.get('Leader') ?? null

      await client.query(
        `
          INSERT INTO clan_members (clan_id, user_id, role_id, status)
          VALUES ($1, $2, $3, 'active')
        `,
        [clanId, ownerUserId, leaderRoleId],
      )

      await logClanActivity({
        clanId,
        actorUserId: ownerUserId,
        actionType: 'clan_created',
        metadata: { name, tag },
        client,
      })

      return createdClan
    })

    const clanDetails = await this.getClanBySlug(clanRow.slug)
    if (!clanDetails) {
      throw new Error('Failed to load clan after creation')
    }
    return clanDetails
  }

  async getMemberRoleId(
    clanId: string,
    roleName: string,
    client?: PoolClient,
  ): Promise<string | null> {
    const sql = `
      SELECT id FROM clan_roles WHERE clan_id = $1 AND LOWER(name) = LOWER($2)
      ORDER BY hierarchy_rank DESC
      LIMIT 1
    `

    if (client) {
      const result = await client.query<{ id: string }>(sql, [clanId, roleName])
      return result.rows[0]?.id ?? null
    }

    const result = await query<{ id: string }>(sql, [clanId, roleName])
    return result.rows[0]?.id ?? null
  }

  async getActiveMembership(userId: string): Promise<{
    clanId: string
    clanSlug: string
    clanName: string
    roleName?: string | null
    status: ClanMemberStatus
  } | null> {
    const result = await query<{
      clan_id: string
      clan_slug: string
      clan_name: string
      status: string
      role_name?: string | null
    }>(
      `
        SELECT
          m.clan_id,
          c.slug AS clan_slug,
          c.name AS clan_name,
          m.status,
          r.name AS role_name
        FROM clan_members m
        INNER JOIN clans c ON c.id = m.clan_id
        LEFT JOIN clan_roles r ON r.id = m.role_id
        WHERE m.user_id = $1 AND m.status = 'active' AND c.deleted_at IS NULL
        LIMIT 1
      `,
      [userId],
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      clanId: row.clan_id,
      clanSlug: row.clan_slug,
      clanName: row.clan_name,
      roleName: row.role_name ?? null,
      status: row.status as ClanMemberStatus,
    }
  }

  private mapActivityEvent(row: ClanActivityRow): ClanActivityEvent {
    let parsedMetadata: Record<string, unknown> = {}
    if (row.metadata) {
      if (typeof row.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(row.metadata)
        } catch (_error) {
          parsedMetadata = { raw: row.metadata }
        }
      } else {
        parsedMetadata = row.metadata
      }
    }

    return {
      id: row.id,
      clanId: row.clan_id,
      actorUserId: row.actor_user_id,
      actorUsername: row.actor_username,
      actionType: row.action_type,
      metadata: parsedMetadata,
      targetId: row.target_id ?? null,
      createdAt: row.created_at,
    }
  }

  async getActiveMembershipsForUsers(
    userIds: string[],
  ): Promise<Map<string, ClanMembershipContext>> {
    const normalizedIds = Array.from(
      new Set(userIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)),
    )

    if (normalizedIds.length === 0) {
      return new Map()
    }

    const result = await query<{
      user_id: string
      clan_id: string
      clan_slug: string
      clan_name: string
      status: string
      role_name?: string | null
    }>(
      `
        SELECT
          m.user_id,
          m.clan_id,
          c.slug AS clan_slug,
          c.name AS clan_name,
          m.status,
          r.name AS role_name
        FROM clan_members m
        INNER JOIN clans c ON c.id = m.clan_id
        LEFT JOIN clan_roles r ON r.id = m.role_id
        WHERE m.user_id = ANY($1::uuid[]) AND m.status = 'active' AND c.deleted_at IS NULL
      `,
      [normalizedIds],
    )

    const membershipMap = new Map<string, ClanMembershipContext>()
    for (const row of result.rows) {
      if (!row.user_id || membershipMap.has(row.user_id)) {
        continue
      }

      membershipMap.set(row.user_id, {
        clanId: row.clan_id,
        clanSlug: row.clan_slug,
        clanName: row.clan_name,
        roleName: row.role_name ?? null,
        status: row.status as ClanMemberStatus,
      })
    }

    return membershipMap
  }
}

export const clanService = new ClanService()
