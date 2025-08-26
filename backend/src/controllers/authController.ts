import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserService } from '../services/userService';
import { logger } from '../utils/logger';
import emailService from '../services/emailService';

export class AuthController {
  private userService = new UserService();

  register = async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      
      // Check if user exists with better error messages
      const existingUserByEmail = await this.userService.findByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ 
          error: 'Registration failed',
          message: 'An account with this email already exists',
          field: 'email'
        });
      }

      // Check if username is taken
      const existingUserByUsername = await this.userService.findByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ 
          error: 'Registration failed',
          message: 'This username is already taken',
          field: 'username'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Generate verification token
      const verificationToken = emailService.generateVerificationToken();
      
      const user = await this.userService.create({
        username,
        email,
        password: hashedPassword,
        verification_token: verificationToken,
        verification_sent_at: new Date(),
        email_verified: false
      });

      // Send verification email
      if (emailService.isEnabled()) {
        const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`;
        await emailService.sendVerificationEmail({
          username,
          email,
          verificationLink,
          expiresIn: '24 hours'
        });
        
        // Log verification email sent
        await this.userService.logEmailVerification({
          user_id: user.id,
          email,
          token: verificationToken
        });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      logger.error('Registration error:', error);
      return res.status(500).json({ 
        error: 'Registration failed',
        message: 'An unexpected error occurred during registration. Please try again.' 
      });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      const user = await this.userService.findByEmail(email);
      if (!user) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          message: 'No account found with this email address',
          field: 'email'
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          message: 'Incorrect password',
          field: 'password'
        });
      }

      // Check email verification if required
      const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
      if (requireVerification && !user.email_verified) {
        // Allow test accounts to bypass verification in development
        const isTestAccount = process.env.NODE_ENV === 'development' && 
                            (user.email.includes('test@') || user.username.startsWith('test_'));
        
        if (!isTestAccount) {
          return res.status(403).json({
            error: 'Email not verified',
            message: 'Please verify your email address before logging in',
            requiresVerification: true,
            email: user.email
          });
        }
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: { id: user.id, username: user.username, email: user.email }
      });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  logout = async (req: Request, res: Response) => {
    return res.json({ message: 'Logout successful' });
  };

  getProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const user = await this.userService.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          email_verified: user.email_verified 
        }
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  verifyEmail = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      // Find user by verification token
      const user = await this.userService.findByVerificationToken(token);
      
      if (!user) {
        return res.status(404).json({
          error: 'Invalid token',
          message: 'This verification link is invalid or has already been used'
        });
      }

      // Check if token has expired (24 hours)
      const sentAt = user.verification_sent_at ? new Date(user.verification_sent_at).getTime() : Date.now();
      const tokenAge = Date.now() - sentAt;
      const maxAge = parseInt(process.env.EMAIL_VERIFICATION_EXPIRE_HOURS || '24') * 60 * 60 * 1000;
      
      if (tokenAge > maxAge) {
        return res.status(400).json({
          error: 'Token expired',
          message: 'This verification link has expired. Please request a new one.',
          email: user.email
        });
      }

      // Mark email as verified
      await this.userService.verifyEmail(user.id);
      
      // Log successful verification
      await this.userService.updateEmailVerificationLog(token);

      return res.json({
        message: 'Email verified successfully',
        email: user.email
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      return res.status(500).json({ 
        error: 'Verification failed',
        message: 'An error occurred during email verification' 
      });
    }
  };

  resendVerification = async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      const user = await this.userService.findByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists
        return res.json({
          message: 'If an account exists with this email, a verification link has been sent'
        });
      }

      if (user.email_verified) {
        return res.status(400).json({
          error: 'Already verified',
          message: 'This email address has already been verified'
        });
      }

      // Check rate limiting (max 3 requests per hour)
      const recentAttempts = await this.userService.getRecentVerificationAttempts(user.id);
      if (recentAttempts >= 3) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Please wait before requesting another verification email'
        });
      }

      // Generate new verification token
      const verificationToken = emailService.generateVerificationToken();
      
      // Update user with new token
      await this.userService.updateVerificationToken(user.id, verificationToken);
      
      // Send verification email
      if (emailService.isEnabled()) {
        const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`;
        await emailService.sendVerificationEmail({
          username: user.username,
          email: user.email,
          verificationLink,
          expiresIn: '24 hours'
        });
        
        // Log verification email sent
        await this.userService.logEmailVerification({
          user_id: user.id,
          email: user.email,
          token: verificationToken
        });
      }

      return res.json({
        message: 'Verification email sent successfully'
      });
    } catch (error) {
      logger.error('Resend verification error:', error);
      return res.status(500).json({ 
        error: 'Request failed',
        message: 'Unable to send verification email' 
      });
    }
  };
}