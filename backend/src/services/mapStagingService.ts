import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import sharp from 'sharp'
import { query } from '../config/database'
import { adminService } from './adminService'
import notificationService from './notificationService'
import { logger } from '../utils/logger'

export interface StagingImage {
  id: string
  userId: string
  filename: string
  originalFilename: string
  fileUrl: string
  fileSize: number
  width: number
  height: number
  mimeType: string
  uploadStatus: string
  processingError?: string
  isDeleted: boolean
  deletedAt?: Date
  deletionAttempts?: number
  lastDeletionAttempt?: Date
  lastDeletionError?: string
  purgedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface UserQuota {
  userId: string
  contentType: string
  currentCount: number
  totalSizeBytes: number
  maxCount: number | null
  maxSizeBytes: number | null
}

interface UserQuotaSummary {
  isAdmin: boolean
  unlimited: boolean
  stagingImages: number
  drafts: number
  pendingSubmissions: number
  total: number
  maxAllowed: number | null
  remaining: number | null
}

export class MapStagingService {
  private readonly UPLOADS_DIR: string
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  private readonly NON_ADMIN_QUOTA = 5
  private readonly PURGE_BATCH_SIZE = Number(process.env.MAP_ASSET_PURGE_BATCH_SIZE ?? 100)
  private readonly PURGE_MIN_AGE_MINUTES = Number(
    process.env.MAP_ASSET_PURGE_MIN_AGE_MINUTES ?? 60,
  )
  private readonly DELETION_ALERT_THRESHOLD = Number(
    process.env.MAP_ASSET_PURGE_ALERT_THRESHOLD ?? 3,
  )

  constructor() {
    const configuredDir = process.env.MAP_UPLOADS_DIR
    this.UPLOADS_DIR = configuredDir
      ? path.resolve(configuredDir)
      : path.join(__dirname, '../../uploads/maps/staging')

    // Ensure uploads directory exists
    this.ensureUploadsDirectory()
  }

  private async ensureUploadsDirectory() {
    try {
      await fs.mkdir(this.UPLOADS_DIR, { recursive: true })
    } catch (error) {
      logger.error('Error creating uploads directory:', error)
    }
  }

  /**
   * Check user's current quota usage
   */
  async checkUserQuota(
    userId: string,
  ): Promise<{ canUpload: boolean; remaining: number; reason?: string }> {
    try {
      // Check if user is admin
      const userResult = await query('SELECT is_admin FROM users WHERE id = $1', [userId])
      const isAdmin = userResult.rows[0]?.is_admin

      if (isAdmin) {
        return { canUpload: true, remaining: -1 } // Unlimited for admins
      }

      // Count current usage (staging images + drafts + pending submissions)
      const countResult = await query(
        `SELECT COUNT(*) as total FROM (
          SELECT id FROM map_images_staging 
          WHERE user_id = $1 AND is_deleted = FALSE
          UNION ALL
          SELECT id FROM map_drafts 
          WHERE user_id = $1 AND draft_status != 'submitted'
          UNION ALL
          SELECT id FROM map_submissions
          WHERE user_id = $1 AND review_status = 'pending'
        ) AS items`,
        [userId],
      )

      const currentCount = parseInt(countResult.rows[0]?.total || '0', 10)
      const remaining = this.NON_ADMIN_QUOTA - currentCount

      if (currentCount >= this.NON_ADMIN_QUOTA) {
        return {
          canUpload: false,
          remaining: 0,
          reason: `You have reached the maximum of ${this.NON_ADMIN_QUOTA} unpublished maps/images. Please delete some or wait for approval.`,
        }
      }

      return { canUpload: true, remaining }
    } catch (error) {
      logger.error('Error checking user quota:', error)
      return { canUpload: false, remaining: 0, reason: 'Error checking quota' }
    }
  }

  /**
   * Upload and process a map image
   */
  async uploadImage(userId: string, file: Express.Multer.File): Promise<StagingImage> {
    try {
      // Check quota first
      const quotaCheck = await this.checkUserQuota(userId)
      if (!quotaCheck.canUpload) {
        throw new Error(quotaCheck.reason || 'Upload quota exceeded')
      }

      // Validate file
      if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
      }

      if (file.size > this.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`)
      }

      // Generate unique filename
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(7)
      const extension = path.extname(file.originalname)
      const filename = `map-${timestamp}-${randomString}${extension}`
      const filepath = path.join(this.UPLOADS_DIR, filename)

      // Process image with sharp
      const metadata = await sharp(file.buffer).metadata()

      if (!metadata.width || !metadata.height) {
        throw new Error('Could not determine image dimensions')
      }

      // Resize if too large (max 2000px on longest side)
      let processedBuffer = file.buffer
      if (metadata.width > 2000 || metadata.height > 2000) {
        processedBuffer = await sharp(file.buffer)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .toBuffer()
      }

      // Save to disk
      await fs.writeFile(filepath, processedBuffer)

      // Create database entry
      const result = await query(
        `INSERT INTO map_images_staging 
         (user_id, filename, original_filename, file_url, file_size, 
          width, height, mime_type, upload_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          filename,
          file.originalname,
          `/uploads/maps/staging/${filename}`,
          processedBuffer.length,
          metadata.width,
          metadata.height,
          file.mimetype,
          'ready',
        ],
      )

      return result.rows[0] as StagingImage
    } catch (error) {
      logger.error('Error uploading image:', error)
      throw error
    }
  }

  /**
   * Get user's staging images
   */
  async getUserStagingImages(userId: string): Promise<StagingImage[]> {
    try {
      const result = await query(
        `SELECT * FROM map_images_staging 
         WHERE user_id = $1 AND is_deleted = FALSE
         ORDER BY created_at DESC`,
        [userId],
      )

      return result.rows as StagingImage[]
    } catch (error) {
      logger.error('Error fetching staging images:', error)
      throw error
    }
  }

  /**
   * Get all staging images (admin only)
   */
  async getAllStagingImages(): Promise<StagingImage[]> {
    try {
      const result = await query(
        `SELECT mis.*, u.username 
         FROM map_images_staging mis
         LEFT JOIN users u ON mis.user_id = u.id
         WHERE mis.is_deleted = FALSE
         ORDER BY mis.created_at DESC`,
      )

      return result.rows as StagingImage[]
    } catch (error) {
      logger.error('Error fetching all staging images:', error)
      throw error
    }
  }

  private getAbsolutePath(filename: string): string {
    if (path.isAbsolute(filename)) {
      return filename
    }
    return path.join(this.UPLOADS_DIR, filename)
  }

  private async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      await fs.access(filePath)
      await fs.unlink(filePath)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // File already removed - treat as success
        return
      }
      throw error
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false
      }
      throw error
    }
  }

  private async notifyDeletionFailure(
    image: Pick<StagingImage, 'id' | 'userId' | 'filename'>,
    errorMessage: string,
  ): Promise<void> {
    try {
      const adminIds = await adminService.getActiveAdminUserIds()
      if (adminIds.length === 0) {
        return
      }

      await Promise.allSettled(
        adminIds.map((adminId) =>
          notificationService.createInAppNotification(adminId, {
            type: 'system',
            title: 'Map asset purge failed',
            message: `Failed to remove staging asset ${image.filename}. Manual intervention may be required.`,
            data: {
              stagingImageId: image.id,
              ownerId: image.userId,
              filename: image.filename,
              error: errorMessage,
            },
            sendPush: false,
          }),
        ),
      )
    } catch (notifyError) {
      logger.error('Failed to notify admins about purge failure', notifyError)
    }
  }

  /**
   * Delete a staging image
   */
  async deleteStagingImage(userId: string, imageId: string, isAdmin = false): Promise<void> {
    try {
      // Check ownership unless admin
      const ownershipCheck = isAdmin ? '' : 'AND user_id = $2'
      const params = isAdmin ? [imageId] : [imageId, userId]

      const result = await query(
        `UPDATE map_images_staging 
         SET is_deleted = TRUE,
             deleted_at = CURRENT_TIMESTAMP,
             deletion_attempts = 0,
             last_deletion_attempt = NULL,
             last_deletion_error = NULL,
             purged_at = NULL
         WHERE id = $1 ${ownershipCheck}`,
        params,
      )

      if (result.rowCount === 0) {
        throw new Error('Image not found or unauthorized')
      }

      // TODO: Optionally delete the physical file
    } catch (error) {
      logger.error('Error deleting staging image:', error)
      throw error
    }
  }

  async purgeDeletedImages(options?: {
    batchSize?: number
    minAgeMinutes?: number
    dryRun?: boolean
  }): Promise<{
    processed: number
    purged: number
    failed: number
    bytesPurged: number
  }> {
    const batchSize = options?.batchSize ?? this.PURGE_BATCH_SIZE
    const minAgeMinutes = options?.minAgeMinutes ?? this.PURGE_MIN_AGE_MINUTES
    const dryRun = options?.dryRun ?? false

    if (batchSize <= 0) {
      throw new Error('batchSize must be greater than zero')
    }

    if (minAgeMinutes < 0) {
      throw new Error('minAgeMinutes must be zero or greater')
    }

    const startedAt = new Date()

    const candidatesResult = await query<
      (StagingImage & { deletion_attempts: number }) & { file_size: number }
    >(
      `
        SELECT *
        FROM map_images_staging
        WHERE is_deleted = TRUE
          AND purged_at IS NULL
          AND deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::interval)
        ORDER BY deleted_at ASC
        LIMIT $2
      `,
      [`${minAgeMinutes} minutes`, batchSize],
    )

    const rows = candidatesResult.rows
    let purgedCount = 0
    let failedCount = 0
    let bytesPurged = 0

    for (const row of rows) {
      const ownerId = (row as unknown as { userId?: string; user_id?: string }).userId ??
        (row as unknown as { user_id?: string }).user_id ??
        row.userId
      const fileName = (row as unknown as { filename?: string }).filename ?? row.filename
      const fileSizeRaw =
        (row as unknown as { fileSize?: number }).fileSize ??
        (row as unknown as { file_size?: number | string }).file_size
      const fileSize =
        typeof fileSizeRaw === 'number' ? fileSizeRaw : Number(fileSizeRaw ?? 0)

      const filePath = this.getAbsolutePath(fileName)
      const currentAttempts = row.deletion_attempts ?? 0
      const nextAttempts = currentAttempts + 1

      if (dryRun) {
        purgedCount += 1
        bytesPurged += fileSize
        continue
      }

      try {
        await this.deleteFileIfExists(filePath)

        purgedCount += 1
        bytesPurged += fileSize

        await query(
          `
            UPDATE map_images_staging
            SET purged_at = NOW(),
                deletion_attempts = $2,
                last_deletion_attempt = NOW(),
                last_deletion_error = NULL
            WHERE id = $1
          `,
          [row.id, nextAttempts],
        )
      } catch (error) {
        failedCount += 1
        const message = error instanceof Error ? error.message : String(error)

        await query(
          `
            UPDATE map_images_staging
            SET deletion_attempts = $2,
                last_deletion_attempt = NOW(),
                last_deletion_error = $3
            WHERE id = $1
          `,
          [row.id, nextAttempts, message.substring(0, 1000)],
        )

        if (nextAttempts === this.DELETION_ALERT_THRESHOLD) {
          await this.notifyDeletionFailure(
            {
              id: row.id,
              userId: ownerId ?? row.userId,
              filename: fileName,
            },
            message,
          )
        }

        logger.warn('Failed to purge staging image', {
          imageId: row.id,
          filename: fileName,
          error: message,
        })
      }
    }

    await query(
      `
        INSERT INTO map_asset_purge_runs (
          run_type,
          processed_count,
          purged_count,
          failed_count,
          bytes_purged,
          started_at,
          completed_at,
          duration_ms,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
      `,
      [
        'staging',
        rows.length,
        purgedCount,
        failedCount,
        bytesPurged,
        startedAt,
        Date.now() - startedAt.getTime(),
        JSON.stringify({
          batchSize,
          minAgeMinutes,
          dryRun,
        }),
      ],
    )

    return {
      processed: rows.length,
      purged: purgedCount,
      failed: failedCount,
      bytesPurged,
    }
  }

  async reclaimStagingImage(adminId: string, imageId: string): Promise<StagingImage> {
    const result = await query<StagingImage>(
      'SELECT * FROM map_images_staging WHERE id = $1',
      [imageId],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Staging image not found')
    }

    const isDeleted = (row as unknown as { is_deleted?: boolean }).is_deleted ?? row.isDeleted
    if (!isDeleted) {
      throw new Error('Image is not deleted')
    }

    const fileName = (row as unknown as { filename?: string }).filename ?? row.filename
    const filePath = this.getAbsolutePath(fileName)
    const exists = await this.fileExists(filePath)
    if (!exists) {
      throw new Error('The original file has already been purged and cannot be reclaimed')
    }

    const updated = await query<StagingImage>(
      `
        UPDATE map_images_staging
        SET is_deleted = FALSE,
            deleted_at = NULL,
            purged_at = NULL,
            deletion_attempts = 0,
            last_deletion_attempt = NULL,
            last_deletion_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [imageId],
    )

    logger.info('Staging image reclaimed', {
      imageId,
      adminId,
      filename: fileName,
    })

    return updated.rows[0]
  }

  async getRecentPurgeRuns(limit = 20) {
    const result = await query(
      `
        SELECT * FROM map_asset_purge_runs
        WHERE run_type = 'staging'
        ORDER BY started_at DESC
        LIMIT $1
      `,
      [limit],
    )

    return result.rows
  }

  /**
   * Get quota summary for a user
   */
  async getUserQuotaSummary(userId: string): Promise<UserQuotaSummary> {
    try {
      // Check if admin
      const userResult = await query('SELECT is_admin FROM users WHERE id = $1', [userId])
      const isAdmin = userResult.rows[0]?.is_admin

      if (isAdmin) {
        return {
          isAdmin: true,
          unlimited: true,
          stagingImages: 0,
          drafts: 0,
          pendingSubmissions: 0,
          total: 0,
          maxAllowed: null,
          remaining: null,
        }
      }

      // Get counts for each category
      const stagingResult = await query(
        'SELECT COUNT(*) as count FROM map_images_staging WHERE user_id = $1 AND is_deleted = FALSE',
        [userId],
      )

      const draftsResult = await query(
        `SELECT COUNT(*) as count FROM map_drafts 
         WHERE user_id = $1 AND draft_status != 'submitted'`,
        [userId],
      )

      const submissionsResult = await query(
        `SELECT COUNT(*) as count FROM map_submissions 
         WHERE user_id = $1 AND review_status = 'pending'`,
        [userId],
      )

      const stagingImages = parseInt(stagingResult.rows[0]?.count || '0', 10)
      const drafts = parseInt(draftsResult.rows[0]?.count || '0', 10)
      const pendingSubmissions = parseInt(submissionsResult.rows[0]?.count || '0', 10)
      const total = stagingImages + drafts + pendingSubmissions

      return {
        isAdmin: false,
        unlimited: false,
        stagingImages,
        drafts,
        pendingSubmissions,
        total,
        maxAllowed: this.NON_ADMIN_QUOTA,
        remaining: Math.max(0, this.NON_ADMIN_QUOTA - total),
      }
    } catch (error) {
      logger.error('Error getting quota summary:', error)
      throw error
    }
  }
}

export const mapStagingService = new MapStagingService()
