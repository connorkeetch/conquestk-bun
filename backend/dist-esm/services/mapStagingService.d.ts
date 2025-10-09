export interface StagingImage {
    id: string;
    userId: string;
    filename: string;
    originalFilename: string;
    fileUrl: string;
    fileSize: number;
    width: number;
    height: number;
    mimeType: string;
    uploadStatus: string;
    processingError?: string;
    isDeleted: boolean;
    deletedAt?: Date;
    deletionAttempts?: number;
    lastDeletionAttempt?: Date;
    lastDeletionError?: string;
    purgedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface UserQuota {
    userId: string;
    contentType: string;
    currentCount: number;
    totalSizeBytes: number;
    maxCount: number | null;
    maxSizeBytes: number | null;
}
interface UserQuotaSummary {
    isAdmin: boolean;
    unlimited: boolean;
    stagingImages: number;
    drafts: number;
    pendingSubmissions: number;
    total: number;
    maxAllowed: number | null;
    remaining: number | null;
}
export declare class MapStagingService {
    private readonly MAX_FILE_SIZE;
    private readonly ALLOWED_MIME_TYPES;
    private readonly NON_ADMIN_QUOTA;
    private readonly PURGE_BATCH_SIZE;
    private readonly PURGE_MIN_AGE_MINUTES;
    private readonly DELETION_ALERT_THRESHOLD;
    private buildStorageKey;
    checkUserQuota(userId: string): Promise<{
        canUpload: boolean;
        remaining: number;
        reason?: string;
    }>;
    uploadImage(userId: string, file: Express.Multer.File): Promise<StagingImage>;
    getUserStagingImages(userId: string): Promise<StagingImage[]>;
    getAllStagingImages(): Promise<StagingImage[]>;
    private notifyDeletionFailure;
    deleteStagingImage(userId: string, imageId: string, isAdmin?: boolean): Promise<void>;
    purgeDeletedImages(options?: {
        batchSize?: number;
        minAgeMinutes?: number;
        dryRun?: boolean;
    }): Promise<{
        processed: number;
        purged: number;
        failed: number;
        bytesPurged: number;
    }>;
    reclaimStagingImage(adminId: string, imageId: string): Promise<StagingImage>;
    getRecentPurgeRuns(limit?: number): Promise<import("pg").QueryResultRow[]>;
    getUserQuotaSummary(userId: string): Promise<UserQuotaSummary>;
}
export declare const mapStagingService: MapStagingService;
export {};
//# sourceMappingURL=mapStagingService.d.ts.map