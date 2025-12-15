import api from './api'

export interface DraftImagePayload {
  data: string
  mimeType?: string
  filename?: string
}

export interface MapDraftPayload {
  id?: string
  name?: string
  description?: string
  data?: Record<string, unknown>
  territories?: unknown[]
  sectors?: unknown[]
  adjacencies?: unknown[]
  capitalAssignments?: Record<string, string[]>
  image?: DraftImagePayload | null
  imageUrl?: string | null
  imageWidth?: number
  imageHeight?: number
  tags?: string[]
  isPublic?: boolean
  parentMapId?: string
}

export interface MapDraftResponse {
  id: string
  name: string
  description?: string
  data: Record<string, unknown>
  territories: unknown[]
  sectors: unknown[]
  adjacencies: unknown[]
  capitalAssignments: Record<string, string[]>
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  draftStatus?: string
  parentMapId?: string | null
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface SaveDraftResult {
  success: boolean
  draft: MapDraftResponse
}

export interface DraftListResponse {
  success: boolean
  drafts: MapDraftResponse[]
}

export interface PublishDraftResponse {
  success: boolean
  map: Record<string, unknown>
}

export const mapWorkflowApi = {
  async saveDraft(payload: MapDraftPayload): Promise<SaveDraftResult> {
    const response = await api.post<SaveDraftResult>('/workflow/drafts', payload)
    return response.data
  },

  async listDrafts(): Promise<DraftListResponse> {
    const response = await api.get<DraftListResponse>('/workflow/drafts')
    return response.data
  },

  async getDraft(draftId: string): Promise<SaveDraftResult> {
    const response = await api.get<SaveDraftResult>(`/workflow/drafts/${draftId}`)
    return response.data
  },

  async publishDraft(draftId: string): Promise<PublishDraftResponse> {
    const response = await api.post<PublishDraftResponse>(`/workflow/drafts/${draftId}/publish`)
    return response.data
  },

  async checkMapName(
    name: string,
    excludeMapId?: string,
  ): Promise<{ success: boolean; available: boolean; existingMapId?: string }> {
    const params = new URLSearchParams({ name })
    if (excludeMapId) {
      params.append('excludeMapId', excludeMapId)
    }
    const response = await api.get<{
      success: boolean
      available: boolean
      existingMapId?: string
    }>(`/workflow/check-name?${params.toString()}`)
    return response.data
  },
}

export default mapWorkflowApi
