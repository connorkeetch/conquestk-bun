import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const api = axios.create({
  baseURL: API_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authService = {
  async login(credentials: { identifier: string; password: string }) {
    try {
      const response = await api.post('/auth/login', credentials)
      return response.data
    } catch (error: any) {
      // Handle verification errors specifically
      if (error.response?.data?.requiresVerification) {
        throw error.response.data;
      }
      // Extract the error message from the backend response
      const message = error.response?.data?.message || 
                     error.response?.data?.error || 
                     'Login failed. Please check your credentials.'
      throw new Error(message)
    }
  },

  async register(userData: { username: string; email: string; password: string }) {
    try {
      const response = await api.post('/auth/register', userData)
      return response.data
    } catch (error: any) {
      // Extract the error message from the backend response
      const message = error.response?.data?.message || 
                     error.response?.data?.error || 
                     'Registration failed. Please try again.'
      // Include field-specific details if available
      const details = error.response?.data?.details
      if (details && details.length > 0) {
        throw new Error(details[0].message)
      }
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
    const response = await api.post(`/auth/verify-email/${token}`)
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
}

export default authService