import type {
  ClanCreateRequest,
  ClanDetails,
  ClanListFilters,
  ClanListResponse,
} from '@/types/clans'
import apiClient from './api'

const buildListParams = (filters: ClanListFilters): Record<string, string> => {
  const params: Record<string, string> = {}

  if (filters.search) {
    params.search = filters.search
  }

  if (filters.region) {
    params.region = filters.region
  }

  if (filters.recruitmentStatus) {
    params.recruitmentStatus = filters.recruitmentStatus
  }

  if (filters.privacy) {
    params.privacy = filters.privacy
  }

  if (typeof filters.limit === 'number') {
    params.limit = String(filters.limit)
  }

  if (filters.cursor) {
    params.cursor = filters.cursor
  }

  return params
}

export const clanApi = {
  async listClans(filters: ClanListFilters = {}): Promise<ClanListResponse> {
    const response = await apiClient.get('/clans', {
      params: buildListParams(filters),
    })

    return response.data as ClanListResponse
  },

  async getClanBySlug(slug: string): Promise<ClanDetails> {
    const response = await apiClient.get(`/clans/${slug}`)
    return response.data.clan as ClanDetails
  },

  async createClan(payload: ClanCreateRequest): Promise<ClanDetails> {
    const response = await apiClient.post('/clans', payload)
    return response.data.clan as ClanDetails
  },
}

export type ClanApi = typeof clanApi
