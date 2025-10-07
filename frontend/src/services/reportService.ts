import apiClient from './api'

export interface CreateReportPayload {
  reason: string
  description?: string
}

export interface ReportRecord {
  id: string
  reporter_id: string
  reported_user_id: string
  reason: string
  description?: string | null
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed'
  created_at: string
}

export const reportService = {
  async reportUser(reportedUserId: string, payload: CreateReportPayload): Promise<ReportRecord> {
    const res = await apiClient.post<{ report: ReportRecord }>(
      `/users/${encodeURIComponent(reportedUserId)}/report`,
      payload,
    )
    return res.data.report
  },
}

export default reportService
