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
  MetadataContinentInput,
  MetadataTerritoryInput,
} from '../types/maps'
import { storeBase64Image } from '../utils/imageStorage'
import { logger } from '../utils/logger'
import { adminService } from './adminService'
import { mapService } from './mapService'
import { mapStagingService } from './mapStagingService'
import notificationService from './notificationService'

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
  continents: JsonValue | string | null
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
              continents = $5, adjacencies = $6, thumbnail_url = $7,
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
            JSON.stringify(draftData.continents || []),
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
            map_data, territories, continents, adjacencies, thumbnail_url,
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
          JSON.stringify(draftData.continents || []),
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
          const message =
            assetError instanceof Error ? assetError.message : String(assetError)
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
  async submitForReview(mapId: string, userId: string): Promise<void> {
    try {
      // Update map status
      await query(
        `
        UPDATE maps 
        SET status = 'pending_review', submitted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND creator_id = ?
      `,
        [mapId, userId],
      )

      // Add to review queue
      await query(
        `
        INSERT INTO map_review_queue (map_id, submitted_by, status, priority)
        VALUES (?, ?, 'pending', 0)
        ON CONFLICT(map_id) DO UPDATE SET 
          status = 'pending', 
          submitted_at = CURRENT_TIMESTAMP
      `,
        [mapId, userId],
      )

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
  async approveMap(mapId: string, adminId: string, notes?: string): Promise<void> {
    try {
      await query(
        `
        UPDATE maps 
        SET status = 'approved', 
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = ?,
            review_notes = ?
        WHERE id = ?
      `,
        [adminId, notes, mapId],
      )

      await query(
        `
        UPDATE map_review_queue 
        SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
        WHERE map_id = ?
      `,
        [mapId],
      )

      await this.logMapAction(mapId, 'approved', adminId, notes ? { notes } : undefined)

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
    } catch (error) {
      logger.error('Error approving map:', error)
      throw error
    }
  }

  /**
   * Reject a map with reason
   */
  async rejectMap(mapId: string, adminId: string, reason: string): Promise<void> {
    try {
      await query(
        `
        UPDATE maps 
        SET status = 'rejected', 
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = ?,
            rejection_reason = ?
        WHERE id = ?
      `,
        [adminId, reason, mapId],
      )

      await query(
        `
        UPDATE map_review_queue 
        SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP
        WHERE map_id = ?
      `,
        [mapId],
      )

      await this.logMapAction(mapId, 'rejected', adminId, { reason })

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
        INSERT INTO map_versions (map_id, version_number, data, territories, continents, adjacencies, change_summary, changed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          mapId,
          mapData.version || 1,
          JSON.stringify(mapData),
          mapData.territories,
          mapData.continents,
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
              parent_map_id = ?
          WHERE id = ?
        `,
          [mapId, mapId],
        )

        await this.submitForReview(mapId, userId)
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
      const result = await query(`
        SELECT 
          mrq.*,
          m.name as map_name,
          m.description as map_description,
          m.creator_id,
          u.username as submitter_name
        FROM map_review_queue mrq
        JOIN maps m ON mrq.map_id = m.id
        JOIN users u ON m.creator_id = u.id
        WHERE mrq.status = 'pending'
        ORDER BY mrq.priority DESC, mrq.submitted_at ASC
      `)

      return (result.rows as MapReviewItem[]) || []
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
        sql += ' AND (admin_id = ? OR admin_id IS NULL)'
        params.push(adminId)
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
        WHERE id = ? AND (admin_id = ? OR admin_id IS NULL)
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
    const mapDataContinents = mapData.continents
    const mapDataAdjacencies = mapData.adjacencies
    const mapDataCapitalAssignments = mapData.capitalAssignments
    const mapDataTags = mapData.tags
    const fallbackImageWidth = asNumber(mapData.imageWidth)
    const fallbackImageHeight = asNumber(mapData.imageHeight)
    const territories = this.safeJson<unknown[]>(
      row.territories,
      Array.isArray(mapDataTerritories) ? mapDataTerritories : [],
    )
    const continents = this.safeJson<unknown[]>(
      row.continents,
      Array.isArray(mapDataContinents) ? mapDataContinents : [],
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

    return {
      id: row.id,
      userId: row.user_id,
      stagingImageId: row.staging_image_id || undefined,
      parentMapId: row.parent_map_id || undefined,
      name: row.name || 'Untitled Map',
      description: row.description || undefined,
      data: mapData,
      territories,
      continents,
      adjacencies,
      capitalAssignments,
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

  private async buildMapPayloadFromDraft(
    draft: MapDraft,
  ): Promise<CreateMapRequest & { metadata?: MapMetadataPayload }> {
    const data: Record<string, unknown> =
      typeof draft.data === 'object' && draft.data !== null
        ? (draft.data as Record<string, unknown>)
        : {}

    const dataTerritories = data.territories
    const dataContinents = data.continents
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

    const continents =
      Array.isArray(draft.continents) && draft.continents.length > 0
        ? draft.continents
        : Array.isArray(dataContinents)
          ? (dataContinents as unknown[])
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

    const metadata: MapMetadataPayload = {
      territories: territories as MetadataTerritoryInput[],
      continents: continents as MetadataContinentInput[],
      adjacencies: adjacencies as MetadataAdjacencyInput[],
      capitalAssignments,
      width: asNumber(data.width) ?? asNumber(data.mapWidth) ?? imageWidth ?? 1920,
      height: asNumber(data.height) ?? asNumber(data.mapHeight) ?? imageHeight ?? 1080,
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
            : ['custom', 'user-created'],
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
  async archiveMap(mapId: string, adminId: string): Promise<void> {
    try {
      await query(
        `
        UPDATE maps 
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [mapId],
      )

      await this.logMapAction(mapId, 'archived', adminId)
    } catch (error) {
      logger.error('Error archiving map:', error)
      throw error
    }
  }

  /**
   * Feature/unfeature a map
   */
  async toggleMapFeatured(mapId: string, adminId: string): Promise<void> {
    try {
      const result = await query('SELECT is_featured FROM maps WHERE id = $1', [mapId])
      const isFeatured = result.rows?.[0]?.is_featured

      await query(
        `
        UPDATE maps 
        SET is_featured = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [!isFeatured, mapId],
      )

      await this.logMapAction(mapId, isFeatured ? 'unfeatured' : 'featured', adminId)
    } catch (error) {
      logger.error('Error toggling map featured status:', error)
      throw error
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
              message:
                notification.message ?? 'You have a new admin notification.',
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
        VALUES (?, ?, ?, ?)
      `,
        [mapId, action, performedBy, JSON.stringify(details)],
      )
    } catch (error) {
      logger.error('Error logging map action:', error)
    }
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
        WHERE m.status = ?
        ORDER BY 
          CASE 
            WHEN ? = 'pending_review' THEN m.submitted_at
            WHEN ? = 'approved' THEN m.reviewed_at
            ELSE m.updated_at
          END DESC
      `,
        [status, status, status],
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
        WHERE msl.map_id = ?
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
