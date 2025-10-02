import dotenv from 'dotenv'

dotenv.config()

import emailService from '../services/emailService'
import { logger } from '../utils/logger'

async function testEmail() {
  const testEmail = 'connorkeetch@gmail.com' // Your email for testing
  const testUsername = 'TestUser'
  const testToken = 'test-token-123'

  try {
    // Test verification email
    const verificationResult = await emailService.sendVerificationEmail({
      username: testUsername,
      email: testEmail,
      verificationLink: `http://localhost:5173/verify-email/${testToken}`,
      expiresIn: '24 hours',
    })

    if (verificationResult) {
      logger.info('✅ Verification email sent successfully', { testEmail })
    } else {
      logger.warn('⚠️ Verification email service returned falsy result', { testEmail })
    }

    // Wait a bit before sending the next email
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Test password reset email
    const resetResult = await emailService.sendPasswordResetEmail({
      username: testUsername,
      email: testEmail,
      resetLink: `http://localhost:5173/reset-password/${testToken}`,
      expiresIn: '1 hour',
    })

    if (resetResult) {
      logger.info('✅ Password reset email sent successfully', { testEmail })
    } else {
      logger.warn('⚠️ Password reset email service returned falsy result', { testEmail })
    }
  } catch (error) {
    logger.error('❌ Test email script encountered an error', { error })
  }

  process.exit(0)
}

testEmail()
