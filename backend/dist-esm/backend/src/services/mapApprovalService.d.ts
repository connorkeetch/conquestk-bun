import type { QueryResultRow } from 'pg';
export interface MapVersion {
    id: string;
    mapId: string;
    versionNumber: string;
    versionMajor: number;
    versionMinor: number;
    versionPatch: number;
    isCurrent: boolean;
    statusId: string;
    name: string;
    description?: string;
    imageUrl?: string;
    imageWidth: number;
    imageHeight: number;
    tags?: string;
    changelog?: string;
    createdBy: string;
    createdAt: string;
    publishedAt?: string;
    statusName?: string;
    statusColor?: string;
}
export interface MapApprovalRequest {
    id: string;
    versionId: string;
    requesterId: string;
    assignedModeratorId?: string;
    submissionNotes?: string;
    priorityLevel: string;
    estimatedReviewTime?: number;
    reviewStartedAt?: string;
    reviewCompletedAt?: string;
    decision?: string;
    moderatorFeedback?: string;
    createdAt: string;
    updatedAt: string;
}
export interface MapReviewCriteria {
    id: string;
    name: string;
    description: string;
    category: string;
    isRequired: boolean;
    weight: number;
    checkOrder: number;
}
export interface MapReviewResult {
    id: string;
    approvalRequestId: string;
    criteriaId: string;
    status: string;
    reviewerNotes?: string;
    criteriaName?: string;
    criteriaDescription?: string;
    criteriaCategory?: string;
    isRequired?: boolean;
}
type AuditContext = {
    ipAddress?: string;
    userAgent?: string;
};
interface MapModerationActionRow extends QueryResultRow {
    id: string;
    map_id: string;
    version_id: string | null;
    moderator_id: string;
    action_type: string;
    reason: string | null;
    details: string | null;
    created_at: string;
    moderator_username: string;
}
interface MapApprovalStatsRow extends QueryResultRow {
    total_requests: number;
    approved: number;
    rejected: number;
    pending: number;
    avg_review_hours: number | null;
}
export declare class MapApprovalService {
    static createVersion(mapId: string, userId: string, versionData: {
        name: string;
        description?: string;
        imageUrl?: string;
        imageWidth?: number;
        imageHeight?: number;
        tags?: string[];
        changelog?: string;
        versionType?: 'major' | 'minor' | 'patch';
    }): Promise<MapVersion>;
    static getCurrentVersion(mapId: string): Promise<MapVersion | null>;
    static getVersionById(versionId: string): Promise<MapVersion>;
    static getVersionHistory(mapId: string): Promise<MapVersion[]>;
    static setCurrentVersion(versionId: string): Promise<void>;
    static submitForApproval(versionId: string, userId: string, submissionNotes?: string): Promise<MapApprovalRequest>;
    static getApprovalRequestById(requestId: string): Promise<MapApprovalRequest>;
    static getPendingApprovalRequests(): Promise<MapApprovalRequest[]>;
    static assignReviewer(requestId: string, actorId: string, moderatorId: string, auditContext?: AuditContext): Promise<void>;
    static unassignReviewer(requestId: string, actorId: string, auditContext?: AuditContext): Promise<void>;
    static getReviewCriteria(): Promise<MapReviewCriteria[]>;
    static submitReviewResults(requestId: string, moderatorId: string, results: {
        criteriaId: string;
        status: 'pass' | 'fail' | 'warning' | 'not_applicable';
        reviewerNotes?: string;
    }[], decision: 'approved' | 'rejected' | 'needs_changes', moderatorFeedback?: string, auditContext?: AuditContext): Promise<void>;
    static getReviewResults(requestId: string): Promise<MapReviewResult[]>;
    static publishVersion(versionId: string, moderatorId: string, auditContext?: AuditContext): Promise<void>;
    static archiveMap(mapId: string, moderatorId: string, reason?: string, auditContext?: AuditContext): Promise<void>;
    static getStatusId(statusName: string): Promise<string>;
    private static recordModerationAction;
    static getMapModerationHistory(mapId: string): Promise<MapModerationActionRow[]>;
    private static fetchMapSnapshot;
    static getApprovalStats(): Promise<MapApprovalStatsRow>;
}
export default MapApprovalService;
//# sourceMappingURL=mapApprovalService.d.ts.map