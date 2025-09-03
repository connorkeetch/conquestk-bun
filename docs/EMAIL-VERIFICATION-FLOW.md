# Email Verification Flow

## Current Issues (Jan 2025)
1. **No UI feedback** - Registration succeeds but user doesn't know email verification is required
2. **Emails not sending** - Resend API may not be properly configured
3. **Silent failures** - Email errors are logged but user isn't notified

## What SHOULD Happen

### 1. User Clicks "Create Account"
- Frontend validates form (username, email, password match requirements)
- POST request to `/api/auth/register` with user data

### 2. Backend Registration Process
```javascript
// In authController.register():
1. Validate input data
2. Check if user already exists
3. Hash password with bcrypt
4. Create user in database
5. If EMAIL_ENABLED and REQUIRE_EMAIL_VERIFICATION:
   - Generate verification token
   - Save token and expiry to database
   - Send verification email via Resend
6. Generate JWT token
7. Return success response
```

### 3. Email Service (emailService.ts)
- Uses Resend API (requires RESEND_API_KEY)
- Sends from: noreply@send.conquestk.com
- Email contains verification link: `${FRONTEND_URL}/verify-email/${token}`

### 4. Frontend Should:
- Show success message: "Account created! Please check your email to verify."
- Redirect to login or show verification pending page
- NOT automatically log user in if verification required

### 5. User Clicks Verification Link
- Opens `/verify-email/:token` in browser
- Frontend calls `/api/auth/verify-email/:token`
- Backend marks user as verified
- User can now log in

## Current Problems

### Problem 1: No UI Feedback
**Location**: `frontend/src/store/authSlice.ts` (line 100-105)
- After successful registration, user is automatically logged in
- No message about email verification

### Problem 2: Email Sending Silently Fails
**Location**: `backend/src/controllers/authController.ts` (line 113-116)
```javascript
} catch (emailError) {
  // Log error but don't fail registration
  logger.error('Failed to send verification email:', emailError)
}
```
- Errors are caught but user isn't notified
- Registration succeeds even if email fails

### Problem 3: Environment Variables
**Required in Railway**:
- `RESEND_API_KEY` - Must be valid API key from Resend dashboard
- `EMAIL_FROM=noreply@send.conquestk.com`
- `EMAIL_FROM_NAME=ConquestK`
- `EMAIL_ENABLED=true`
- `REQUIRE_EMAIL_VERIFICATION=true`

## How to Debug

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

## Quick Fixes Needed

1. **Add UI notification after registration**
2. **Return email verification status in registration response**
3. **Add /api/auth/resend-verification endpoint**
4. **Show verification required message on login if not verified**