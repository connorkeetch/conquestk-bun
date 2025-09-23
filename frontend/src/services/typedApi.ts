/**
 * Type-safe API client with proper error handling
 */

import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type {
  AdminDashboardStats,
  ApiResponse,
  AuthUser,
  GameRoom,
  GameState,
  LoginResponse,
  Map as GameMap,
  Notification,
  PaginatedResponse,
  RegisterResponse,
  User,
  UserStats,
} from '../../../shared/types'
import { API_URL } from '../config'

// Custom error class for API errors
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Type-safe API client class
class TypedApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }

        const message =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'An unexpected error occurred'

        throw new ApiError(message, error.response?.status, error.response?.data)
      },
    )
  }

  // Generic request method with type safety
  private async request<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.client.request<ApiResponse<T>>({
        method,
        url,
        data,
        ...config,
      })

      if (response.data.success === false) {
        throw new ApiError(response.data.error || 'Request failed')
      }

      return response.data.data as T
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError('Network error occurred')
    }
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('post', '/auth/login', { email, password })
  }

  async register(username: string, email: string, password: string): Promise<RegisterResponse> {
    return this.request<RegisterResponse>('post', '/auth/register', {
      username,
      email,
      password,
    })
  }

  async logout(): Promise<void> {
    return this.request<void>('post', '/auth/logout')
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('post', '/auth/verify-email', { token })
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('post', '/auth/forgot-password', { email })
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('post', '/auth/reset-password', {
      token,
      password,
    })
  }

  // User endpoints
  async getCurrentUser(): Promise<User> {
    return this.request<User>('get', '/users/me')
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    return this.request<User>('patch', '/users/me', updates)
  }

  async getUserStats(userId: string): Promise<UserStats> {
    return this.request<UserStats>('get', `/users/${userId}/stats`)
  }

  async getLeaderboard(page = 1, limit = 50): Promise<PaginatedResponse<User>> {
    return this.request<PaginatedResponse<User>>('get', '/users/leaderboard', undefined, {
      params: { page, limit },
    })
  }

  // Game endpoints
  async createGame(settings: Partial<GameRoom>): Promise<GameRoom> {
    return this.request<GameRoom>('post', '/games', settings)
  }

  async joinGame(gameId: string): Promise<GameRoom> {
    return this.request<GameRoom>('post', `/games/${gameId}/join`)
  }

  async leaveGame(gameId: string): Promise<void> {
    return this.request<void>('post', `/games/${gameId}/leave`)
  }

  async getGame(gameId: string): Promise<GameState> {
    return this.request<GameState>('get', `/games/${gameId}`)
  }

  async getActiveGames(page = 1, limit = 20): Promise<PaginatedResponse<GameRoom>> {
    return this.request<PaginatedResponse<GameRoom>>('get', '/games', undefined, {
      params: { status: 'waiting', page, limit },
    })
  }

  async getUserGames(userId: string, status?: string): Promise<GameRoom[]> {
    return this.request<GameRoom[]>('get', `/users/${userId}/games`, undefined, {
      params: { status },
    })
  }

  // Map endpoints
  async getMaps(params?: {
    isPublic?: boolean
    isFeatured?: boolean
    creatorId?: string
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<GameMap>> {
    return this.request<PaginatedResponse<GameMap>>('get', '/maps', undefined, {
      params,
    })
  }

  async getMap(mapId: string): Promise<GameMap> {
    return this.request<GameMap>('get', `/maps/${mapId}`)
  }

  async createMap(mapData: Partial<GameMap>): Promise<GameMap> {
    return this.request<GameMap>('post', '/maps', mapData)
  }

  async updateMap(mapId: string, updates: Partial<GameMap>): Promise<GameMap> {
    return this.request<GameMap>('patch', `/maps/${mapId}`, updates)
  }

  async deleteMap(mapId: string): Promise<void> {
    return this.request<void>('delete', `/maps/${mapId}`)
  }

  async uploadMapImage(mapId: string, file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData()
    formData.append('image', file)

    return this.request<{ imageUrl: string }>('post', `/maps/${mapId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  // Notification endpoints
  async getNotifications(): Promise<Notification[]> {
    return this.request<Notification[]>('get', '/notifications')
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    return this.request<void>('patch', `/notifications/${notificationId}/read`)
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request<void>('post', '/notifications/read-all')
  }

  // Admin endpoints
  async getAdminDashboard(): Promise<AdminDashboardStats> {
    return this.request<AdminDashboardStats>('get', '/admin/dashboard')
  }

  async getAdminUsers(params?: {
    search?: string
    role?: string
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<User>> {
    return this.request<PaginatedResponse<User>>('get', '/admin/users', undefined, {
      params,
    })
  }

  async banUser(userId: string, reason: string): Promise<void> {
    return this.request<void>('post', `/admin/users/${userId}/ban`, { reason })
  }

  async unbanUser(userId: string): Promise<void> {
    return this.request<void>('post', `/admin/users/${userId}/unban`)
  }

  async approveMap(mapId: string): Promise<void> {
    return this.request<void>('post', `/admin/maps/${mapId}/approve`)
  }

  async rejectMap(mapId: string, reason: string): Promise<void> {
    return this.request<void>('post', `/admin/maps/${mapId}/reject`, { reason })
  }

  async featureMap(mapId: string): Promise<void> {
    return this.request<void>('post', `/admin/maps/${mapId}/feature`)
  }

  async unfeatureMap(mapId: string): Promise<void> {
    return this.request<void>('post', `/admin/maps/${mapId}/unfeature`)
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('get', '/health')
  }
}

// Export singleton instance
export const typedApi = new TypedApiClient()

// Export for backward compatibility
export default typedApi
