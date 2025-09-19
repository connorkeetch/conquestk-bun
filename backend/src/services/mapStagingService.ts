import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import sharp from 'sharp'
import { query } from '../config/database'
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

export class MapStagingService {
  private readonly UPLOADS_DIR = path.join(__dirname, '../../uploads/maps/staging')
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  private readonly NON_ADMIN_QUOTA = 5

  constructor() {
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
         SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
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

  /**
   * Get quota summary for a user
   */
  async getUserQuotaSummary(userId: string): Promise<any> {
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
