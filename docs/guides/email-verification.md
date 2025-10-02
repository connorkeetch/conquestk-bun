# Email Verification System Documentation

## Overview
The email verification system ensures users confirm their email addresses before accessing game features. This document covers the complete implementation including backend services, frontend flows, and troubleshooting.

## Architecture

### Backend Components

#### Email Service (`backend/src/services/emailService.ts`)
- Integrates with Resend API for email delivery
- Sends verification and password reset emails
- HTML email templates with branded styling
- Configurable via environment variables

#### Database Schema
```sql
-- users table columns
email_verified BOOLEAN DEFAULT FALSE,
verification_token TEXT UNIQUE,
verification_token_expires TIMESTAMP,
password_reset_token TEXT UNIQUE,
password_reset_expires TIMESTAMP
```

#### API Endpoints
- `POST /api/auth/register` - Creates user with verification token
- `POST /api/auth/verify-email/:token` - Verifies email with token
- `POST /api/auth/resend-verification` - Resends verification email
- `POST /api/auth/login` - Returns token even if unverified (for verification page access)

### Frontend Components

#### VerificationGuard (`frontend/src/components/VerificationGuard.tsx`)
- Wraps protected routes requiring email verification
- Redirects unverified users to `/verify-email`
- Shows loading state during verification check

#### VerifyEmail Page (`frontend/src/pages/VerifyEmail.tsx`)
- Displays current email address
- Resend verification button with rate limiting
- Success/error messaging
- "They always come back" tagline

#### Settings Integration
- Visual verification status indicator
- Blue checkmark for verified emails
- Red warning for unverified emails
- Located in Account section

## User Flow

### Registration Flow
1. User registers with email/username/password
2. Backend creates verification token (expires in 24 hours)
3. Verification email sent automatically
4. User redirected to verification page
5. User clicks email link → `/verify-email/:token`
6. Token validated and email marked as verified
7. User can now access all features

### Login Flow (Unverified)
1. User logs in with correct credentials
2. Backend returns token regardless of verification status
3. Frontend detects unverified email
4. Redirects to `/verify-email` page
5. User can resend verification or check email

### Resend Flow
1. User clicks "Resend Verification Email"
2. Rate limited to 3 requests per hour
3. New token generated (previous invalidated)
4. New email sent with 24-hour expiry
5. Success/error feedback displayed

## Configuration

### Environment Variables
```bash
# Email Service (Required)
RESEND_API_KEY=re_xxxxxxxxxxxxx              # From Resend dashboard
EMAIL_FROM=noreply@updates.conquestk.com     # Verified domain
EMAIL_FROM_NAME=ConquestK                    # Display name
EMAIL_ENABLED=true                           # Enable/disable emails

# Optional
EMAIL_OVERRIDE=dev@example.com               # Override recipient (dev only)
```

### Rate Limiting
- Login: 5 attempts per 15 minutes per IP
- Resend verification: 3 requests per hour per email
- Password reset: 3 requests per hour per email

## Security Considerations

1. **Token Security**
   - Tokens are cryptographically random (32 bytes)
   - Single use - invalidated after verification
   - 24-hour expiry for verification tokens
   - 1-hour expiry for password reset tokens

2. **Rate Limiting**
   - Prevents email bombing
   - IP-based for authentication
   - Email-based for verification resends

3. **Email Validation**
   - Backend validates email format
   - Duplicate email prevention
   - Case-insensitive email matching

## Troubleshooting

### Common Issues

#### "Email not sending"
1. Check `EMAIL_ENABLED=true` in `.env`
2. Verify `RESEND_API_KEY` is valid
3. Confirm domain verification in Resend dashboard
4. Check Resend API logs for errors

#### "Verification link expired"
- Tokens expire after 24 hours
- User must request new verification email
- Previous tokens are invalidated

#### "Rate limit exceeded"
- Wait for rate limit window to reset
- Auth: 15 minutes
- Resend: 1 hour
- Check `backend/src/middleware/rateLimiter.ts` for limits

#### "Already verified but still blocked"
1. Clear browser cache/localStorage
2. Log out and log in again
3. Check Redux state for stale data

### Testing Locally

1. **Setup Resend (Production emails)**
   ```bash
   # In backend/.env
   RESEND_API_KEY=your_api_key
   EMAIL_FROM=noreply@updates.conquestk.com
   EMAIL_ENABLED=true
   ```

2. **Disable emails (Development)**
   ```bash
   EMAIL_ENABLED=false
   ```

3. **Override recipient (Development)**
   ```bash
   EMAIL_OVERRIDE=your-test@email.com
   ```

4. **Manual token verification**
   ```sql
   -- Check user's verification status
   SELECT email, email_verified, verification_token 
   FROM users 
   WHERE email = 'user@example.com';
   
   -- Manually verify (testing only)
   UPDATE users 
   SET email_verified = true, 
       verification_token = NULL 
   WHERE email = 'user@example.com';
   ```

## Implementation Details

### React State Management
- Uses Redux Toolkit for auth state
- `checkAuth` thunk validates token on app load
- Auth interceptors handle 401/403 responses
- Persistent login via localStorage token

### Component Lifecycle
```typescript
// App.tsx - Initial auth check
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
```

### Error Handling
- Backend returns structured error responses
- Frontend displays user-friendly messages
- Automatic logout on invalid tokens
- Graceful degradation if email service fails

## Recent Updates (January 2025)

1. **Dedicated Verification Page**
   - Replaced inline error messages with full page
   - Better UX for unverified users
   - Clear call-to-action for email verification

2. **Settings Integration**
   - Added verification status indicator
   - Color-coded status (blue=verified, red=unverified)
   - Integrated with account management section

3. **Auth State Fixes**
   - Fixed token/user synchronization issues
   - Proper loading states during verification
   - Persistent login across page refreshes

4. **Rate Limiting Adjustments**
   - Refined limits based on usage patterns
   - Separate limits for different operations
   - Suspicious activity tracking

## Troubleshooting Guide

### Current Issues (January 2025)
1. **No UI feedback** - Registration succeeds but user doesn't know email verification is required
2. **Emails not sending** - Resend API may not be properly configured
3. **Silent failures** - Email errors are logged but user isn't notified

### Debug Steps
1. **Check if email service is initialized**:
   - Look for "✅ Email service initialized with Resend" in logs
   - Or "⚠️ Email service disabled" if EMAIL_ENABLED=false

2. **Check Resend API**:
   - Go to https://resend.com/domains
   - Verify send.conquestk.com is verified
   - Check API key is active

3. **Test email directly**:
   ```bash
   cd backend
   npm run test:email
   ```

4. **Check logs for**:
   - "Sending verification email to: [email]"
   - "Failed to send verification email:" (indicates error)

### Known Issues

**Problem 1: No UI Feedback**
- Location: `frontend/src/store/authSlice.ts` (line 100-105)
- After successful registration, user is automatically logged in
- No message about email verification

**Problem 2: Email Sending Silently Fails**
- Location: `backend/src/controllers/authController.ts` (line 113-116)
- Errors are caught but user isn't notified
- Registration succeeds even if email fails

### Quick Fixes Needed
1. Add UI notification after registration
2. Return email verification status in registration response
3. Add /api/auth/resend-verification endpoint
4. Show verification required message on login if not verified

## Future Enhancements

- [ ] Email change functionality with re-verification
- [ ] Email notification preferences
- [ ] OAuth integration (skip email verification)
- [ ] Admin tools for manual verification
- [ ] Bulk email operations for admins
- [ ] Email analytics and delivery tracking