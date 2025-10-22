import type { QueryResultRow } from 'pg'
import { query } from '../config/database.js'
import { adminService } from './adminService.js'
import notificationService from './notificationService.js'

export interface MapVersionMetadata {
  name?: string
  description?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  tags?: string[]
  changelog?: string
  [key: string]: unknown
}

export interface MapVersion {
  id: string
  mapId: string
  versionNumber: number
  data: Record<string, unknown>
  territories: unknown[]
  sectors: unknown[]
  adjacencies: unknown[]
  changeSummary?: string
  changedBy?: string
  createdAt: string
  metadata: MapVersionMetadata
}

export interface MapApprovalRequest {
  id: string
  versionId: string
  requesterId: string
  mapId?: string
  assignedModeratorId?: string
  submissionNotes?: string
  priorityLevel: string
  estimatedReviewTime?: number
  reviewStartedAt?: string
  reviewCompletedAt?: string
  decision?: string
  moderatorFeedback?: string
  createdAt: string
  updatedAt: string
  versionNumber?: number
  versionName?: string
  requesterUsername?: string
}

export interface MapReviewCriteria {
  id: string
  name: string
  description: string
  category: string
  isRequired: boolean
  weight: number
  checkOrder: number
}

export interface MapReviewResult {
  id: string
  approvalRequestId: string
  criteriaId: string
  status: string
  reviewerNotes?: string
  criteriaName?: string
  criteriaDescription?: string
  criteriaCategory?: string
  isRequired?: boolean
}

type ModerationDetails = Record<string, unknown>

type AuditContext = {
  ipAddress?: string
  userAgent?: string
}

interface MapVersionRow extends QueryResultRow {
  id: string
  map_id: string
  version_number: number
  data: unknown
  territories: unknown
  sectors: unknown
  adjacencies: unknown
  change_summary: string | null
  changed_by: string | null
  created_at: string
}

interface MapApprovalRequestRow extends QueryResultRow {
  id: string
  version_id: string
  requester_id: string
  assigned_moderator_id: string | null
  submission_notes: string | null
  priority_level: string
  estimated_review_time: number | null
  review_started_at: string | null
  review_completed_at: string | null
  decision: string | null
  moderator_feedback: string | null
  created_at: string
  updated_at: string
  map_id: string
  version_number: number
  version_name: string | null
  requester_username: string | null
}

interface MapModerationActionRow extends QueryResultRow {
  id: string
  map_id: string
  action: string
  performed_by: string | null
  details: unknown
  created_at: string
  moderator_username: string | null
}

interface MapApprovalStatsRow extends QueryResultRow {
  total_requests: number
  approved: number
  rejected: number
  pending: number
  avg_review_hours: number | null
}
// biome-ignore lint/complexity/noStaticOnlyClass: service exposes static helpers for route handlers
export class MapApprovalService {
  // Version Management
  static async createVersion(
    mapId: string,
    userId: string,
    versionData: {
      name: string
      description?: string
      imageUrl?: string
      imageWidth?: number
      imageHeight?: number
      tags?: string[]
      changelog?: string
      versionType?: 'major' | 'minor' | 'patch'
      data?: Record<string, unknown>
      territories?: unknown[]
      sectors?: unknown[]
      adjacencies?: unknown[]
    },
  ): Promise<MapVersion> {
    const latest = await query<{ version_number: number }>(
      `
      SELECT version_number
      FROM map_versions
      WHERE map_id = $1
      ORDER BY version_number DESC, created_at DESC
      LIMIT 1
    `,
      [mapId],
    )

    const nextVersionNumber = Number(latest.rows[0]?.version_number ?? 0) + 1
    const payload = MapApprovalService.buildVersionInsertPayload(versionData)

    const result = await query<{ id: string }>(
      `
      INSERT INTO map_versions (
        map_id,
        version_number,
        data,
        territories,
        sectors,
        adjacencies,
        change_summary,
        changed_by
      ) VALUES (
        $1,
        $2,
        $3::jsonb,
        $4::jsonb,
        $5::jsonb,
        $6::jsonb,
        $7,
        $8
      )
      RETURNING id
    `,
      [
        mapId,
        nextVersionNumber,
        JSON.stringify(payload.data),
        JSON.stringify(payload.territories),
        JSON.stringify(payload.sectors),
        JSON.stringify(payload.adjacencies),
        payload.changeSummary,
        userId,
      ],
    )

    const newVersionId = result.rows[0]?.id

    if (!newVersionId) {
      throw new Error('Failed to create map version')
    }

    return MapApprovalService.getVersionById(newVersionId)
  }

  static async getCurrentVersion(mapId: string): Promise<MapVersion | null> {
    const result = await query<MapVersionRow>(
      `
      SELECT *
      FROM map_versions
      WHERE map_id = $1
      ORDER BY version_number DESC, created_at DESC
      LIMIT 1
    `,
      [mapId],
    )

    const row = result.rows[0]
    return row ? MapApprovalService.hydrateVersion(row) : null
  }

  static async getVersionById(versionId: string): Promise<MapVersion> {
    const result = await query<MapVersionRow>(
      `
      SELECT *
      FROM map_versions
      WHERE id = $1
    `,
      [versionId],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Version not found')
    }

    return MapApprovalService.hydrateVersion(row)
  }

  static async getVersionHistory(mapId: string): Promise<MapVersion[]> {
    const result = await query<MapVersionRow>(
      `
      SELECT *
      FROM map_versions
      WHERE map_id = $1
      ORDER BY version_number DESC, created_at DESC
    `,
      [mapId],
    )

    return result.rows.map((row) => MapApprovalService.hydrateVersion(row))
  }

  static async setCurrentVersion(versionId: string): Promise<void> {
    const version = await MapApprovalService.getVersionById(versionId)

    await query(
      `
      UPDATE maps
      SET version = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [version.versionNumber, version.mapId],
    )
  }

  // Approval Request Management
  static async submitForApproval(
    versionId: string,
    userId: string,
    submissionNotes?: string,
  ): Promise<MapApprovalRequest> {
    const version = await MapApprovalService.getVersionById(versionId)

    const existingPending = await query<{ id: string }>(
      `
      SELECT id
      FROM map_approval_requests
      WHERE version_id = $1 AND decision IS NULL
      LIMIT 1
    `,
      [versionId],
    )

    if (existingPending.rows[0]) {
      throw new Error('Version already has a pending approval request')
    }

    await query(
      `
      UPDATE maps
      SET status = 'pending_review',
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [version.mapId],
    )

    const result = await query<{ id: string }>(
      `
      INSERT INTO map_approval_requests (
        version_id, requester_id, submission_notes, priority_level
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
      [versionId, userId, submissionNotes ?? null, 'normal'],
    )

    const approvalRequestId = result.rows[0]?.id

    if (!approvalRequestId) {
      throw new Error('Failed to create approval request')
    }

    return MapApprovalService.getApprovalRequestById(approvalRequestId)
  }

  static async getApprovalRequestById(requestId: string): Promise<MapApprovalRequest> {
    const result = await query<MapApprovalRequestRow>(
      `
      SELECT 
        ar.*,
        v.map_id,
        v.version_number,
        (v.data ->> 'name') AS version_name,
        u.username AS requester_username
      FROM map_approval_requests ar
      JOIN map_versions v ON ar.version_id = v.id
      JOIN users u ON ar.requester_id = u.id
      WHERE ar.id = $1
    `,
      [requestId],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Approval request not found')
    }

    return MapApprovalService.hydrateApprovalRequest(row)
  }

  static async getPendingApprovalRequests(): Promise<MapApprovalRequest[]> {
    const result = await query<MapApprovalRequestRow>(`
      SELECT 
        ar.*,
        v.map_id,
        v.version_number,
        (v.data ->> 'name') AS version_name,
        u.username AS requester_username
      FROM map_approval_requests ar
      JOIN map_versions v ON ar.version_id = v.id
      JOIN users u ON ar.requester_id = u.id
      WHERE ar.decision IS NULL
      ORDER BY ar.created_at ASC
    `)

    return result.rows.map((row) => MapApprovalService.hydrateApprovalRequest(row))
  }

  static async assignReviewer(
    requestId: string,
    actorId: string,
    moderatorId: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const requestBefore = await MapApprovalService.getApprovalRequestById(requestId)
    const versionBefore = await MapApprovalService.getVersionById(requestBefore.versionId)
    const mapSnapshotBefore = requestBefore.mapId
      ? await MapApprovalService.fetchMapSnapshot(requestBefore.mapId)
      : null

    await query(
      `
      UPDATE map_approval_requests 
      SET assigned_moderator_id = $1, review_started_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [moderatorId, requestId],
    )

    const requestAfter = await MapApprovalService.getApprovalRequestById(requestId)
    const versionAfter = await MapApprovalService.getVersionById(requestBefore.versionId)
    const mapSnapshotAfter = requestAfter.mapId
      ? await MapApprovalService.fetchMapSnapshot(requestAfter.mapId)
      : null

    await notificationService.createInAppNotification(moderatorId, {
      type: 'map_review',
      title: 'Map assigned for review',
      message: `"${versionAfter.metadata.name ?? 'Map version'}" is ready for your review.`,
      data: { mapId: versionAfter.mapId, versionId: versionAfter.id, requestId },
      actionUrl: `/admin/maps/${versionAfter.mapId}/review`,
      actionLabel: 'Open review',
      sendPush: false,
    })

    await adminService.logAdminAction(
      actorId,
      'map_reviewer_assigned',
      {
        requestId,
        assignedModeratorId: moderatorId,
        before: {
          assignedModeratorId: requestBefore.assignedModeratorId,
          reviewStartedAt: requestBefore.reviewStartedAt,
          versionNumber: versionBefore.versionNumber,
          map: mapSnapshotBefore,
        },
        after: {
          assignedModeratorId: requestAfter.assignedModeratorId,
          reviewStartedAt: requestAfter.reviewStartedAt,
          versionNumber: versionAfter.versionNumber,
          map: mapSnapshotAfter,
        },
      },
      'map_version',
      versionAfter.id,
      auditContext?.ipAddress,
      auditContext?.userAgent,
    )
  }

  static async unassignReviewer(
    requestId: string,
    actorId: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const requestBefore = await MapApprovalService.getApprovalRequestById(requestId)

    await query(
      `
      UPDATE map_approval_requests 
      SET assigned_moderator_id = NULL, review_started_at = NULL
      WHERE id = $1
    `,
      [requestId],
    )

    const requestAfter = await MapApprovalService.getApprovalRequestById(requestId)

    await adminService.logAdminAction(
      actorId,
      'map_reviewer_unassigned',
      {
        requestId,
        before: {
          assignedModeratorId: requestBefore.assignedModeratorId,
          reviewStartedAt: requestBefore.reviewStartedAt,
        },
        after: {
          assignedModeratorId: requestAfter.assignedModeratorId,
          reviewStartedAt: requestAfter.reviewStartedAt,
        },
      },
      'map_approval_request',
      requestId,
      auditContext?.ipAddress,
      auditContext?.userAgent,
    )
  }

  // Review Criteria Management
  static async getReviewCriteria(): Promise<MapReviewCriteria[]> {
    const result = await query(`
      SELECT * FROM map_review_criteria 
      ORDER BY category, check_order
    `)

    return result.rows as MapReviewCriteria[]
  }

  static async submitReviewResults(
    requestId: string,
    moderatorId: string,
    results: {
      criteriaId: string
      status: 'pass' | 'fail' | 'warning' | 'not_applicable'
      reviewerNotes?: string
    }[],
    decision: 'approved' | 'rejected' | 'needs_changes',
    moderatorFeedback?: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const requestBefore = await MapApprovalService.getApprovalRequestById(requestId)
    const versionBefore = await MapApprovalService.getVersionById(requestBefore.versionId)
    const mapSnapshotBefore = await MapApprovalService.fetchMapSnapshot(versionBefore.mapId)

    // Save individual criteria results
    for (const result of results) {
      await query(
        `
        INSERT INTO map_review_results (
          approval_request_id,
          criteria_id,
          reviewer_id,
          status,
          reviewer_notes
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (approval_request_id, criteria_id) DO UPDATE SET
          reviewer_id = EXCLUDED.reviewer_id,
          status = EXCLUDED.status,
          reviewer_notes = EXCLUDED.reviewer_notes,
          updated_at = CURRENT_TIMESTAMP
      `,
        [requestId, result.criteriaId, moderatorId, result.status, result.reviewerNotes ?? null],
      )
    }

    // Update approval request with decision
    await query(
      `
      UPDATE map_approval_requests 
      SET decision = $1, moderator_feedback = $2, review_completed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `,
      [decision, moderatorFeedback, requestId],
    )

    const request = await MapApprovalService.getApprovalRequestById(requestId)
    const mapId = request.mapId ?? versionBefore.mapId

    switch (decision) {
      case 'approved':
        await query(
          `
          UPDATE maps
          SET status = 'approved',
              is_public = TRUE,
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = $1,
              review_notes = $2,
              rejection_reason = NULL
          WHERE id = $3
        `,
          [moderatorId, moderatorFeedback ?? null, mapId],
        )
        break
      case 'rejected':
        await query(
          `
          UPDATE maps
          SET status = 'rejected',
              is_public = FALSE,
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = $1,
              review_notes = $2,
              rejection_reason = COALESCE($2, 'Map rejected')
          WHERE id = $3
        `,
          [moderatorId, moderatorFeedback ?? null, mapId],
        )
        break
      case 'needs_changes':
        await query(
          `
          UPDATE maps
          SET status = 'draft',
              is_public = FALSE,
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = $1,
              review_notes = $2
          WHERE id = $3
        `,
          [moderatorId, moderatorFeedback ?? null, mapId],
        )
        break
      default:
        throw new Error('Invalid decision')
    }

    await MapApprovalService.recordModerationAction(
      mapId,
      moderatorId,
      decision,
      moderatorFeedback,
      {
        reviewResults: results,
        requestId,
        versionId: request.versionId,
      },
      request.versionId,
    )

    const version = await MapApprovalService.getVersionById(request.versionId)
    const mapInfo = await query<{ creator_id: string; name: string }>(
      'SELECT creator_id, name FROM maps WHERE id = $1',
      [version.mapId],
    )

    const creatorId = mapInfo.rows?.[0]?.creator_id
    const mapName = version.metadata.name ?? mapInfo.rows?.[0]?.name ?? 'Your map'
    const baseData = {
      mapId: version.mapId,
      versionId: version.id,
      requestId,
    }

    if (creatorId) {
      let type: string
      let title: string
      let message: string
      let pushTitle: string
      let pushBody: string

      switch (decision) {
        case 'approved':
          type = 'map_approved'
          title = 'Map approved'
          message = `"${mapName}" has been approved.`
          pushTitle = '✅ Map approved'
          pushBody = `"${mapName}" is now approved.`
          break
        case 'rejected':
          type = 'map_rejected'
          title = 'Map rejected'
          message = moderatorFeedback
            ? `"${mapName}" was rejected: ${moderatorFeedback}`
            : `"${mapName}" was rejected.`
          pushTitle = '❗ Map review update'
          pushBody = `"${mapName}" was rejected.`
          break
        case 'needs_changes':
          type = 'map_review'
          title = 'Map needs changes'
          message = moderatorFeedback
            ? `Review feedback for "${mapName}": ${moderatorFeedback}`
            : `Reviewers requested changes for "${mapName}".`
          pushTitle = 'ℹ️ Map review feedback'
          pushBody = `"${mapName}" needs updates before approval.`
          break
        default:
          type = 'map_review'
          title = 'Map review updated'
          message = `Review updated for "${mapName}".`
          pushTitle = 'ℹ️ Map review updated'
          pushBody = `Review updated for "${mapName}".`
      }

      await notificationService.createInAppNotification(creatorId, {
        type,
        title,
        message,
        data: { ...baseData, decision, moderatorFeedback },
        actionUrl: `/maps/${version.mapId}`,
        actionLabel: 'Review map',
        sendPush: true,
        pushPayload: {
          title: pushTitle,
          body: pushBody,
          data: {
            url: `/maps/${version.mapId}`,
            decision,
            ...baseData,
          },
        },
      })
    }

    const requestAfter = await MapApprovalService.getApprovalRequestById(requestId)
    const versionAfter = await MapApprovalService.getVersionById(request.versionId)
    const mapSnapshotAfter = await MapApprovalService.fetchMapSnapshot(versionAfter.mapId)

    await adminService.logAdminAction(
      moderatorId,
      decision === 'approved'
        ? 'map_review_approved'
        : decision === 'rejected'
          ? 'map_review_rejected'
          : 'map_review_needs_changes',
      {
        requestId,
        decision,
        moderatorFeedback,
        before: {
          approvalRequest: requestBefore,
          version: versionBefore,
          map: mapSnapshotBefore,
        },
        after: {
          approvalRequest: requestAfter,
          version: versionAfter,
          map: mapSnapshotAfter,
        },
        reviewResults: results,
      },
      'map',
      versionAfter.mapId,
      auditContext?.ipAddress,
      auditContext?.userAgent,
    )
  }

  static async getReviewResults(requestId: string): Promise<MapReviewResult[]> {
    const result = await query(
      `
      SELECT rr.*, rc.name as criteria_name, rc.description as criteria_description,
             rc.category as criteria_category, rc.is_required
      FROM map_review_results rr
      JOIN map_review_criteria rc ON rr.criteria_id = rc.id
      WHERE rr.approval_request_id = $1
      ORDER BY rc.category, rc.check_order
    `,
      [requestId],
    )

    return result.rows as MapReviewResult[]
  }

  // Publishing and Status Management
  static async publishVersion(
    versionId: string,
    moderatorId: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const version = await MapApprovalService.getVersionById(versionId)
    const mapSnapshotBefore = await MapApprovalService.fetchMapSnapshot(version.mapId)
    const mapStatusResult = await query<{ status: string }>(
      `SELECT status FROM maps WHERE id = $1`,
      [version.mapId],
    )
    const currentStatus = mapStatusResult.rows[0]?.status

    if (currentStatus !== 'approved') {
      throw new Error('Only approved maps can be published')
    }

    await MapApprovalService.setCurrentVersion(versionId)

    await query(
      `
      UPDATE maps
      SET is_public = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [version.mapId],
    )

    await MapApprovalService.recordModerationAction(
      version.mapId,
      moderatorId,
      'publish',
      'Published to public',
      { versionId },
      versionId,
    )

    const versionAfter = await MapApprovalService.getVersionById(versionId)
    const mapSnapshotAfter = await MapApprovalService.fetchMapSnapshot(version.mapId)

    await adminService.logAdminAction(
      moderatorId,
      'map_review_published',
      {
        versionId,
        before: {
          version,
          map: mapSnapshotBefore,
        },
        after: {
          version: versionAfter,
          map: mapSnapshotAfter,
        },
      },
      'map',
      version.mapId,
      auditContext?.ipAddress,
      auditContext?.userAgent,
    )
  }

  static async archiveMap(
    mapId: string,
    moderatorId: string,
    reason?: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const beforeSnapshot = await MapApprovalService.fetchMapSnapshot(mapId)

    await query(
      `
      UPDATE maps
      SET status = 'archived',
          is_public = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [mapId],
    )

    await MapApprovalService.recordModerationAction(
      mapId,
      moderatorId,
      'archive',
      reason,
      undefined,
      undefined,
    )

    const afterSnapshot = await MapApprovalService.fetchMapSnapshot(mapId)

    await adminService.logAdminAction(
      moderatorId,
      'map_review_archived',
      {
        mapId,
        reason,
        before: beforeSnapshot,
        after: afterSnapshot,
      },
      'map',
      mapId,
      auditContext?.ipAddress,
      auditContext?.userAgent,
    )
  }

  private static buildVersionInsertPayload(versionData: {
    name: string
    description?: string
    imageUrl?: string
    imageWidth?: number
    imageHeight?: number
    tags?: string[]
    changelog?: string
    versionType?: 'major' | 'minor' | 'patch'
    data?: Record<string, unknown>
    territories?: unknown[]
    sectors?: unknown[]
    adjacencies?: unknown[]
  }): {
    data: Record<string, unknown>
    territories: unknown[]
    sectors: unknown[]
    adjacencies: unknown[]
    changeSummary: string | null
  } {
    const { territories, sectors, adjacencies, changelog, data, ...presentation } = versionData

    const sanitizedPresentation = {
      ...presentation,
      imageWidth: presentation.imageWidth ?? 600,
      imageHeight: presentation.imageHeight ?? 450,
    }

    const dataDocument: Record<string, unknown> = {
      ...(data ?? {}),
      ...sanitizedPresentation,
    }

    if (changelog) {
      dataDocument.changelog = changelog
    }

    return {
      data: dataDocument,
      territories: Array.isArray(territories) ? territories : [],
      sectors: Array.isArray(sectors) ? sectors : [],
      adjacencies: Array.isArray(adjacencies) ? adjacencies : [],
      changeSummary: changelog ?? null,
    }
  }

  private static hydrateVersion(row: MapVersionRow): MapVersion {
    const data = MapApprovalService.normalizeJson<Record<string, unknown>>(row.data, {})
    const territories = MapApprovalService.normalizeJson<unknown[]>(row.territories, [])
    const sectors = MapApprovalService.normalizeJson<unknown[]>(row.sectors, [])
    const adjacencies = MapApprovalService.normalizeJson<unknown[]>(row.adjacencies, [])

    return {
      id: row.id,
      mapId: row.map_id,
      versionNumber: Number(row.version_number),
      data,
      territories,
      sectors,
      adjacencies,
      changeSummary: row.change_summary ?? undefined,
      changedBy: row.changed_by ?? undefined,
      createdAt: row.created_at,
      metadata: MapApprovalService.extractMetadata(data),
    }
  }

  private static hydrateApprovalRequest(row: MapApprovalRequestRow): MapApprovalRequest {
    return {
      id: row.id,
      versionId: row.version_id,
      requesterId: row.requester_id,
      mapId: row.map_id,
      assignedModeratorId: row.assigned_moderator_id ?? undefined,
      submissionNotes: row.submission_notes ?? undefined,
      priorityLevel: row.priority_level,
      estimatedReviewTime: row.estimated_review_time ?? undefined,
      reviewStartedAt: row.review_started_at ?? undefined,
      reviewCompletedAt: row.review_completed_at ?? undefined,
      decision: row.decision ?? undefined,
      moderatorFeedback: row.moderator_feedback ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      versionNumber: row.version_number,
      versionName: row.version_name ?? undefined,
      requesterUsername: row.requester_username ?? undefined,
    }
  }

  private static normalizeJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) {
      return fallback
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch {
        return fallback
      }
    }

    if (typeof value === 'object') {
      return value as T
    }

    return fallback
  }

  private static extractMetadata(data: Record<string, unknown>): MapVersionMetadata {
    const metadata: MapVersionMetadata = {}
    const candidates: Record<string, unknown>[] = []

    const embedded = data.metadata
    if (embedded && typeof embedded === 'object') {
      candidates.push(embedded as Record<string, unknown>)
    }

    candidates.push(data)

    for (const source of candidates) {
      if (typeof source.name === 'string') {
        metadata.name = source.name
      }
      if (typeof source.description === 'string') {
        metadata.description = source.description
      }
      if (typeof source.imageUrl === 'string') {
        metadata.imageUrl = source.imageUrl
      }
      if (typeof source.imageWidth === 'number') {
        metadata.imageWidth = source.imageWidth
      }
      if (typeof source.imageHeight === 'number') {
        metadata.imageHeight = source.imageHeight
      }
      if (Array.isArray(source.tags)) {
        metadata.tags = source.tags as string[]
      }
      if (typeof source.changelog === 'string') {
        metadata.changelog = source.changelog
      }
    }

    return metadata
  }

  private static async recordModerationAction(
    mapId: string,
    moderatorId: string,
    actionType: string,
    reason?: string,
    details?: ModerationDetails,
    versionId?: string,
  ): Promise<void> {
    await query(
      `
      INSERT INTO map_submission_logs (map_id, action, performed_by, details)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
      [
        mapId,
        actionType,
        moderatorId ?? null,
        JSON.stringify({
          ...(reason ? { reason } : {}),
          ...(versionId ? { versionId } : {}),
          ...(details ?? {}),
        }),
      ],
    )
  }

  static async getMapModerationHistory(mapId: string): Promise<MapModerationActionRow[]> {
    const result = await query<MapModerationActionRow>(
      `
      SELECT msl.*, u.username as moderator_username
      FROM map_submission_logs msl
      LEFT JOIN users u ON msl.performed_by = u.id
      WHERE msl.map_id = $1
      ORDER BY msl.created_at DESC
    `,
      [mapId],
    )

    return result.rows.map((row) => ({
      ...row,
      details: MapApprovalService.normalizeJson<Record<string, unknown>>(row.details, {}),
    }))
  }

  private static async fetchMapSnapshot(mapId: string): Promise<Record<string, unknown> | null> {
    const result = await query(
      `
      SELECT 
        status,
        is_public,
        reviewed_at,
        reviewed_by,
        review_notes,
        rejection_reason,
        is_featured,
        updated_at
      FROM maps
      WHERE id = $1
    `,
      [mapId],
    )

    return result.rows[0] ?? null
  }

  // Statistics and Analytics
  static async getApprovalStats(): Promise<MapApprovalStatsRow> {
    const result = await query<{
      total_requests: number
      approved: number
      rejected: number
      pending: number
      avg_review_hours: number | null
    }>(`
      SELECT
        COUNT(*)::int as total_requests,
        COALESCE(SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END), 0)::int as approved,
        COALESCE(SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END), 0)::int as rejected,
        COALESCE(SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END), 0)::int as pending,
        AVG(CASE
          WHEN review_completed_at IS NOT NULL AND review_started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (review_completed_at - review_started_at)) / 3600
        END)::float as avg_review_hours
      FROM map_approval_requests
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `)

    return result.rows[0]
  }
}

export default MapApprovalService
