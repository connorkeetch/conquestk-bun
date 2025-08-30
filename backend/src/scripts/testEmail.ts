import dotenv from 'dotenv'
dotenv.config()

import emailService from '../services/emailService'

async function testEmail() {
  console.log('🚀 Testing Resend email service...')
  
  const testEmail = 'connorkeetch@gmail.com' // Your email for testing
  const testUsername = 'TestUser'
  const testToken = 'test-token-123'
  
  console.log(`📧 Sending test email to: ${testEmail}`)
  
  try {
    // Test verification email
    const verificationResult = await emailService.sendVerificationEmail({
      username: testUsername,
      email: testEmail,
      verificationLink: `http://localhost:5173/verify-email/${testToken}`,
      expiresIn: '24 hours'
    })
    
    if (verificationResult) {
      console.log('✅ Verification email sent successfully!')
    } else {
      console.log('❌ Failed to send verification email')
    }
    
    // Wait a bit before sending the next email
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Test password reset email
    const resetResult = await emailService.sendPasswordResetEmail({
      username: testUsername,
      email: testEmail,
      resetLink: `http://localhost:5173/reset-password/${testToken}`,
      expiresIn: '1 hour'
    })
    
    if (resetResult) {
      console.log('✅ Password reset email sent successfully!')
    } else {
      console.log('❌ Failed to send password reset email')
    }
    
    console.log('\n📊 Email service status:', emailService.isEnabled() ? 'Enabled' : 'Disabled')
    
  } catch (error) {
    console.error('❌ Error testing email:', error)
  }
  
  process.exit(0)
}

testEmail()