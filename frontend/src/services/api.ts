import axios from 'axios'
import { API_URL } from '../config'

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  // Only add Authorization header if token exists and is not null/undefined
  if (token && token !== 'null' && token !== 'undefined') {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
// Prevent runaway redirect loops on 401s
let isRedirectingOn401 = false

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    // Only redirect on 401 (unauthenticated). Do NOT redirect on 403 (authorization) —
    // many endpoints legitimately return 403 when the user lacks permission
    // (e.g., game chat before joining). Redirecting on 403 logs users out unnecessarily.
    if (status === 401) {
      const token = localStorage.getItem('token')
      // Always clear any bad token
      if (token) localStorage.removeItem('token')

      // Only redirect if we previously had a token (i.e., user was logged in),
      // we're not already on an auth page, and we haven't redirected yet.
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      const isAuthRoute =
        path.startsWith('/login') ||
        path.startsWith('/register') ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/reset-password')

      if (token && !isAuthRoute && !isRedirectingOn401) {
        isRedirectingOn401 = true
        // Use assign to avoid polluting history with unnecessary entries
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
