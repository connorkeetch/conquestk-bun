import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { AxiosError } from 'axios'
import { applyTheme } from '../config/themes.config'
import { authService } from '../services/authService'
import type { User } from '../types/user'
import { isTokenExpired } from '../utils/token'
import { loadServerSettings } from './settingsSlice'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  requiresEmailVerification: boolean
}

const getInitialToken = () => {
  if (typeof window !== 'undefined') {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      return null
    }

    if (isTokenExpired(storedToken, 30)) {
      localStorage.removeItem('token')
      return null
    }

    return storedToken
  }

  return null
}

const initialState: AuthState = {
  user: null,
  token: getInitialToken(),
  isLoading: false,
  error: null,
  isAuthenticated: false, // Don't set to true until we verify the token and load user
  requiresEmailVerification: false,
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { identifier: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials)
      localStorage.setItem('token', response.token)

      // Apply theme from user preferences if available
      if (response.user?.preferences?.theme) {
        applyTheme(response.user.preferences.theme)
        localStorage.setItem('colorTheme', response.user.preferences.theme)
      }

      return response
    } catch (error: unknown) {
      if (error && typeof error === 'object') {
        const errObj = error as { message?: string; error?: string }
        if (errObj.message && !errObj.error) {
          return rejectWithValue({ message: errObj.message })
        }
        return rejectWithValue(errObj)
      }

      return rejectWithValue({ message: 'Login failed. Please check your credentials.' })
    }
  },
)

export const register = createAsyncThunk(
  'auth/register',
  async (userData: { username: string; email: string; password: string }) => {
    const response = await authService.register(userData)
    localStorage.setItem('token', response.token)
    return response
  },
)

export const checkAuth = createAsyncThunk(
  'auth/checkAuth',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        return rejectWithValue('No token found')
      }

      if (isTokenExpired(token, 30)) {
        localStorage.removeItem('token')
        return rejectWithValue('Token expired')
      }

      const response = await authService.getProfile()

      // Load server settings into Redux if they exist
      if (response.user.settings) {
        dispatch(loadServerSettings(response.user.settings))
      }

      // Apply theme from user preferences if available
      if (response.user?.preferences?.theme) {
        applyTheme(response.user.preferences.theme)
        localStorage.setItem('colorTheme', response.user.preferences.theme)
      }

      return { user: response.user, token }
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>
      // If it's a 401 or 403, the token is invalid
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        localStorage.removeItem('token')
        return rejectWithValue('Invalid token')
      }
      // For other errors (network, server down), also clear auth to avoid confusion
      localStorage.removeItem('token')
      return rejectWithValue(axiosError.message || 'Auth check failed')
    }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.requiresEmailVerification = false
      localStorage.removeItem('token')
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
        state.requiresEmailVerification = !action.payload.user?.emailVerified
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        // Extract error message from the payload
        const payload = action.payload as { message?: string } | undefined
        state.error = payload?.message || action.error.message || 'Login failed'
      })
      .addCase(register.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
        state.requiresEmailVerification = !action.payload.user?.emailVerified
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Registration failed'
      })
      .addCase(checkAuth.pending, (state) => {
        state.isLoading = true
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
        state.requiresEmailVerification = !action.payload.user.emailVerified
      })
      .addCase(checkAuth.rejected, (state) => {
        state.isLoading = false
        // Always clear auth state on checkAuth failure to avoid confusion
        state.user = null
        state.token = null
        state.isAuthenticated = false
        state.requiresEmailVerification = false
        localStorage.removeItem('token')
      })
  },
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer
