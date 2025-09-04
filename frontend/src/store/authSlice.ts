import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { authService } from '../services/authService'
import type { User } from '../types/user'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
}

const getInitialToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token')
  }
  return null
}

const initialState: AuthState = {
  user: null,
  token: getInitialToken(),
  isLoading: false,
  error: null,
  isAuthenticated: false, // Don't set to true until we verify the token and load user
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { identifier: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials)
      localStorage.setItem('token', response.token)
      return response
    } catch (error: any) {
      // authService throws the error.response.data directly for API errors
      // or an Error object for other errors
      if (error.message && !error.error) {
        // This is a plain Error object, extract message
        return rejectWithValue({ message: error.message })
      }
      // This is the full error response from the backend
      return rejectWithValue(error)
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

export const checkAuth = createAsyncThunk('auth/checkAuth', async (_, { rejectWithValue, dispatch }) => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      return rejectWithValue('No token found')
    }

    const response = await authService.getProfile()
    
    // Load server settings into Redux if they exist
    if (response.user.settings) {
      const { loadServerSettings } = await import('./settingsSlice')
      dispatch(loadServerSettings(response.user.settings))
    }
    
    return { user: response.user, token }
  } catch (error: any) {
    // If it's a 401 or 403, the token is invalid
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token')
      return rejectWithValue('Invalid token')
    }
    // For other errors (network, server down), also clear auth to avoid confusion
    localStorage.removeItem('token')
    return rejectWithValue(error.message || 'Auth check failed')
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null
      state.token = null
      state.isAuthenticated = false
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
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        // Extract error message from the payload
        const payload = action.payload as any
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
      })
      .addCase(checkAuth.rejected, (state) => {
        state.isLoading = false
        // Always clear auth state on checkAuth failure to avoid confusion
        state.user = null
        state.token = null
        state.isAuthenticated = false
        localStorage.removeItem('token')
      })
  },
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer
