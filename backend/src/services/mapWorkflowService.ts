import { randomUUID } from 'node:crypto'
import { query } from '../config/database'
import type {
  AdminNotification,
  CreateMapRequest,
  CustomMap,
  MapDraft,
  MapMetadataPayload,
  MapReviewItem,
  MapStatus,
  MapSubmissionLog,
  MetadataAdjacencyInput,
  MetadataSectorInput,
  MetadataTerritoryInput,
  TerritoryModifierMetadata,
} from '../types/maps'
import { storeBase64Image } from '../utils/imageStorage'
import { logger } from '../utils/logger'
import { adminService } from './adminService'
import { MapNotFoundError, mapPermissionService } from './mapPermissionService'
import { mapService } from './mapService'
import { mapStagingService } from './mapStagingService'
import { notificationDispatcher } from './NotificationDispatcher'
import notificationService from './notificationService'
import {
  buildMapWorkflowNotification,
  type MapWorkflowNotificationInput,
} from './notifications/mapWorkflowNotifications'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

type MapDraftRow = {
  id: string
  user_id: string
  staging_image_id: string | null
  parent_map_id: string | null
  name: string | null
  description: string | null
  map_data: JsonValue | string | null
  territories: JsonValue | string | null
  sectors: JsonValue | string | null
  adjacencies: JsonValue | string | null
  capital_assignments: JsonValue | string | null
  thumbnail_url: string | null
  image_url: string | null
  image_width: number | null
  image_height: number | null
  validation_errors: JsonValue | string | null
  tags: JsonValue | string | null
  draft_status: string | null
  validation_status: string | null
  is_public: boolean | null
  auto_saved_at: string | null
  last_edited_at: string | null
  created_at: string
  updated_at: string
}

type AuditContext = {
  ipAddress?: string
  userAgent?: string
}

type SubmitForReviewOptions = {
  isAdmin?: boolean
}

type ApprovalOptions = {
  notes?: string
  auditContext?: AuditContext
}

type RejectionOptions = {
  reason: string
  auditContext?: AuditContext
}

type ArchiveOptions = {
  auditContext?: AuditContext
}

type ToggleFeaturedOptions = {
  auditContext?: AuditContext
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isRecordOfStringArray = (value: unknown): value is Record<string, string[]> =>
  isRecord(value) &&
  Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((id) => typeof id === 'string'),
  )

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return false
}

const normalizeTerritoryModifiers = (value: unknown): Record<string, TerritoryModifierMetadata> => {
  if (!isRecord(value)) {
    return {}
  }

  const modifiers: Record<string, TerritoryModifierMetadata> = {}

  for (const [territoryId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue

    const modifier: TerritoryModifierMetadata = {
      templateId: asString(raw.templateId) ?? asString(raw.template_id),
      name: asString(raw.name) ?? undefined,
      icon: asString(raw.icon) ?? undefined,
      color: asString(raw.color) ?? undefined,
      defenseBonus: toNumber(raw.defenseBonus ?? raw.defense_bonus, 0),
      attackBonus: toNumber(raw.attackBonus ?? raw.attack_bonus, 0),
      troopBonus: toNumber(
        raw.troopBonus ?? raw.troop_generation_bonus ?? raw.troopGenerationBonus,
        0,
      ),
      movementRestriction: toBoolean(
        raw.movementRestriction ?? raw.movement_restriction ?? raw.movementrestriction,
      ),
      supplyLineBonus: toBoolean(
        raw.supplyLineBonus ?? raw.supply_line_bonus ?? raw.supplylinebonus,
      ),
      notes: asString(raw.notes) ?? undefined,
    }

    modifiers[territoryId] = modifier
  }

  return modifiers
}

const hasTerritoryModifiers = (
  value: Record<string, TerritoryModifierMetadata> | undefined,
): boolean => !!value && Object.keys(value).length > 0

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

const pickFirstFiniteNumber = (candidates: unknown[]): number | null => {
  for (const candidate of candidates) {
    const numeric = toFiniteNumberOrNull(candidate)
    if (numeric !== null) {
      return numeric
    }
  }
  return null
}

export class MapWorkflowService {
  /**
   * Save a map draft for later editing
   */
  async saveDraft(userId: string, draftData: Partial<MapDraft>): Promise<MapDraft> {
    try {
      const existingDraft = draftData.id
        ? await query<MapDraftRow>('SELECT * FROM map_drafts WHERE id = $1 AND user_id = $2', [
            draftData.id,
            userId,
          ])
        : null

      if (existingDraft?.rows[0]) {
        // Update existing draft
        const result = await query<MapDraftRow>(
          `
          UPDATE map_drafts 
          SET name = $1, description = $2, map_data = $3, territories = $4, 
              sectors = $5, adjacencies = $6, thumbnail_url = $7,
              staging_image_id = $8, parent_map_id = $9, 
              image_url = $10, image_width = $11, image_height = $12,
              capital_assignments = $13, tags = $14, is_public = $15,
              auto_saved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
              last_edited_at = CURRENT_TIMESTAMP
          WHERE id = $16 AND user_id = $17
          RETURNING *
        `,
          [
            draftData.name,
            draftData.description,
            JSON.stringify(draftData.data || {}),
            JSON.stringify(draftData.territories || []),
            JSON.stringify(
              (draftData as unknown as { sectors?: unknown[]; continents?: unknown[] }).sectors ||
                (draftData as unknown as { continents?: unknown[] }).continents ||
                [],
            ),
            JSON.stringify(draftData.adjacencies || []),
            draftData.thumbnailUrl,
            draftData.stagingImageId || null,
            draftData.parentMapId || null,
            draftData.imageUrl,
            draftData.imageWidth,
            draftData.imageHeight,
            JSON.stringify(draftData.capitalAssignments || {}),
            JSON.stringify(draftData.tags || []),
            draftData.isPublic || false,
            draftData.id,
            userId,
          ],
        )

        return this.formatDraftRow(result.rows[0])
      }

      // Create new draft - check quota first
      const quotaCheck = await query(
        `SELECT COUNT(*) as count FROM (
          SELECT id FROM map_images_staging WHERE user_id = $1 AND is_deleted = FALSE
          UNION ALL
          SELECT id FROM map_drafts WHERE user_id = $1 AND draft_status != 'submitted'
          UNION ALL
          SELECT id FROM map_submissions WHERE user_id = $1 AND review_status = 'pending'
        ) AS items`,
        [userId],
      )

      const userCheck = await query('SELECT is_admin FROM users WHERE id = $1', [userId])
      const isAdmin = userCheck.rows[0]?.is_admin
      const currentCount = parseInt(quotaCheck.rows[0]?.count || '0', 10)

      if (!isAdmin && currentCount >= 5) {
        throw new Error('Quota exceeded: Maximum 5 unpublished maps/images allowed')
      }

      const result = await query<MapDraftRow>(
        `
          INSERT INTO map_drafts (
            user_id, staging_image_id, parent_map_id, name, description, 
            map_data, territories, sectors, adjacencies, thumbnail_url,
            image_url, image_width, image_height, capital_assignments,
            tags, is_public, draft_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *
        `,
        [
          userId,
          draftData.stagingImageId || null,
          draftData.parentMapId || null,
          draftData.name,
          draftData.description,
          JSON.stringify(draftData.data || {}),
          JSON.stringify(draftData.territories || []),
          JSON.stringify(
            (draftData as unknown as { sectors?: unknown[]; continents?: unknown[] }).sectors ||
              (draftData as unknown as { continents?: unknown[] }).continents ||
              [],
          ),
          JSON.stringify(draftData.adjacencies || []),
          draftData.thumbnailUrl,
          draftData.imageUrl,
          draftData.imageWidth,
          draftData.imageHeight,
          JSON.stringify(draftData.capitalAssignments || {}),
          JSON.stringify(draftData.tags || []),
          draftData.isPublic || false,
          'editing',
        ],
      )

      return this.formatDraftRow(result.rows[0])
    } catch (error) {
      logger.error('Error saving map draft:', error)
      throw error
    }
  }

  /**
   * Get user's drafts
   */
  async getUserDrafts(userId: string): Promise<MapDraft[]> {
    try {
      const result = await query<MapDraftRow>(
        `
        SELECT * FROM map_drafts 
        WHERE user_id = $1 AND draft_status != 'submitted'
        ORDER BY updated_at DESC
      `,
        [userId],
      )

      return (result.rows || []).map((row) => this.formatDraftRow(row))
    } catch (error) {
      logger.error('Error fetching user drafts:', error)
      throw error
    }
  }

  async getDraftById(draftId: string, userId: string): Promise<MapDraft | null> {
    try {
      const result = await query<MapDraftRow>(
        'SELECT * FROM map_drafts WHERE id = $1 AND user_id = $2',
        [draftId, userId],
      )

      const draft = result.rows?.[0]
      return draft ? this.formatDraftRow(draft) : null
    } catch (error) {
      logger.error('Error fetching draft:', error)
      throw error
    }
  }

  async publishDraft(draftId: string, userId: string): Promise<CustomMap> {
    try {
      const result = await query<MapDraftRow>(
        'SELECT * FROM map_drafts WHERE id = $1 AND user_id = $2',
        [draftId, userId],
      )

      const draftRow = result.rows?.[0]
      if (!draftRow) {
        throw new Error('Draft not found or access denied')
      }

      const draft = this.formatDraftRow(draftRow)
      const mapPayload = await this.buildMapPayloadFromDraft(draft)

      const createdMap = await mapService.createMap(userId, mapPayload)

      if (draft.stagingImageId) {
        try {
          await mapStagingService.deleteStagingImage(draft.userId, draft.stagingImageId, true)
        } catch (assetError) {
          const message = assetError instanceof Error ? assetError.message : String(assetError)
          logger.warn('Failed to queue staging image for purge after publish', {
            draftId,
            stagingImageId: draft.stagingImageId,
            userId: draft.userId,
            error: message,
          })
        }
      }

      await query(
        `
        UPDATE map_drafts
        SET draft_status = 'submitted',
            parent_map_id = $1,
            image_url = $2,
            image_width = $3,
            image_height = $4,
            staging_image_id = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `,
        [
          createdMap.id,
          mapPayload.imageUrl || null,
          mapPayload.imageWidth || null,
          mapPayload.imageHeight || null,
          draftId,
        ],
      )

      await this.submitForReview(createdMap.id, userId)

      return createdMap
    } catch (error) {
      logger.error('Error publishing draft:', error)
      throw error
    }
  }

  /**
   * Submit a map for review
   */
  async submitForReview(
    mapId: string,
    userId: string,
    options: SubmitForReviewOptions = {},
  ): Promise<void> {
    try {
      await mapPermissionService.assertCanEditMap(mapId, {
        userId,
        isAdmin: options.isAdmin,
      })

      const updateResult = await query(
        `
        UPDATE maps 
        SET status = 'pending_review', submitted_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
        [mapId],
      )

      if (updateResult.rowCount === 0) {
        throw new MapNotFoundError()
      }

      // Create approval request tied to the latest version
      const v = await query<{ id: string }>(
        `SELECT id FROM map_versions WHERE map_id = $1 ORDER BY version_number DESC, created_at DESC LIMIT 1`,
        [mapId],
      )
      const versionId = v.rows[0]?.id
      if (versionId) {
        await query(
          `INSERT INTO map_approval_requests (version_id, requester_id, submission_notes, priority_level)
           VALUES ($1, $2, $3, 'normal')`,
          [versionId, userId, 'Submitted via mapWorkflowService'],
        )
      }

      // Create admin notification
      const mapNameResult = await query<{ name: string }>('SELECT name FROM maps WHERE id = $1', [
        mapId,
      ])
      const submittedMapName = mapNameResult.rows[0]?.name ?? 'Submitted map'

      await this.createAdminNotification({
        type: 'map_submission',
        title: 'New Map Submission',
        message: `"${submittedMapName}" was submitted for review`,
        data: { mapId, userId, mapName: submittedMapName },
      })

      // Log the action
      await this.logMapAction(mapId, 'submitted', userId)
    } catch (error) {
      logger.error('Error submitting map for review:', error)
      throw error
    }
  }

  /**
   * Approve a map
   */
  async approveMap(mapId: string, adminId: string, options: ApprovalOptions = {}): Promise<void> {
    const { notes, auditContext } = options

    try {
      const beforeState = await this.getMapModerationSnapshot(mapId)
      if (!beforeState) {
        throw new MapNotFoundError()
      }

      // Guardrail: ensure the map is playable before approving
      const validation = await mapService.validateMapPlayable(mapId)
      if (!validation.isValid) {
        throw new Error(
          `Map cannot be approved; playability validation failed: ${validation.errors.join('; ')}`,
        )
      }

      await query(
        `
        UPDATE maps 
        SET status = 'approved', 
            is_public = TRUE,
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = $1,
            review_notes = $2
        WHERE id = $3
      `,
        [adminId, notes ?? null, mapId],
      )

      // Mark any pending approval request for this map as approved
      await query(
        `
          UPDATE map_approval_requests ar
          SET decision = 'approved', moderator_feedback = COALESCE($2, moderator_feedback), review_completed_at = CURRENT_TIMESTAMP, assigned_moderator_id = COALESCE(assigned_moderator_id, $1)
          FROM map_versions v
          WHERE ar.version_id = v.id AND v.map_id = $3 AND ar.decision IS NULL
        `,
        [adminId, notes ?? null, mapId],
      )

      await this.logMapAction(mapId, 'approved', adminId, notes ? { notes } : undefined)

      const afterState = await this.getMapModerationSnapshot(mapId)

      await adminService.logAdminAction(
        adminId,
        'map_approved',
        {
          mapId,
          notes,
          before: beforeState,
          after: afterState,
        },
        'map',
        mapId,
        auditContext?.ipAddress,
        auditContext?.userAgent,
      )

      // Notify the map creator
      const mapInfo = await query<{ creator_id: string; name: string }>(
        'SELECT creator_id, name FROM maps WHERE id = $1',
        [mapId],
      )
      const creatorId = mapInfo.rows?.[0]?.creator_id
      const mapName = mapInfo.rows?.[0]?.name ?? 'Your map'

      if (creatorId) {
        await notificationService.createInAppNotification(creatorId, {
          type: 'map_approved',
          title: 'Map approved',
          message: `"${mapName}" has been approved and is ready for players.`,
          data: { mapId },
          actionUrl: `/maps/${mapId}`,
          actionLabel: 'View map',
          sendPush: true,
          pushPayload: {
            title: '✅ Map approved',
            body: `"${mapName}" is now approved.`,
            data: { url: `/maps/${mapId}` },
          },
        })
      }

      await this.dispatchMapWorkflowNotification({
        status: 'approved',
        mapId,
        mapName,
        adminUserId: adminId,
        creatorUserId: creatorId ?? undefined,
        notes,
      })
    } catch (error) {
      logger.error('Error approving map:', error)
      throw error
    }
  }

  /**
   * Reject a map with reason
   */
  async rejectMap(mapId: string, adminId: string, options: RejectionOptions): Promise<void> {
    const { reason, auditContext } = options

    if (!reason) {
      throw new Error('Rejection reason is required')
    }

    try {
      const beforeState = await this.getMapModerationSnapshot(mapId)
      if (!beforeState) {
        throw new MapNotFoundError()
      }

      await query(
        `
        UPDATE maps 
        SET status = 'rejected', 
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = $1,
            rejection_reason = $2
        WHERE id = $3
      `,
        [adminId, reason, mapId],
      )

      await query(
        `
          UPDATE map_approval_requests ar
          SET decision = 'rejected', moderator_feedback = $2, review_completed_at = CURRENT_TIMESTAMP, assigned_moderator_id = COALESCE(assigned_moderator_id, $1)
          FROM map_versions v
          WHERE ar.version_id = v.id AND v.map_id = $3 AND ar.decision IS NULL
        `,
        [adminId, reason, mapId],
      )

      await this.logMapAction(mapId, 'rejected', adminId, { reason })

      const afterState = await this.getMapModerationSnapshot(mapId)

      await adminService.logAdminAction(
        adminId,
        'map_rejected',
        {
          mapId,
          reason,
          before: beforeState,
          after: afterState,
        },
        'map',
        mapId,
        auditContext?.ipAddress,
        auditContext?.userAgent,
      )

      // Notify the map creator
      const mapInfo = await query<{ creator_id: string; name: string }>(
        'SELECT creator_id, name FROM maps WHERE id = $1',
        [mapId],
      )
      const creatorId = mapInfo.rows?.[0]?.creator_id
      const mapName = mapInfo.rows?.[0]?.name ?? 'Your map'

      if (creatorId) {
        await notificationService.createInAppNotification(creatorId, {
          type: 'map_rejected',
          title: 'Map requires changes',
          message: `"${mapName}" was rejected: ${reason}`,
          data: { mapId, reason },
          actionUrl: `/maps/${mapId}`,
          actionLabel: 'View feedback',
          sendPush: true,
          pushPayload: {
            title: '❗ Map review update',
            body: `"${mapName}" needs changes: ${reason}`,
            data: { url: `/maps/${mapId}` },
          },
        })
      }

      await this.dispatchMapWorkflowNotification({
        status: 'rejected',
        mapId,
        mapName,
        adminUserId: adminId,
        creatorUserId: creatorId ?? undefined,
        rejectionReason: reason,
      })
    } catch (error) {
      logger.error('Error rejecting map:', error)
      throw error
    }
  }

  /**
   * Edit an existing map (creates new version)
   */
  async editMap(mapId: string, userId: string, isAdmin: boolean): Promise<void> {
    try {
      const map = await query('SELECT * FROM maps WHERE id = $1', [mapId])
      const mapData = map.rows?.[0]

      if (!mapData) throw new Error('Map not found')

      // Check permissions
      if (mapData.creator_id !== userId && !isAdmin) {
        throw new Error('Unauthorized to edit this map')
      }

      // Save current version to history
      await query(
        `
        INSERT INTO map_versions (map_id, version_number, data, territories, sectors, adjacencies, change_summary, changed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          mapId,
          mapData.version || 1,
          JSON.stringify(mapData),
          mapData.territories,
          (mapData as unknown as { sectors?: unknown[] }).sectors,
          mapData.adjacencies,
          'Version before edit',
          userId,
        ],
      )

      // Increment version
      await query('UPDATE maps SET version = version + 1 WHERE id = $1', [mapId])

      // If not admin and map was approved, reset to pending review
      if (!isAdmin && mapData.status === 'approved') {
        await query(
          `
          UPDATE maps 
          SET status = 'pending_review', 
              submitted_at = CURRENT_TIMESTAMP,
              parent_map_id = $1
          WHERE id = $2
        `,
          [mapId, mapId],
        )

        await this.submitForReview(mapId, userId, { isAdmin })
      }

      await this.logMapAction(mapId, 'edited', userId)
    } catch (error) {
      logger.error('Error editing map:', error)
      throw error
    }
  }

  /**
   * Get maps pending review
   */
  async getPendingReviews(): Promise<MapReviewItem[]> {
    try {
      const result = await query(
        `
        SELECT 
          ar.id,
          v.map_id,
          m.name as map_name,
          m.description as map_description,
          m.creator_id,
          u.username as submitter_name,
          ar.assigned_moderator_id,
          ar.created_at,
          ar.review_completed_at,
          ar.decision
        FROM map_approval_requests ar
        JOIN map_versions v ON ar.version_id = v.id
        JOIN maps m ON v.map_id = m.id
        JOIN users u ON ar.requester_id = u.id
        WHERE ar.decision IS NULL
        ORDER BY ar.created_at ASC
        `,
      )

      return result.rows.map((row) => ({
        id: row.id,
        mapId: row.map_id,
        submittedBy: row.creator_id,
        submitterName: row.submitter_name,
        status: row.decision
          ? (row.decision as 'approved' | 'rejected' | 'needs_changes')
          : 'pending',
        priority: 0,
        assignedTo: row.assigned_moderator_id ?? undefined,
        submittedAt: row.created_at,
        reviewedAt: row.review_completed_at ?? undefined,
      }))
    } catch (error) {
      logger.error('Error fetching pending reviews:', error)
      throw error
    }
  }

  /**
   * Get admin notifications
   */
  async getAdminNotifications(adminId?: string, unreadOnly = false): Promise<AdminNotification[]> {
    try {
      let sql = 'SELECT * FROM admin_notifications WHERE 1=1'
      const params: Array<string> = []

      if (adminId) {
        params.push(adminId)
        sql += ` AND (admin_id = $${params.length} OR admin_id IS NULL)`
      }

      if (unreadOnly) {
        sql += ' AND is_read = FALSE'
      }

      sql += ' ORDER BY created_at DESC LIMIT 50'

      const result = await query(sql, params)
      return (result.rows as AdminNotification[]) || []
    } catch (error) {
      logger.error('Error fetching admin notifications:', error)
      throw error
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: string, adminId: string): Promise<void> {
    try {
      await query(
        `
        UPDATE admin_notifications 
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND (admin_id = $2 OR admin_id IS NULL)
      `,
        [notificationId, adminId],
      )
    } catch (error) {
      logger.error('Error marking notification as read:', error)
      throw error
    }
  }

  private safeJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch (error) {
        logger.warn('Failed to parse JSON field', { value, error })
        return fallback
      }
    }
    if (isRecord(value) || Array.isArray(value)) {
      return value as T
    }
    return fallback
  }

  private formatDraftRow(row: MapDraftRow): MapDraft {
    const mapData = this.safeJson<Record<string, unknown>>(row.map_data, {})
    const mapDataTerritories = mapData.territories
    const mapDataGroups = mapData as unknown as { sectors?: unknown[]; continents?: unknown[] }
    const mapDataSectors = mapDataGroups.sectors ?? mapDataGroups.continents
    const mapDataAdjacencies = mapData.adjacencies
    const mapDataCapitalAssignments = mapData.capitalAssignments
    const mapDataTags = mapData.tags
    const mapDataTerritoryModifiers =
      mapData.territoryModifiers ?? (mapData as Record<string, unknown>).territory_modifiers
    const fallbackImageWidth = asNumber(mapData.imageWidth)
    const fallbackImageHeight = asNumber(mapData.imageHeight)
    const territories = this.safeJson<unknown[]>(
      row.territories,
      Array.isArray(mapDataTerritories) ? mapDataTerritories : [],
    )
    const sectors = this.safeJson<unknown[]>(
      row.sectors,
      Array.isArray(mapDataSectors) ? mapDataSectors : [],
    )
    const adjacencies = this.safeJson<unknown[]>(
      row.adjacencies,
      Array.isArray(mapDataAdjacencies) ? mapDataAdjacencies : [],
    )
    const capitalAssignments = this.safeJson<Record<string, string[]>>(
      row.capital_assignments,
      isRecordOfStringArray(mapDataCapitalAssignments) ? mapDataCapitalAssignments : {},
    )
    const tags = this.safeJson<string[]>(row.tags, toStringArray(mapDataTags))
    const validationErrors = this.safeJson<unknown[]>(row.validation_errors, [])
    const territoryModifiers = normalizeTerritoryModifiers(mapDataTerritoryModifiers)

    return {
      id: row.id,
      userId: row.user_id,
      stagingImageId: row.staging_image_id || undefined,
      parentMapId: row.parent_map_id || undefined,
      name: row.name || 'Untitled Map',
      description: row.description || undefined,
      data: mapData,
      territories,
      sectors,
      adjacencies,
      capitalAssignments,
      territoryModifiers: hasTerritoryModifiers(territoryModifiers)
        ? territoryModifiers
        : undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      imageUrl: row.image_url || undefined,
      imageWidth: row.image_width ?? fallbackImageWidth,
      imageHeight: row.image_height ?? fallbackImageHeight,
      draftStatus: row.draft_status || 'editing',
      validationStatus: row.validation_status || undefined,
      validationErrors,
      isPublic: row.is_public ?? false,
      tags,
      autoSavedAt: row.auto_saved_at ? new Date(row.auto_saved_at) : undefined,
      lastEditedAt: row.last_edited_at ? new Date(row.last_edited_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private buildCapitalTerritories(assignments: Record<string, string[]> | undefined) {
    if (!assignments) return undefined

    const result: Record<string, number[]> = {}

    for (const [playerCount, territories] of Object.entries(assignments)) {
      const count = Number(playerCount)
      if (Number.isNaN(count) || !Array.isArray(territories)) continue

      for (const territoryId of territories) {
        if (!territoryId) continue
        if (!result[territoryId]) {
          result[territoryId] = []
        }
        result[territoryId].push(count)
      }
    }

    return Object.keys(result).length > 0 ? result : undefined
  }

  private normalizeMetadataTerritories(
    territories: unknown[],
    widthInput: number | undefined,
    heightInput: number | undefined,
  ): MetadataTerritoryInput[] {
    const width = Number.isFinite(widthInput) && widthInput && widthInput > 0 ? widthInput : 1
    const height = Number.isFinite(heightInput) && heightInput && heightInput > 0 ? heightInput : 1

    return territories
      .map((entry) => {
        if (!isRecord(entry)) {
          return null
        }

        const normalizedXCandidate = pickFirstFiniteNumber([
          entry.normalizedX,
          entry.normalized_x,
          (entry.armyPositionNormalized as { x?: unknown } | undefined)?.x,
          (entry.army_position_normalized as { x?: unknown } | undefined)?.x,
        ])
        const normalizedYCandidate = pickFirstFiniteNumber([
          entry.normalizedY,
          entry.normalized_y,
          (entry.armyPositionNormalized as { y?: unknown } | undefined)?.y,
          (entry.army_position_normalized as { y?: unknown } | undefined)?.y,
        ])

        const pixelXCandidate = pickFirstFiniteNumber([
          entry.x,
          entry.center_x,
          (entry.armyPosition as { x?: unknown } | undefined)?.x,
          (entry.army_position as { x?: unknown } | undefined)?.x,
        ])
        const pixelYCandidate = pickFirstFiniteNumber([
          entry.y,
          entry.center_y,
          (entry.armyPosition as { y?: unknown } | undefined)?.y,
          (entry.army_position as { y?: unknown } | undefined)?.y,
        ])

        let normalizedX = normalizedXCandidate !== null ? clamp01(normalizedXCandidate) : null
        let normalizedY = normalizedYCandidate !== null ? clamp01(normalizedYCandidate) : null

        if (normalizedX === null && pixelXCandidate !== null) {
          normalizedX = clamp01(pixelXCandidate / width)
        }
        if (normalizedY === null && pixelYCandidate !== null) {
          normalizedY = clamp01(pixelYCandidate / height)
        }

        if (normalizedX === null) normalizedX = 0
        if (normalizedY === null) normalizedY = 0

        const pixelX = clamp01(normalizedX) * width
        const pixelY = clamp01(normalizedY) * height

        const base: MetadataTerritoryInput = {
          id: asString(entry.id) ?? undefined,
          name: asString(entry.name) ?? undefined,
          boundaryCoords: Array.isArray(entry.boundaryCoords)
            ? (entry.boundaryCoords as MetadataTerritoryInput['boundaryCoords'])
            : undefined,
          sectorId:
            asString((entry as unknown as { sectorId?: string }).sectorId) ??
            asString((entry as unknown as { continentId?: string }).continentId) ??
            undefined,
          x: pixelX,
          y: pixelY,
          normalizedX,
          normalizedY,
          isCapital: entry.isCapital === true,
          armyPosition: {
            x: pixelX,
            y: pixelY,
          },
          armyPositionNormalized: {
            x: normalizedX,
            y: normalizedY,
          },
          connections: Array.isArray(entry.connections)
            ? (entry.connections as string[])
            : undefined,
        }

        return base
      })
      .filter((territory): territory is MetadataTerritoryInput => territory !== null)
  }

  private async buildMapPayloadFromDraft(
    draft: MapDraft,
  ): Promise<CreateMapRequest & { metadata?: MapMetadataPayload }> {
    const data: Record<string, unknown> =
      typeof draft.data === 'object' && draft.data !== null
        ? (draft.data as Record<string, unknown>)
        : {}

    const dataTerritories = data.territories
    const groups = data as unknown as { sectors?: unknown[]; continents?: unknown[] }
    const dataSectors = groups.sectors ?? groups.continents
    const dataAdjacencies = data.adjacencies
    const dataCapitalAssignments = data.capitalAssignments
    const dataTags = data.tags
    const inferredTags = toStringArray(dataTags)

    const territories =
      Array.isArray(draft.territories) && draft.territories.length > 0
        ? draft.territories
        : Array.isArray(dataTerritories)
          ? (dataTerritories as unknown[])
          : []

    const draftGroups = draft as unknown as { sectors?: unknown[] }
    const sectors =
      Array.isArray(draftGroups.sectors) && (draftGroups.sectors?.length ?? 0) > 0
        ? (draftGroups.sectors as unknown[])
        : Array.isArray(dataSectors)
          ? (dataSectors as unknown[])
          : []

    const adjacencies =
      Array.isArray(draft.adjacencies) && draft.adjacencies.length > 0
        ? draft.adjacencies
        : Array.isArray(dataAdjacencies)
          ? (dataAdjacencies as unknown[])
          : []

    const capitalAssignments: Record<string, string[]> =
      draft.capitalAssignments && Object.keys(draft.capitalAssignments).length > 0
        ? draft.capitalAssignments
        : isRecordOfStringArray(dataCapitalAssignments)
          ? dataCapitalAssignments
          : ({} as Record<string, string[]>)

    let imageUrl = draft.imageUrl
    let imageWidth = draft.imageWidth || asNumber(data.imageWidth) || 800
    let imageHeight = draft.imageHeight || asNumber(data.imageHeight) || 600

    const imagePayload = isRecord(data.image) ? (data.image as Record<string, unknown>) : null
    const imagePayloadData = imagePayload ? asString(imagePayload.data) : undefined

    if (imagePayload && imagePayloadData) {
      const stored = await storeBase64Image(imagePayloadData, {
        mimeType: asString(imagePayload.mimeType),
        preferredFilename: asString(imagePayload.filename),
      })
      imageUrl = stored.relativeUrl
      imageWidth = stored.width
      imageHeight = stored.height
    } else if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      const parsed = this.parseDataUrl(imageUrl)
      if (parsed) {
        const stored = await storeBase64Image(parsed.data, {
          mimeType: parsed.mimeType,
        })
        imageUrl = stored.relativeUrl
        imageWidth = stored.width
        imageHeight = stored.height
      }
    }

    const metadataRecord = isRecord(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined

    const minPlayers = asNumber(data.minPlayers) ?? asNumber(metadataRecord?.minPlayers) ?? 2
    const maxPlayers = asNumber(data.maxPlayers) ?? asNumber(metadataRecord?.maxPlayers) ?? 6

    const dataModifiers = normalizeTerritoryModifiers(
      (data as { territoryModifiers?: unknown; territory_modifiers?: unknown })
        .territoryModifiers ??
        (data as { territoryModifiers?: unknown; territory_modifiers?: unknown })
          .territory_modifiers,
    )

    const metadataModifiers = normalizeTerritoryModifiers(
      (metadataRecord as { territoryModifiers?: unknown; territory_modifiers?: unknown })
        ?.territoryModifiers ??
        (metadataRecord as { territoryModifiers?: unknown; territory_modifiers?: unknown })
          ?.territory_modifiers,
    )

    const draftModifiers = normalizeTerritoryModifiers(draft.territoryModifiers)

    const territoryModifiers = hasTerritoryModifiers(draftModifiers)
      ? draftModifiers
      : hasTerritoryModifiers(metadataModifiers)
        ? metadataModifiers
        : dataModifiers

    const canvasWidth = asNumber(data.width) ?? asNumber(data.mapWidth) ?? imageWidth ?? 1920
    const canvasHeight = asNumber(data.height) ?? asNumber(data.mapHeight) ?? imageHeight ?? 1080

    const normalizedTerritories = this.normalizeMetadataTerritories(
      Array.isArray(territories) ? (territories as unknown[]) : [],
      canvasWidth,
      canvasHeight,
    )

    const metadata: MapMetadataPayload = {
      territories: normalizedTerritories,
      sectors: sectors as MetadataSectorInput[],
      adjacencies: adjacencies as MetadataAdjacencyInput[],
      capitalAssignments,
      width: canvasWidth,
      height: canvasHeight,
    }

    if (hasTerritoryModifiers(territoryModifiers)) {
      metadata.territoryModifiers = territoryModifiers
    }

    return {
      name: draft.name || asString(data.name) || 'Untitled Map',
      description: draft.description ?? asString(data.description) ?? undefined,
      isPublic: Boolean(draft.isPublic ?? data.isPublic),
      tags:
        Array.isArray(draft.tags) && draft.tags.length > 0
          ? draft.tags
          : inferredTags.length > 0
            ? inferredTags
            : [],
      imageUrl: imageUrl ?? undefined,
      imageWidth,
      imageHeight,
      minPlayers,
      maxPlayers,
      metadata,
      capitalTerritories: this.buildCapitalTerritories(capitalAssignments),
    }
  }

  private parseDataUrl(dataUrl: string): { data: string; mimeType?: string } | null {
    const [header, data] = dataUrl.split(',')
    if (!header || !data) return null

    const mimeMatch = header.match(/^data:(.+);base64$/)
    const mimeType = mimeMatch?.[1]

    return {
      data,
      mimeType,
    }
  }

  /**
   * Archive a map
   */
  async archiveMap(mapId: string, adminId: string, options: ArchiveOptions = {}): Promise<void> {
    try {
      const beforeState = await this.getMapModerationSnapshot(mapId)
      if (!beforeState) {
        throw new MapNotFoundError()
      }

      await query(
        `
        UPDATE maps 
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
        [mapId],
      )

      await this.logMapAction(mapId, 'archived', adminId)

      const afterState = await this.getMapModerationSnapshot(mapId)

      await adminService.logAdminAction(
        adminId,
        'map_archived',
        {
          mapId,
          before: beforeState,
          after: afterState,
        },
        'map',
        mapId,
        options.auditContext?.ipAddress,
        options.auditContext?.userAgent,
      )
    } catch (error) {
      logger.error('Error archiving map:', error)
      throw error
    }
  }

  /**
   * Feature/unfeature a map
   */
  async toggleFeatured(
    mapId: string,
    adminId: string,
    options: ToggleFeaturedOptions = {},
  ): Promise<{ isFeatured: boolean }> {
    try {
      const result = await query('SELECT is_featured FROM maps WHERE id = $1', [mapId])
      const row = result.rows?.[0]
      if (!row) {
        throw new MapNotFoundError()
      }

      const isCurrentlyFeatured = Boolean(row.is_featured)
      const nextFeatured = !isCurrentlyFeatured

      await query(
        `
        UPDATE maps 
        SET is_featured = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [nextFeatured, mapId],
      )

      await this.logMapAction(mapId, nextFeatured ? 'featured' : 'unfeatured', adminId)

      await adminService.logAdminAction(
        adminId,
        nextFeatured ? 'map_featured' : 'map_unfeatured',
        {
          mapId,
          before: { is_featured: isCurrentlyFeatured },
          after: { is_featured: nextFeatured },
        },
        'map',
        mapId,
        options.auditContext?.ipAddress,
        options.auditContext?.userAgent,
      )

      return { isFeatured: nextFeatured }
    } catch (error) {
      logger.error('Error toggling map featured status:', error)
      throw error
    }
  }

  /**
   * Helper: Dispatch map workflow notification via external channels
   */
  private async dispatchMapWorkflowNotification(
    input: MapWorkflowNotificationInput,
  ): Promise<void> {
    try {
      const event = buildMapWorkflowNotification(input)
      await notificationDispatcher.dispatch({
        ...event,
        id: randomUUID(),
      })
    } catch (error) {
      logger.error('Error dispatching map workflow notification', {
        error,
        mapId: input.mapId,
        status: input.status,
      })
    }
  }

  /**
   * Helper: Create admin notification
   */
  private async createAdminNotification(notification: Partial<AdminNotification>): Promise<void> {
    try {
      const metadata = (notification.data ?? {}) as Record<string, unknown>

      const result = await query<{ id: string; admin_id: string | null; created_at: Date }>(
        `
        INSERT INTO admin_notifications (admin_id, type, title, message, data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, admin_id, created_at
      `,
        [
          notification.adminId ?? null,
          notification.type ?? 'admin',
          notification.title ?? 'Admin notification',
          notification.message ?? '',
          JSON.stringify(metadata),
        ],
      )

      const adminNotification = result.rows[0]
      if (!adminNotification) {
        return
      }

      const recipients = notification.adminId
        ? [notification.adminId]
        : await adminService.getActiveAdminUserIds()

      if (recipients.length > 0) {
        await Promise.allSettled(
          recipients.map((userId) =>
            notificationService.createInAppNotification(userId, {
              type: notification.type ?? 'admin',
              title: notification.title ?? 'Admin notification',
              message: notification.message ?? 'You have a new admin notification.',
              data: {
                ...metadata,
                adminNotificationId: adminNotification.id,
              },
              sendPush: false,
            }),
          ),
        )
      }

      logger.info('Admin notification created:', notification.title)
    } catch (error) {
      logger.error('Error creating admin notification:', error)
    }
  }

  /**
   * Helper: Log map action
   */
  private async logMapAction(
    mapId: string,
    action: string,
    performedBy: string,
    details?: JsonValue,
  ): Promise<void> {
    try {
      await query(
        `
        INSERT INTO map_submission_logs (map_id, action, performed_by, details)
        VALUES ($1, $2, $3, $4)
      `,
        [mapId, action, performedBy, JSON.stringify(details)],
      )
    } catch (error) {
      logger.error('Error logging map action:', error)
    }
  }

  private async getMapModerationSnapshot(mapId: string): Promise<Record<string, unknown> | null> {
    const result = await query(
      `
      SELECT status, is_public, reviewed_at, reviewed_by, review_notes, rejection_reason, is_featured
      FROM maps
      WHERE id = $1
    `,
      [mapId],
    )

    return result.rows[0] ?? null
  }

  /**
   * Get maps by status for admin view
   */
  async getMapsByStatus(status: MapStatus): Promise<CustomMap[]> {
    try {
      const result = await query(
        `
        SELECT 
          m.*,
          u.username as creator_name
        FROM maps m
        JOIN users u ON m.creator_id = u.id
        WHERE m.status = $1
        ORDER BY 
          CASE 
            WHEN $2 = 'pending_review' THEN m.submitted_at
            WHEN $2 = 'approved' THEN m.reviewed_at
            ELSE m.updated_at
          END DESC
      `,
        [status, status],
      )

      return (result.rows as CustomMap[]) || []
    } catch (error) {
      logger.error('Error fetching maps by status:', error)
      throw error
    }
  }

  /**
   * Get map submission history
   */
  async getMapHistory(mapId: string): Promise<MapSubmissionLog[]> {
    try {
      const result = await query(
        `
        SELECT 
          msl.*,
          u.username as performed_by_name
        FROM map_submission_logs msl
        LEFT JOIN users u ON msl.performed_by = u.id
        WHERE msl.map_id = $1
        ORDER BY msl.created_at DESC
      `,
        [mapId],
      )

      return (result.rows as MapSubmissionLog[]) || []
    } catch (error) {
      logger.error('Error fetching map history:', error)
      throw error
    }
  }
}

export default new MapWorkflowService()
