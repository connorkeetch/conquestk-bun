import axios, { type AxiosError } from 'axios'

// Use relative URL in production, absolute URL in development
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')

const api = axios.create({
  baseURL: API_URL,
})

// Request interceptor to add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor to handle expired tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect on 401 (unauthenticated). 403 (forbidden) should not log users out.
    if (error.response?.status === 401) {
      // Don't clear token for login/register endpoints
      const isAuthEndpoint =
        error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register')

      if (!isAuthEndpoint) {
        localStorage.removeItem('token')
        // Dispatch logout action if store is available
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

export const authService = {
  async login(credentials: { identifier: string; password: string }) {
    try {
      const response = await api.post('/auth/login', credentials)
      return response.data
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>
      // Always throw the full error data if available, not just the message
      if (axiosError.response?.data) {
        throw axiosError.response.data
      }
      // Fallback for non-API errors
      throw new Error(axiosError.message || 'Login failed. Please check your credentials.')
    }
  },

  async register(userData: { username: string; email: string; password: string }) {
    try {
      const response = await api.post('/auth/register', userData)
      return response.data
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{
        message?: string
        error?: string
        field?: string
        details?: Array<{ message: string }>
        technicalDetails?: string
      }>
      // Extract the error message from the backend response
      const errorData = axiosError.response?.data

      // Check for technical details (database schema errors)
      if (errorData?.technicalDetails) {
        const technicalMsg = errorData.technicalDetails
        if (
          technicalMsg.includes('email_verified') ||
          technicalMsg.includes('verification_token')
        ) {
          throw new Error(
            'Database schema error: Please restart the server to apply migrations. If the issue persists, delete the database file and restart.',
          )
        }
        throw new Error(`Database error: ${technicalMsg}`)
      }

      // Handle field-specific errors
      if (errorData?.field) {
        throw new Error(errorData.message)
      }

      // Include field-specific details if available
      const details = errorData?.details
      if (details && details.length > 0) {
        throw new Error(details[0].message)
      }

      const message =
        errorData?.message ||
        errorData?.error ||
        axiosError.message ||
        'Registration failed. Please try again.'
      throw new Error(message)
    }
  },

  async getProfile() {
    const response = await api.get('/auth/me')
    return response.data
  },

  async logout() {
    const response = await api.post('/auth/logout')
    return response.data
  },

  async verifyEmail(token: string) {
    const response = await api.post(`/auth/verify-email/${token}`, {})
    return response.data
  },

  async resendVerification(email: string) {
    const response = await api.post('/auth/resend-verification', { email })
    return response.data
  },

  async forgotPassword(email: string) {
    const response = await api.post('/auth/forgot-password', { email })
    return response.data
  },

  async resetPassword(token: string, password: string) {
    const response = await api.post('/auth/reset-password', { token, password })
    return response.data
  },

  async updateSettings(settings: Record<string, unknown>) {
    const response = await api.put('/auth/settings', { settings })
    return response.data
  },
}

export default authService
