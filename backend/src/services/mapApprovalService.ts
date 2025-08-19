import { query } from '../db/database.js';

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

export class MapApprovalService {
  // Version Management
  static async createVersion(mapId: string, userId: string, versionData: {
    name: string;
    description?: string;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    tags?: string[];
    changelog?: string;
    versionType?: 'major' | 'minor' | 'patch';
  }): Promise<MapVersion> {
    // Get current version to calculate next version number
    const currentVersion = await this.getCurrentVersion(mapId);
    let major = 1, minor = 0, patch = 0;
    
    if (currentVersion) {
      major = currentVersion.versionMajor;
      minor = currentVersion.versionMinor;
      patch = currentVersion.versionPatch;
      
      switch (versionData.versionType || 'patch') {
        case 'major':
          major++;
          minor = 0;
          patch = 0;
          break;
        case 'minor':
          minor++;
          patch = 0;
          break;
        case 'patch':
          patch++;
          break;
      }
    }
    
    const versionNumber = `${major}.${minor}.${patch}`;
    const draftStatusId = await this.getStatusId('draft');
    
    const result = await query(`
      INSERT INTO map_versions (
        map_id, version_number, version_major, version_minor, version_patch,
        status_id, name, description, image_url, image_width, image_height,
        tags, changelog, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      mapId, versionNumber, major, minor, patch, draftStatusId,
      versionData.name, versionData.description, versionData.imageUrl,
      versionData.imageWidth || 600, versionData.imageHeight || 450,
      versionData.tags ? JSON.stringify(versionData.tags) : null,
      versionData.changelog, userId
    ]);
    
    return this.getVersionById(result.lastInsertRowid.toString());
  }
  
  static async getCurrentVersion(mapId: string): Promise<MapVersion | null> {
    const result = await query(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.map_id = ? AND v.is_current = 1
    `, [mapId]);
    
    return result[0] || null;
  }
  
  static async getVersionById(versionId: string): Promise<MapVersion> {
    const result = await query(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.id = ?
    `, [versionId]);
    
    if (!result[0]) {
      throw new Error('Version not found');
    }
    
    return result[0];
  }
  
  static async getVersionHistory(mapId: string): Promise<MapVersion[]> {
    const result = await query(`
      SELECT v.*, s.name as status_name, s.color as status_color
      FROM map_versions v
      JOIN map_status s ON v.status_id = s.id
      WHERE v.map_id = ?
      ORDER BY v.version_major DESC, v.version_minor DESC, v.version_patch DESC
    `, [mapId]);
    
    return result;
  }
  
  static async setCurrentVersion(versionId: string): Promise<void> {
    const version = await this.getVersionById(versionId);
    
    // Update version to be current (triggers will handle the rest)
    await query(`
      UPDATE map_versions SET is_current = 1 WHERE id = ?
    `, [versionId]);
  }
  
  // Approval Request Management
  static async submitForApproval(versionId: string, userId: string, submissionNotes?: string): Promise<MapApprovalRequest> {
    // Check if version is in draft status
    const version = await this.getVersionById(versionId);
    const draftStatusId = await this.getStatusId('draft');
    
    if (version.statusId !== draftStatusId) {
      throw new Error('Only draft versions can be submitted for approval');
    }
    
    // Update version status to submitted
    const submittedStatusId = await this.getStatusId('submitted');
    await query(`
      UPDATE map_versions SET status_id = ? WHERE id = ?
    `, [submittedStatusId, versionId]);
    
    // Create approval request
    const result = await query(`
      INSERT INTO map_approval_requests (
        version_id, requester_id, submission_notes, priority_level
      ) VALUES (?, ?, ?, ?)
    `, [versionId, userId, submissionNotes, 'normal']);
    
    return this.getApprovalRequestById(result.lastInsertRowid.toString());
  }
  
  static async getApprovalRequestById(requestId: string): Promise<MapApprovalRequest> {
    const result = await query(`
      SELECT * FROM map_approval_requests WHERE id = ?
    `, [requestId]);
    
    if (!result[0]) {
      throw new Error('Approval request not found');
    }
    
    return result[0];
  }
  
  static async getPendingApprovalRequests(): Promise<MapApprovalRequest[]> {
    const result = await query(`
      SELECT ar.*, v.name as version_name, v.version_number,
             u.username as requester_username
      FROM map_approval_requests ar
      JOIN map_versions v ON ar.version_id = v.id
      JOIN users u ON ar.requester_id = u.id
      WHERE ar.decision IS NULL
      ORDER BY ar.created_at ASC
    `);
    
    return result;
  }
  
  static async assignReviewer(requestId: string, moderatorId: string): Promise<void> {
    await query(`
      UPDATE map_approval_requests 
      SET assigned_moderator_id = ?, review_started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [moderatorId, requestId]);
    
    // Update version status to under_review
    const request = await this.getApprovalRequestById(requestId);
    const underReviewStatusId = await this.getStatusId('under_review');
    
    await query(`
      UPDATE map_versions SET status_id = ? WHERE id = ?
    `, [underReviewStatusId, request.versionId]);
  }
  
  // Review Criteria Management
  static async getReviewCriteria(): Promise<MapReviewCriteria[]> {
    const result = await query(`
      SELECT * FROM map_review_criteria 
      ORDER BY category, check_order
    `);
    
    return result;
  }
  
  static async submitReviewResults(requestId: string, moderatorId: string, results: {
    criteriaId: string;
    status: 'pass' | 'fail' | 'warning' | 'not_applicable';
    reviewerNotes?: string;
  }[], decision: 'approved' | 'rejected' | 'needs_changes', moderatorFeedback?: string): Promise<void> {
    // Save individual criteria results
    for (const result of results) {
      await query(`
        INSERT OR REPLACE INTO map_review_results 
        (approval_request_id, criteria_id, status, reviewer_notes)
        VALUES (?, ?, ?, ?)
      `, [requestId, result.criteriaId, result.status, result.reviewerNotes]);
    }
    
    // Update approval request with decision
    await query(`
      UPDATE map_approval_requests 
      SET decision = ?, moderator_feedback = ?, review_completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [decision, moderatorFeedback, requestId]);
    
    // Update version status based on decision
    const request = await this.getApprovalRequestById(requestId);
    let newStatusId: string;
    
    switch (decision) {
      case 'approved':
        newStatusId = await this.getStatusId('approved');
        break;
      case 'rejected':
        newStatusId = await this.getStatusId('rejected');
        break;
      case 'needs_changes':
        newStatusId = await this.getStatusId('draft'); // Send back to draft
        break;
      default:
        throw new Error('Invalid decision');
    }
    
    await query(`
      UPDATE map_versions SET status_id = ? WHERE id = ?
    `, [newStatusId, request.versionId]);
    
    // Create moderation action record
    await this.recordModerationAction(
      request.versionId, 
      moderatorId, 
      decision, 
      moderatorFeedback,
      { reviewResults: results }
    );
  }
  
  static async getReviewResults(requestId: string): Promise<MapReviewResult[]> {
    const result = await query(`
      SELECT rr.*, rc.name as criteria_name, rc.description as criteria_description,
             rc.category as criteria_category, rc.is_required
      FROM map_review_results rr
      JOIN map_review_criteria rc ON rr.criteria_id = rc.id
      WHERE rr.approval_request_id = ?
      ORDER BY rc.category, rc.check_order
    `, [requestId]);
    
    return result;
  }
  
  // Publishing and Status Management
  static async publishVersion(versionId: string, moderatorId: string): Promise<void> {
    const version = await this.getVersionById(versionId);
    const approvedStatusId = await this.getStatusId('approved');
    
    if (version.statusId !== approvedStatusId) {
      throw new Error('Only approved versions can be published');
    }
    
    const publishedStatusId = await this.getStatusId('published');
    
    await query(`
      UPDATE map_versions 
      SET status_id = ?, published_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [publishedStatusId, versionId]);
    
    // Set as current version
    await this.setCurrentVersion(versionId);
    
    // Record moderation action
    await this.recordModerationAction(versionId, moderatorId, 'publish', 'Published to public');
  }
  
  static async archiveMap(mapId: string, moderatorId: string, reason?: string): Promise<void> {
    const archivedStatusId = await this.getStatusId('archived');
    
    await query(`
      UPDATE maps SET status_id = ? WHERE id = ?
    `, [archivedStatusId, mapId]);
    
    await this.recordModerationAction(mapId, moderatorId, 'archive', reason);
  }
  
  // Utility Methods
  static async getStatusId(statusName: string): Promise<string> {
    const result = await query(`
      SELECT id FROM map_status WHERE name = ?
    `, [statusName]);
    
    if (!result[0]) {
      throw new Error(`Status '${statusName}' not found`);
    }
    
    return result[0].id;
  }
  
  private static async recordModerationAction(
    mapId: string, 
    moderatorId: string, 
    actionType: string, 
    reason?: string,
    details?: any,
    versionId?: string
  ): Promise<void> {
    await query(`
      INSERT INTO map_moderation_actions 
      (map_id, version_id, moderator_id, action_type, reason, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [mapId, versionId, moderatorId, actionType, reason, details ? JSON.stringify(details) : null]);
  }
  
  static async getMapModerationHistory(mapId: string): Promise<any[]> {
    const result = await query(`
      SELECT ma.*, u.username as moderator_username
      FROM map_moderation_actions ma
      JOIN users u ON ma.moderator_id = u.id
      WHERE ma.map_id = ?
      ORDER BY ma.created_at DESC
    `, [mapId]);
    
    return result;
  }
  
  // Statistics and Analytics
  static async getApprovalStats(): Promise<any> {
    const result = await query(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) as pending,
        AVG(CASE 
          WHEN review_completed_at IS NOT NULL AND review_started_at IS NOT NULL 
          THEN julianday(review_completed_at) - julianday(review_started_at)
        END) * 24 as avg_review_hours
      FROM map_approval_requests
      WHERE created_at >= date('now', '-30 days')
    `);
    
    return result[0] || {};
  }
}

export default MapApprovalService;