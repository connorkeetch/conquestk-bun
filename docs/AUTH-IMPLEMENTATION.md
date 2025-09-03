# Authentication Implementation Guide

## Overview
This document details the complete authentication system including JWT tokens, session management, rate limiting, and security measures.

## Core Components

### Backend Authentication Flow

#### Token Management (`backend/src/controllers/authController.ts`)
```typescript
// JWT token generation
const token = jwt.sign(
  { userId: user.id, email: user.email },
  JWT_SECRET,
  { expiresIn: '7d' }
)

// Token validation middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' })
    req.userId = decoded.userId
    next()
  })
}
```

#### Rate Limiting (`backend/src/middleware/rateLimiter.ts`)
```typescript
// Authentication endpoints - strict limiting
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts'
})

// Progressive slowdown for failed attempts
export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 2, // Start slowing after 2 requests
  delayMs: 1000, // Add 1 second delay per attempt
  maxDelayMs: 5000 // Maximum 5 second delay
})
```

### Frontend State Management

#### Redux Auth Slice (`frontend/src/store/authSlice.ts`)
```typescript
const initialState: AuthState = {
  user: null,
  token: getInitialToken(), // From localStorage
  isLoading: false,
  error: null,
  isAuthenticated: false // Only true after verification
}

// Async thunks for auth operations
export const checkAuth = createAsyncThunk(
  'auth/checkAuth',
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem('token')
    if (!token) return rejectWithValue('No token')
    
    try {
      const response = await authService.getProfile()
      return { user: response.user, token }
    } catch (error) {
      localStorage.removeItem('token')
      return rejectWithValue('Invalid token')
    }
  }
)
```

#### Auth Service (`frontend/src/services/authService.ts`)
```typescript
// Axios interceptor for token management
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-logout on 401/403
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (!isAuthEndpoint) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)
```

## Security Features

### 1. Password Security
- Bcrypt hashing with salt rounds
- Minimum 6 character requirement
- Password change requires current password
- Secure password reset via email tokens

### 2. Session Management
- JWT tokens with 7-day expiry
- Secure httpOnly cookies for session
- Automatic token refresh on activity
- Clean logout clearing all sessions

### 3. Rate Limiting Strategy
| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| Login/Register | 5 | 15 min | Prevent brute force |
| Password Reset | 3 | 1 hour | Prevent email spam |
| Email Resend | 3 | 1 hour | Prevent email bombing |
| API General | 100 | 1 min | Prevent DoS |
| Game Creation | 10 | 1 hour | Prevent spam |

### 4. Suspicious Activity Tracking
```typescript
export class SuspiciousActivityTracker {
  private suspiciousIPs = new Map<string, number>()
  private blockedIPs = new Set<string>()
  private readonly THRESHOLD = 10 // violations before block
  private readonly BLOCK_DURATION = 60 * 60 * 1000 // 1 hour
  
  recordViolation(ip: string) {
    const violations = (this.suspiciousIPs.get(ip) || 0) + 1
    if (violations >= this.THRESHOLD) {
      this.blockIP(ip)
    }
  }
}
```

## Route Protection

### AuthGuard Component
```typescript
const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = true,
  requireAdmin = false
}) => {
  const { isAuthenticated, user, isLoading, token } = useAppSelector(state => state.auth)
  
  // Show loading if we have token but no user yet
  if ((isLoading || (token && !user)) && requireAuth) {
    return <LoadingScreen />
  }
  
  // Redirect to login if not authenticated
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} />
  }
  
  // Check admin privileges
  if (requireAdmin && (!user || !user.isAdmin)) {
    return <Navigate to="/" />
  }
  
  return <>{children}</>
}
```

### VerificationGuard Component
```typescript
const VerificationGuard: React.FC = ({ children }) => {
  const { user } = useAppSelector(state => state.auth)
  
  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email" replace />
  }
  
  return <>{children}</>
}
```

## Account Management Features

### Password Change
```typescript
// Backend endpoint
changePassword = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { currentPassword, newPassword } = req.body
  
  // Verify current password
  const user = await this.userService.getUserById(userId)
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isValid) {
    return res.status(400).json({ error: 'Current password is incorrect' })
  }
  
  // Hash and update new password
  const hashedPassword = await bcrypt.hash(newPassword, 10)
  await this.userService.updatePassword(userId, hashedPassword)
}
```

### Account Deletion
```typescript
// With confirmation dialog
deleteAccount = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  
  // Soft delete to preserve game history
  await this.userService.deleteUser(userId)
  
  // Clear all sessions
  res.clearCookie('token')
  res.json({ message: 'Account deleted successfully' })
}
```

## Persistent Login Implementation

### App Component Initialization
```typescript
function App() {
  const dispatch = useAppDispatch()
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token')
      if (token) {
        await dispatch(checkAuth())
      }
      setInitialCheckDone(true)
    }
    initAuth()
  }, [dispatch])
  
  // Show loading during initial check
  if (!initialCheckDone && token) {
    return <LoadingScreen message="Connecting..." />
  }
}
```

### Token Lifecycle
1. **Login Success**: Token stored in localStorage
2. **Page Refresh**: Token retrieved and validated
3. **API Calls**: Token added to Authorization header
4. **401/403 Response**: Token cleared, redirect to login
5. **Manual Logout**: Token removed from storage

## Common Issues & Solutions

### "Logged in but no username showing"
**Cause**: Token exists but user data not loaded
**Solution**: Implemented proper loading states and checkAuth on mount

### "Getting logged out randomly"
**Cause**: Token expiry or server restart
**Solution**: 7-day token expiry, persistent Redux state

### "Can't access pages after login"
**Cause**: Email not verified
**Solution**: VerificationGuard redirects to verification page

### "Too many login attempts"
**Cause**: Rate limiting triggered
**Solution**: Wait 15 minutes or implement CAPTCHA (future)

## Testing Authentication

### Local Testing
```bash
# Test rate limiting
for i in {1..10}; do
  curl -X POST http://localhost:5001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"test","password":"wrong"}'
done

# Test token validation
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/auth/me
```

### Database Queries
```sql
-- Check user auth status
SELECT id, username, email, email_verified, created_at 
FROM users 
WHERE username = 'testuser';

-- View recent login attempts (if logged)
SELECT * FROM login_attempts 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Reset rate limiting (testing)
DELETE FROM rate_limit_store 
WHERE key LIKE '%::auth::%';
```

## Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] OAuth providers (Google, GitHub, Discord)
- [ ] Remember me checkbox (extend token expiry)
- [ ] Session management UI (see all active sessions)
- [ ] Password strength requirements
- [ ] CAPTCHA after failed attempts
- [ ] Biometric authentication (mobile)
- [ ] Hardware key support (WebAuthn)