import { apiClient } from './api'

export type RelationshipStatus =
  | 'self'
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'friends'
  | 'blocked_by_you'
  | 'blocked_you'

export interface RelationshipInfo {
  status: RelationshipStatus
  since?: string
}

export interface FriendSummary {
  userId: string
  username: string
  since?: string
}

export interface FriendRequestsResponse {
  incoming: Array<{ requesterId: string; requesterName: string; requestedAt: string }>
  outgoing: Array<{ requesterId: string; requesterName: string; requestedAt: string }>
}

export interface MutualFriendsResponse {
  total: number
  users: Array<{ userId: string; username: string }>
}

export const friendsService = {
  async listFriends(): Promise<FriendSummary[]> {
    const res = await apiClient.get<{ friends: FriendSummary[] }>('/friends')
    return res.data.friends ?? []
  },

  async listRequests(): Promise<FriendRequestsResponse> {
    const res = await apiClient.get<FriendRequestsResponse>('/friends/requests')
    return res.data
  },

  async sendRequest(targetUserId: string) {
    return apiClient.post('/friends/requests', { targetUserId })
  },

  async accept(requesterId: string) {
    return apiClient.post(`/friends/requests/${requesterId}/accept`)
  },

  async decline(requesterId: string) {
    return apiClient.post(`/friends/requests/${requesterId}/decline`)
  },

  async cancel(targetUserId: string) {
    return apiClient.delete(`/friends/requests/${targetUserId}`)
  },

  async unfriend(friendId: string) {
    return apiClient.delete(`/friends/${friendId}`)
  },

  async status(otherUserId: string): Promise<RelationshipInfo> {
    const res = await apiClient.get<RelationshipInfo>(`/friends/status/${otherUserId}`)
    return res.data
  },

  async mutual(otherUserId: string, limit = 6): Promise<MutualFriendsResponse> {
    const res = await apiClient.get<MutualFriendsResponse>(`/friends/mutual/${otherUserId}`, {
      params: { limit },
    })
    return res.data
  },
}

export default friendsService
