"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapStagingService = exports.MapStagingService = void 0;
const path = __importStar(require("node:path"));
const sharp_1 = __importDefault(require("sharp"));
const database_js_1 = require("../config/database.js");
const assetStorage_js_1 = require("../utils/assetStorage.js");
const logger_js_1 = require("../utils/logger.js");
const adminService_js_1 = require("./adminService.js");
const notificationService_js_1 = __importDefault(require("./notificationService.js"));
class MapStagingService {
    constructor() {
        this.MAX_FILE_SIZE = 10 * 1024 * 1024;
        this.ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        this.NON_ADMIN_QUOTA = 5;
        this.PURGE_BATCH_SIZE = Number(process.env.MAP_ASSET_PURGE_BATCH_SIZE ?? 100);
        this.PURGE_MIN_AGE_MINUTES = Number(process.env.MAP_ASSET_PURGE_MIN_AGE_MINUTES ?? 60);
        this.DELETION_ALERT_THRESHOLD = Number(process.env.MAP_ASSET_PURGE_ALERT_THRESHOLD ?? 3);
    }
    buildStorageKey(filename) {
        return `maps/staging/${filename}`;
    }
    async checkUserQuota(userId) {
        try {
            const userResult = await (0, database_js_1.query)('SELECT is_admin FROM users WHERE id = $1', [userId]);
            const isAdmin = userResult.rows[0]?.is_admin;
            if (isAdmin) {
                return { canUpload: true, remaining: -1 };
            }
            const countResult = await (0, database_js_1.query)(`SELECT COUNT(*) as total FROM (
          SELECT id FROM map_images_staging 
          WHERE user_id = $1 AND is_deleted = FALSE
          UNION ALL
          SELECT id FROM map_drafts 
          WHERE user_id = $1 AND draft_status != 'submitted'
          UNION ALL
          SELECT id FROM map_submissions
          WHERE user_id = $1 AND review_status = 'pending'
        ) AS items`, [userId]);
            const currentCount = parseInt(countResult.rows[0]?.total || '0', 10);
            const remaining = this.NON_ADMIN_QUOTA - currentCount;
            if (currentCount >= this.NON_ADMIN_QUOTA) {
                return {
                    canUpload: false,
                    remaining: 0,
                    reason: `You have reached the maximum of ${this.NON_ADMIN_QUOTA} unpublished maps/images. Please delete some or wait for approval.`,
                };
            }
            return { canUpload: true, remaining };
        }
        catch (error) {
            logger_js_1.logger.error('Error checking user quota:', error);
            return { canUpload: false, remaining: 0, reason: 'Error checking quota' };
        }
    }
    async uploadImage(userId, file) {
        try {
            const quotaCheck = await this.checkUserQuota(userId);
            if (!quotaCheck.canUpload) {
                throw new Error(quotaCheck.reason || 'Upload quota exceeded');
            }
            if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
            }
            if (file.size > this.MAX_FILE_SIZE) {
                throw new Error(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
            }
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(7);
            const extension = path.extname(file.originalname);
            const filename = `map-${timestamp}-${randomString}${extension}`;
            const metadata = await (0, sharp_1.default)(file.buffer).metadata();
            if (!metadata.width || !metadata.height) {
                throw new Error('Could not determine image dimensions');
            }
            let processedBuffer = file.buffer;
            if (metadata.width > 2000 || metadata.height > 2000) {
                processedBuffer = await (0, sharp_1.default)(file.buffer)
                    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                    .toBuffer();
            }
            const storageKey = this.buildStorageKey(filename);
            const uploadResult = await (0, assetStorage_js_1.uploadAsset)({
                key: storageKey,
                body: processedBuffer,
                contentType: file.mimetype,
                cacheControl: 'public, max-age=3600',
            });
            const result = await (0, database_js_1.query)(`INSERT INTO map_images_staging 
         (user_id, filename, original_filename, file_url, file_size, 
          width, height, mime_type, upload_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`, [
                userId,
                filename,
                file.originalname,
                uploadResult.url,
                processedBuffer.length,
                metadata.width,
                metadata.height,
                file.mimetype,
                'ready',
            ]);
            return result.rows[0];
        }
        catch (error) {
            logger_js_1.logger.error('Error uploading image:', error);
            throw error;
        }
    }
    async getUserStagingImages(userId) {
        try {
            const result = await (0, database_js_1.query)(`SELECT * FROM map_images_staging 
         WHERE user_id = $1 AND is_deleted = FALSE
         ORDER BY created_at DESC`, [userId]);
            return result.rows;
        }
        catch (error) {
            logger_js_1.logger.error('Error fetching staging images:', error);
            throw error;
        }
    }
    async getAllStagingImages() {
        try {
            const result = await (0, database_js_1.query)(`SELECT mis.*, u.username 
         FROM map_images_staging mis
         LEFT JOIN users u ON mis.user_id = u.id
         WHERE mis.is_deleted = FALSE
         ORDER BY mis.created_at DESC`);
            return result.rows;
        }
        catch (error) {
            logger_js_1.logger.error('Error fetching all staging images:', error);
            throw error;
        }
    }
    async notifyDeletionFailure(image, errorMessage) {
        try {
            const adminIds = await adminService_js_1.adminService.getActiveAdminUserIds();
            if (adminIds.length === 0) {
                return;
            }
            await Promise.allSettled(adminIds.map((adminId) => notificationService_js_1.default.createInAppNotification(adminId, {
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
            })));
        }
        catch (notifyError) {
            logger_js_1.logger.error('Failed to notify admins about purge failure', notifyError);
        }
    }
    async deleteStagingImage(userId, imageId, isAdmin = false) {
        try {
            const ownershipCheck = isAdmin ? '' : 'AND user_id = $2';
            const params = isAdmin ? [imageId] : [imageId, userId];
            const result = await (0, database_js_1.query)(`UPDATE map_images_staging 
         SET is_deleted = TRUE,
             deleted_at = CURRENT_TIMESTAMP,
             deletion_attempts = 0,
             last_deletion_attempt = NULL,
             last_deletion_error = NULL,
             purged_at = NULL
         WHERE id = $1 ${ownershipCheck}`, params);
            if (result.rowCount === 0) {
                throw new Error('Image not found or unauthorized');
            }
        }
        catch (error) {
            logger_js_1.logger.error('Error deleting staging image:', error);
            throw error;
        }
    }
    async purgeDeletedImages(options) {
        const batchSize = options?.batchSize ?? this.PURGE_BATCH_SIZE;
        const minAgeMinutes = options?.minAgeMinutes ?? this.PURGE_MIN_AGE_MINUTES;
        const dryRun = options?.dryRun ?? false;
        if (batchSize <= 0) {
            throw new Error('batchSize must be greater than zero');
        }
        if (minAgeMinutes < 0) {
            throw new Error('minAgeMinutes must be zero or greater');
        }
        const startedAt = new Date();
        const candidatesResult = await (0, database_js_1.query)(`
        SELECT *
        FROM map_images_staging
        WHERE is_deleted = TRUE
          AND purged_at IS NULL
          AND deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::interval)
        ORDER BY deleted_at ASC
        LIMIT $2
      `, [`${minAgeMinutes} minutes`, batchSize]);
        const rows = candidatesResult.rows;
        let purgedCount = 0;
        let failedCount = 0;
        let bytesPurged = 0;
        for (const row of rows) {
            const ownerId = row.userId ??
                row.user_id ??
                row.userId;
            const fileName = row.filename ?? row.filename;
            const fileSizeRaw = row.fileSize ??
                row.file_size;
            const fileSize = typeof fileSizeRaw === 'number' ? fileSizeRaw : Number(fileSizeRaw ?? 0);
            const currentAttempts = row.deletion_attempts ?? 0;
            const nextAttempts = currentAttempts + 1;
            const storageKey = this.buildStorageKey(fileName);
            if (dryRun) {
                purgedCount += 1;
                bytesPurged += fileSize;
                continue;
            }
            try {
                await (0, assetStorage_js_1.deleteAsset)(storageKey);
                purgedCount += 1;
                bytesPurged += fileSize;
                await (0, database_js_1.query)(`
            UPDATE map_images_staging
            SET purged_at = NOW(),
                deletion_attempts = $2,
                last_deletion_attempt = NOW(),
                last_deletion_error = NULL
            WHERE id = $1
          `, [row.id, nextAttempts]);
            }
            catch (error) {
                failedCount += 1;
                const message = error instanceof Error ? error.message : String(error);
                await (0, database_js_1.query)(`
            UPDATE map_images_staging
            SET deletion_attempts = $2,
                last_deletion_attempt = NOW(),
                last_deletion_error = $3
            WHERE id = $1
          `, [row.id, nextAttempts, message.substring(0, 1000)]);
                if (nextAttempts === this.DELETION_ALERT_THRESHOLD) {
                    await this.notifyDeletionFailure({
                        id: row.id,
                        userId: ownerId ?? row.userId,
                        filename: fileName,
                    }, message);
                }
                logger_js_1.logger.warn('Failed to purge staging image', {
                    imageId: row.id,
                    filename: fileName,
                    error: message,
                });
            }
        }
        await (0, database_js_1.query)(`
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
      `, [
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
        ]);
        try {
            await (0, database_js_1.query)(`DELETE FROM map_asset_purge_runs WHERE started_at < NOW() - INTERVAL '5 days'`);
            await (0, database_js_1.query)(`
          WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
            FROM map_asset_purge_runs
          )
          DELETE FROM map_asset_purge_runs m
          USING ranked r
          WHERE m.id = r.id AND r.rn > 10000
        `);
        }
        catch (_e) {
        }
        return {
            processed: rows.length,
            purged: purgedCount,
            failed: failedCount,
            bytesPurged,
        };
    }
    async reclaimStagingImage(adminId, imageId) {
        const result = await (0, database_js_1.query)('SELECT * FROM map_images_staging WHERE id = $1', [
            imageId,
        ]);
        const row = result.rows[0];
        if (!row) {
            throw new Error('Staging image not found');
        }
        const isDeleted = row.is_deleted ?? row.isDeleted;
        if (!isDeleted) {
            throw new Error('Image is not deleted');
        }
        const fileName = row.filename ?? row.filename;
        const storageKey = this.buildStorageKey(fileName);
        const exists = await (0, assetStorage_js_1.assetExists)(storageKey);
        if (!exists) {
            throw new Error('The original file has already been purged and cannot be reclaimed');
        }
        const updated = await (0, database_js_1.query)(`
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
      `, [imageId]);
        logger_js_1.logger.info('Staging image reclaimed', {
            imageId,
            adminId,
            filename: fileName,
        });
        return updated.rows[0];
    }
    async getRecentPurgeRuns(limit = 20) {
        const result = await (0, database_js_1.query)(`
        SELECT * FROM map_asset_purge_runs
        WHERE run_type = 'staging'
        ORDER BY started_at DESC
        LIMIT $1
      `, [limit]);
        return result.rows;
    }
    async getUserQuotaSummary(userId) {
        try {
            const userResult = await (0, database_js_1.query)('SELECT is_admin FROM users WHERE id = $1', [userId]);
            const isAdmin = userResult.rows[0]?.is_admin;
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
                };
            }
            const stagingResult = await (0, database_js_1.query)('SELECT COUNT(*) as count FROM map_images_staging WHERE user_id = $1 AND is_deleted = FALSE', [userId]);
            const draftsResult = await (0, database_js_1.query)(`SELECT COUNT(*) as count FROM map_drafts 
         WHERE user_id = $1 AND draft_status != 'submitted'`, [userId]);
            const submissionsResult = await (0, database_js_1.query)(`SELECT COUNT(*) as count FROM map_submissions 
         WHERE user_id = $1 AND review_status = 'pending'`, [userId]);
            const stagingImages = parseInt(stagingResult.rows[0]?.count || '0', 10);
            const drafts = parseInt(draftsResult.rows[0]?.count || '0', 10);
            const pendingSubmissions = parseInt(submissionsResult.rows[0]?.count || '0', 10);
            const total = stagingImages + drafts + pendingSubmissions;
            return {
                isAdmin: false,
                unlimited: false,
                stagingImages,
                drafts,
                pendingSubmissions,
                total,
                maxAllowed: this.NON_ADMIN_QUOTA,
                remaining: Math.max(0, this.NON_ADMIN_QUOTA - total),
            };
        }
        catch (error) {
            logger_js_1.logger.error('Error getting quota summary:', error);
            throw error;
        }
    }
}
exports.MapStagingService = MapStagingService;
exports.mapStagingService = new MapStagingService();
//# sourceMappingURL=mapStagingService.js.map