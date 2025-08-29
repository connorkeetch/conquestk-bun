import bcrypt from 'bcryptjs'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import emailService from '../services/emailService'
import { UserService } from '../services/userService'
import { logger } from '../utils/logger'

export class AuthController {
  private userService = new UserService()

  register = async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body

      logger.info('Registration attempt:', { username, email })

      // Check if user exists with better error messages
      const existingUserByEmail = await this.userService.findByEmail(email)
      if (existingUserByEmail) {
        return res.status(400).json({
          error: 'Registration failed',
          message: 'An account with this email already exists',
          field: 'email',
        })
      }

      // Check if username is taken
      const existingUserByUsername = await this.userService.findByUsername(username)
      if (existingUserByUsername) {
        return res.status(400).json({
          error: 'Registration failed',
          message: 'This username is already taken',
          field: 'username',
        })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      // Only generate verification token if email service is enabled
      let verificationToken = null
      let verificationSentAt = null

      if (emailService.isEnabled()) {
        verificationToken = emailService.generateVerificationToken()
        verificationSentAt = new Date()
      }

      let user
      try {
        logger.info('Creating user with data:', {
          username,
          email,
          hasVerificationToken: !!verificationToken,
          emailServiceEnabled: emailService.isEnabled(),
        })

        user = await this.userService.create({
          username,
          email,
          password: hashedPassword,
          verification_token: verificationToken,
          verification_sent_at: verificationSentAt,
          email_verified: !emailService.isEnabled(), // Auto-verify if email service is disabled
        })

        logger.info('User created successfully:', { userId: user.id, username: user.username })
      } catch (createError) {
        logger.error('Failed to create user in database:', createError)
        logger.error('Error details:', {
          message: (createError as any).message,
          code: (createError as any).code,
          detail: (createError as any).detail,
        })

        // Provide more specific error message based on the error
        const errorMessage = (createError as any).message || ''
        if (
          errorMessage.includes('email_verified') ||
          errorMessage.includes('verification_token')
        ) {
          return res.status(500).json({
            error: 'Database schema error',
            message:
              'Database is missing required columns. Please restart the server to apply migrations.',
            technicalDetails: errorMessage,
          })
        }

        return res.status(500).json({
          error: 'Database error',
          message: 'Failed to create user in database. Please check server logs.',
          technicalDetails: errorMessage,
        })
      }

      // Send verification email only if service is enabled
      if (emailService.isEnabled() && verificationToken) {
        try {
          const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`
          await emailService.sendVerificationEmail({
            username,
            email,
            verificationLink,
            expiresIn: '24 hours',
          })

          // Log verification email sent
          await this.userService.logEmailVerification({
            user_id: user.id,
            email,
            token: verificationToken,
          })
        } catch (emailError) {
          // Log error but don't fail registration
          logger.error('Failed to send verification email:', emailError)
        }
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', {
        expiresIn: '24h',
      })

      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.is_admin || false,
          adminLevel: user.admin_level || 0,
        },
      })
    } catch (error) {
      logger.error('Registration error:', error)
      logger.error('Full error details:', {
        message: (error as any).message,
        stack: (error as any).stack,
        code: (error as any).code,
      })

      return res.status(500).json({
        error: 'Registration failed',
        message: 'An unexpected error occurred during registration. Please check server logs.',
        technicalDetails: (error as any).message,
      })
    }
  }

  login = async (req: Request, res: Response) => {
    try {
      // Support both email and identifier fields for backwards compatibility
      const identifier = req.body.identifier || req.body.email
      const { password } = req.body

      if (!identifier) {
        return res.status(400).json({
          error: 'Missing credentials',
          message: 'Please provide username or email',
          field: 'identifier',
        })
      }

      // Check if identifier is email or username
      const isEmail = identifier.includes('@')
      const user = isEmail
        ? await this.userService.findByEmail(identifier)
        : await this.userService.findByUsername(identifier)

      if (!user) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid credentials',
          field: 'identifier',
        })
      }

      const validPassword = await bcrypt.compare(password, user.password)
      if (!validPassword) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid credentials',
          field: 'password',
        })
      }

      // Check email verification if required
      const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
      if (requireVerification && !user.email_verified) {
        // Allow test accounts to bypass verification in development
        const isTestAccount =
          process.env.NODE_ENV === 'development' &&
          (user.email.includes('test@') || user.username.startsWith('test_'))

        if (!isTestAccount) {
          return res.status(403).json({
            error: 'Email not verified',
            message: 'Please verify your email address before logging in',
            requiresVerification: true,
            email: user.email,
          })
        }
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', {
        expiresIn: '24h',
      })

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.is_admin || false,
          adminLevel: user.admin_level || 0,
        },
      })
    } catch (error) {
      logger.error('Login error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  logout = async (_req: Request, res: Response) => {
    return res.json({ message: 'Logout successful' })
  }

  getProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId
      const user = await this.userService.findById(userId)

      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          email_verified: user.email_verified,
          isAdmin: user.is_admin || false,
          adminLevel: user.admin_level || 0,
        },
      })
    } catch (error) {
      logger.error('Get profile error:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }

  verifyEmail = async (req: Request, res: Response) => {
    try {
      const { token } = req.params

      // Find user by verification token
      const user = await this.userService.findByVerificationToken(token)

      if (!user) {
        return res.status(404).json({
          error: 'Invalid token',
          message: 'This verification link is invalid or has already been used',
        })
      }

      // Check if token has expired (24 hours)
      const sentAt = user.verification_sent_at
        ? new Date(user.verification_sent_at).getTime()
        : Date.now()
      const tokenAge = Date.now() - sentAt
      const maxAge =
        parseInt(process.env.EMAIL_VERIFICATION_EXPIRE_HOURS || '24', 10) * 60 * 60 * 1000

      if (tokenAge > maxAge) {
        return res.status(400).json({
          error: 'Token expired',
          message: 'This verification link has expired. Please request a new one.',
          email: user.email,
        })
      }

      // Mark email as verified
      await this.userService.verifyEmail(user.id)

      // Log successful verification
      await this.userService.updateEmailVerificationLog(token)

      return res.json({
        message: 'Email verified successfully',
        email: user.email,
      })
    } catch (error) {
      logger.error('Email verification error:', error)
      return res.status(500).json({
        error: 'Verification failed',
        message: 'An error occurred during email verification',
      })
    }
  }

  forgotPassword = async (req: Request, res: Response) => {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({
          error: 'Email required',
          message: 'Please provide your email address',
        })
      }

      const user = await this.userService.findByEmail(email)

      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({
          message: 'If an account exists with this email, a password reset link has been sent',
        })
      }

      // Check rate limiting (max 3 requests per hour)
      const recentAttempts = await this.userService.getRecentPasswordResetAttempts(user.id)
      if (recentAttempts >= 3) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Please wait before requesting another password reset',
        })
      }

      // Generate reset token
      const resetToken = emailService.generateVerificationToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Save token to database
      await this.userService.createPasswordResetToken({
        user_id: user.id,
        token: resetToken,
        expires_at: expiresAt,
      })

      // Send reset email
      if (emailService.isEnabled()) {
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`
        await emailService.sendPasswordResetEmail({
          username: user.username,
          email: user.email,
          resetLink,
          expiresIn: '1 hour',
        })
      }

      return res.json({
        message: 'If an account exists with this email, a password reset link has been sent',
      })
    } catch (error) {
      logger.error('Forgot password error:', error)
      return res.status(500).json({
        error: 'Request failed',
        message: 'Unable to process password reset request',
      })
    }
  }

  resetPassword = async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body

      if (!token || !password) {
        return res.status(400).json({
          error: 'Missing fields',
          message: 'Token and new password are required',
        })
      }

      // Find and validate token
      const resetToken = await this.userService.findPasswordResetToken(token)

      if (!resetToken) {
        return res.status(404).json({
          error: 'Invalid token',
          message: 'This reset link is invalid or has already been used',
        })
      }

      // Check if token has expired
      if (new Date() > new Date(resetToken.expires_at)) {
        return res.status(400).json({
          error: 'Token expired',
          message: 'This reset link has expired. Please request a new one.',
        })
      }

      if (resetToken.used) {
        return res.status(400).json({
          error: 'Token already used',
          message: 'This reset link has already been used',
        })
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Update user password
      await this.userService.updatePassword(resetToken.user_id, hashedPassword)

      // Mark token as used
      await this.userService.markPasswordResetTokenUsed(token)

      return res.json({
        message: 'Password reset successfully',
      })
    } catch (error) {
      logger.error('Reset password error:', error)
      return res.status(500).json({
        error: 'Reset failed',
        message: 'Unable to reset password',
      })
    }
  }

  resendVerification = async (req: Request, res: Response) => {
    try {
      const { email } = req.body

      const user = await this.userService.findByEmail(email)

      if (!user) {
        // Don't reveal if email exists
        return res.json({
          message: 'If an account exists with this email, a verification link has been sent',
        })
      }

      if (user.email_verified) {
        return res.status(400).json({
          error: 'Already verified',
          message: 'This email address has already been verified',
        })
      }

      // Check rate limiting (max 3 requests per hour)
      const recentAttempts = await this.userService.getRecentVerificationAttempts(user.id)
      if (recentAttempts >= 3) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Please wait before requesting another verification email',
        })
      }

      // Generate new verification token
      const verificationToken = emailService.generateVerificationToken()

      // Update user with new token
      await this.userService.updateVerificationToken(user.id, verificationToken)

      // Send verification email
      if (emailService.isEnabled()) {
        const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`
        await emailService.sendVerificationEmail({
          username: user.username,
          email: user.email,
          verificationLink,
          expiresIn: '24 hours',
        })

        // Log verification email sent
        await this.userService.logEmailVerification({
          user_id: user.id,
          email: user.email,
          token: verificationToken,
        })
      }

      return res.json({
        message: 'Verification email sent successfully',
      })
    } catch (error) {
      logger.error('Resend verification error:', error)
      return res.status(500).json({
        error: 'Request failed',
        message: 'Unable to send verification email',
      })
    }
  }
}
