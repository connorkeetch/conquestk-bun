import type { AdminNotification, CustomMap, MapDraft, MapReviewItem, MapStatus, MapSubmissionLog } from '../types/maps.js';
type AuditContext = {
    ipAddress?: string;
    userAgent?: string;
};
type SubmitForReviewOptions = {
    isAdmin?: boolean;
};
type ApprovalOptions = {
    notes?: string;
    auditContext?: AuditContext;
};
type RejectionOptions = {
    reason: string;
    auditContext?: AuditContext;
};
type ArchiveOptions = {
    auditContext?: AuditContext;
};
type ToggleFeaturedOptions = {
    auditContext?: AuditContext;
};
export declare class MapWorkflowService {
    saveDraft(userId: string, draftData: Partial<MapDraft>): Promise<MapDraft>;
    getUserDrafts(userId: string): Promise<MapDraft[]>;
    getDraftById(draftId: string, userId: string): Promise<MapDraft | null>;
    publishDraft(draftId: string, userId: string): Promise<CustomMap>;
    submitForReview(mapId: string, userId: string, options?: SubmitForReviewOptions): Promise<void>;
    approveMap(mapId: string, adminId: string, options?: ApprovalOptions): Promise<void>;
    rejectMap(mapId: string, adminId: string, options: RejectionOptions): Promise<void>;
    editMap(mapId: string, userId: string, isAdmin: boolean): Promise<void>;
    getPendingReviews(): Promise<MapReviewItem[]>;
    getAdminNotifications(adminId?: string, unreadOnly?: boolean): Promise<AdminNotification[]>;
    markNotificationRead(notificationId: string, adminId: string): Promise<void>;
    private safeJson;
    private formatDraftRow;
    private buildCapitalTerritories;
    private normalizeMetadataTerritories;
    private buildMapPayloadFromDraft;
    private parseDataUrl;
    archiveMap(mapId: string, adminId: string, options?: ArchiveOptions): Promise<void>;
    toggleFeatured(mapId: string, adminId: string, options?: ToggleFeaturedOptions): Promise<{
        isFeatured: boolean;
    }>;
    private dispatchMapWorkflowNotification;
    private createAdminNotification;
    private logMapAction;
    private getMapModerationSnapshot;
    getMapsByStatus(status: MapStatus): Promise<CustomMap[]>;
    getMapHistory(mapId: string): Promise<MapSubmissionLog[]>;
}
declare const _default: MapWorkflowService;
export default _default;
//# sourceMappingURL=mapWorkflowService.d.ts.map