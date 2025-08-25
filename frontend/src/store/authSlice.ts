import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authService } from '../services/authService'
import { User } from '../types/user'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,
  isAuthenticated: !!localStorage.getItem('token'),
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }) => {
    const response = await authService.login(credentials)
    localStorage.setItem('token', response.token)
    return response
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (userData: { username: string; email: string; password: string }) => {
    const response = await authService.register(userData)
    localStorage.setItem('token', response.token)
    return response
  }
)

export const checkAuth = createAsyncThunk('auth/checkAuth', async () => {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('No token found')
  
  try {
    const response = await authService.getProfile()
    return { user: response.user, token }
  } catch (error: any) {
    // If it's a 401, the token is invalid
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      throw error
    }
    // For other errors (network, server down), keep the token but throw error
    throw error
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
        state.error = action.error.message || 'Login failed'
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
      .addCase(checkAuth.rejected, (state, action) => {
        state.isLoading = false
        // Only clear auth if it was a 401 (handled in the thunk)
        // For other errors, keep the existing state
        if (action.error.message === 'No token found') {
          state.user = null
          state.token = null
          state.isAuthenticated = false
        }
      })
  },
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer