import { query } from '../config/database'
import type {
  AdminNotification,
  CustomMap,
  MapDraft,
  MapReviewItem,
  MapStatus,
  MapSubmissionLog,
} from '../types/maps'
import { logger } from '../utils/logger'

export class MapWorkflowService {
  /**
   * Save a map draft for later editing
   */
  async saveDraft(userId: string, draftData: Partial<MapDraft>): Promise<MapDraft> {
    try {
      const existingDraft = draftData.id
        ? await query('SELECT * FROM map_drafts WHERE id = $1 AND user_id = $2', [
            draftData.id,
            userId,
          ])
        : null

      if (existingDraft?.rows[0]) {
        // Update existing draft
        const result = await query(
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

        return result.rows[0]
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
      const currentCount = parseInt(quotaCheck.rows[0]?.count || '0')

      if (!isAdmin && currentCount >= 5) {
        throw new Error('Quota exceeded: Maximum 5 unpublished maps/images allowed')
      }

      const result = await query(
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

      return result.rows[0]
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
      const result = await query(
        `
        SELECT * FROM map_drafts 
        WHERE user_id = $1 AND draft_status != 'submitted'
        ORDER BY updated_at DESC
      `,
        [userId],
      )

      return result.rows || []
    } catch (error) {
      logger.error('Error fetching user drafts:', error)
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
      await this.createAdminNotification({
        type: 'map_submission',
        title: 'New Map Submission',
        message: `A new map has been submitted for review`,
        data: { mapId, userId },
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

      await this.logMapAction(mapId, 'approved', adminId, { notes })

      // Notify the map creator
      const mapInfo = await query('SELECT creator_id, name FROM maps WHERE id = ?', [mapId])
      if (mapInfo.rows?.[0]) {
        // TODO: Send notification to user
        logger.info(`Map ${mapInfo.rows[0].name} approved by admin ${adminId}`)
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
      const mapInfo = await query('SELECT creator_id, name FROM maps WHERE id = ?', [mapId])
      if (mapInfo.rows?.[0]) {
        // TODO: Send notification to user about rejection and reason
        logger.info(`Map ${mapInfo.rows[0].name} rejected by admin ${adminId}: ${reason}`)
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

      return result.rows || []
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
      const params: any[] = []

      if (adminId) {
        sql += ' AND (admin_id = ? OR admin_id IS NULL)'
        params.push(adminId)
      }

      if (unreadOnly) {
        sql += ' AND is_read = FALSE'
      }

      sql += ' ORDER BY created_at DESC LIMIT 50'

      const result = await query(sql, params)
      return result.rows || []
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
      await query(
        `
        INSERT INTO admin_notifications (type, title, message, data)
        VALUES (?, ?, ?, ?)
      `,
        [
          notification.type,
          notification.title,
          notification.message,
          JSON.stringify(notification.data),
        ],
      )

      // TODO: Send real-time notification via WebSocket to online admins
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
    details?: any,
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

      return result.rows || []
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

      return result.rows || []
    } catch (error) {
      logger.error('Error fetching map history:', error)
      throw error
    }
  }
}

export default new MapWorkflowService()
