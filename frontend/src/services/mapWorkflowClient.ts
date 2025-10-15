import axios from 'axios'
import { API_URL } from '@/config'

export interface MapDraftPayload {
  id?: string
  name?: string
  description?: string
  data?: Record<string, unknown>
  territories?: unknown[]
  sectors?: Array<{
    id: string
    name: string
    territories: string[]
    bonusArmies: number
    color?: string
  }>
  adjacencies?: Array<{ from: string; to: string }>
  capitalAssignments?: Record<string, string[]>
  tags?: string[]
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  isPublic?: boolean
  stagingImageId?: string | null
  parentMapId?: string | null
}

export interface MapDraftRecord {
  id: string
  userId: string
  name: string
  description?: string | null
  data: Record<string, unknown>
  territories?: unknown
  sectors?: unknown
  adjacencies?: unknown
  capitalAssignments?: Record<string, string[]>
  tags?: string[]
  thumbnailUrl?: string | null
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  draftStatus?: string | null
  validationStatus?: string | null
  isPublic?: boolean | null
  createdAt: string
  updatedAt: string
}

const api = axios.create({ baseURL: `${API_URL}/workflow` })

api.interceptors.request.use((config) => {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
    if (token && token !== 'null' && token !== 'undefined') {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // ignore storage errors
  }
  return config
})

export const mapWorkflowClient = {
  async saveDraft(payload: MapDraftPayload): Promise<MapDraftRecord> {
    const res = await api.post('/drafts', payload)
    return res.data as MapDraftRecord
  },

  async getDrafts(): Promise<MapDraftRecord[]> {
    const res = await api.get('/drafts')
    return (res.data || []) as MapDraftRecord[]
  },

  async getDraft(draftId: string): Promise<MapDraftRecord> {
    const res = await api.get(`/drafts/${draftId}`)
    return res.data as MapDraftRecord
  },

  async publishDraft(draftId: string): Promise<{ mapId: string }> {
    const res = await api.post(`/drafts/${draftId}/publish`)
    return res.data as { mapId: string }
  },

  async submitForReview(mapId: string): Promise<{ ok: boolean }> {
    const res = await api.post(`/maps/${mapId}/submit`)
    return res.data as { ok: boolean }
  },
}

export type { MapDraftPayload as PolygonMapDraftPayload }
