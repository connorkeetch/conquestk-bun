import { Resend } from 'resend'
import { v4 as uuidv4 } from 'uuid'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text: string
}

interface VerificationEmailData {
  username: string
  email: string
  verificationLink: string
  expiresIn: string
}

class EmailService {
  private resend: Resend | null = null
  private emailEnabled: boolean = false

  constructor() {
    this.initialize()
  }

  private initialize() {
    // Use Resend API key from environment only (no hardcoded fallback for security)
    const apiKey = process.env.RESEND_API_KEY
    this.emailEnabled = process.env.EMAIL_ENABLED !== 'false' // Default to enabled

    if (apiKey && this.emailEnabled) {
      this.resend = new Resend(apiKey)
      console.log('✅ Email service initialized with Resend')
    } else {
      if (!apiKey) {
        console.log('⚠️ Email service disabled - RESEND_API_KEY not configured')
      } else {
        console.log('⚠️ Email service disabled - EMAIL_ENABLED is false')
      }
      this.emailEnabled = false
    }
  }

  private async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.emailEnabled || !this.resend) {
      console.log('⚠️ Email not sent - service disabled')
      return false
    }

    // Use verified domain email (send.conquestk.com is configured for Resend)
    const fromEmail = process.env.EMAIL_FROM || 'noreply@send.conquestk.com'
    const fromName = process.env.EMAIL_FROM_NAME || 'ConquestK'

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      })

      if (error) {
        console.error('❌ Email send error:', error)
        return false
      }

      console.log('✅ Email sent successfully:', data?.id)
      return true
    } catch (error) {
      console.error('❌ Email service error:', error)
      return false
    }
  }

  public generateVerificationToken(): string {
    return uuidv4()
  }

  public async sendVerificationEmail(data: VerificationEmailData): Promise<boolean> {
    const subject = 'Verify Your ConquestK Account'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #1a1a2e;
            color: #ffffff;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #e94560;
            margin-bottom: 10px;
          }
          .content {
            background-color: #0f3460;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          }
          h1 {
            color: #ffffff;
            font-size: 24px;
            margin-bottom: 20px;
          }
          p {
            color: #e0e0e0;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background-color: #e94560;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .button:hover {
            background-color: #d63850;
          }
          .info-box {
            background-color: #16213e;
            border-left: 4px solid #e94560;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #888;
            font-size: 14px;
          }
          .link {
            color: #e94560;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎮 ConquestK</div>
            <p style="color: #888;">Strategic Conquest Gaming</p>
          </div>
          
          <div class="content">
            <h1>Welcome to ConquestK, ${data.username}!</h1>
            
            <p>Thank you for joining our strategic conquest community. To complete your registration and start playing, please verify your email address.</p>
            
            <div style="text-align: center;">
              <a href="${data.verificationLink}" class="button">Verify Email Address</a>
            </div>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>⏱️ This link expires in:</strong> ${data.expiresIn}</p>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p class="link">${data.verificationLink}</p>
            
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
          
          <div class="footer">
            <p>© 2024 ConquestK. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const text = `
Welcome to ConquestK, ${data.username}!

Thank you for joining our strategic conquest community. To complete your registration and start playing, please verify your email address.

Verify your email by clicking this link:
${data.verificationLink}

This link expires in ${data.expiresIn}.

If you didn't create an account, you can safely ignore this email.

© 2024 ConquestK. All rights reserved.
    `.trim()

    return await this.sendEmail({
      to: data.email,
      subject,
      html,
      text,
    })
  }

  public async sendPasswordResetEmail(data: {
    username: string
    email: string
    resetLink: string
    expiresIn: string
  }): Promise<boolean> {
    const subject = 'Reset Your ConquestK Password'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #1a1a2e;
            color: #ffffff;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #e94560;
            margin-bottom: 10px;
          }
          .content {
            background-color: #0f3460;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          }
          h1 {
            color: #ffffff;
            font-size: 24px;
            margin-bottom: 20px;
          }
          p {
            color: #e0e0e0;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background-color: #e94560;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .warning-box {
            background-color: #3e1616;
            border-left: 4px solid #ff6b6b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #888;
            font-size: 14px;
          }
          .link {
            color: #e94560;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎮 ConquestK</div>
            <p style="color: #888;">Password Reset Request</p>
          </div>
          
          <div class="content">
            <h1>Password Reset for ${data.username}</h1>
            
            <p>We received a request to reset the password for your ConquestK account. Click the button below to create a new password.</p>
            
            <div style="text-align: center;">
              <a href="${data.resetLink}" class="button">Reset Password</a>
            </div>
            
            <div class="warning-box">
              <p style="margin: 0;"><strong>⚠️ Security Note:</strong> This link expires in ${data.expiresIn}. For security reasons, you can only use it once.</p>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p class="link">${data.resetLink}</p>
            
            <p><strong>Didn't request this?</strong><br>
            If you didn't request a password reset, please ignore this email. Your password won't be changed.</p>
          </div>
          
          <div class="footer">
            <p>© 2024 ConquestK. All rights reserved.</p>
            <p>This is an automated security email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const text = `
Password Reset for ${data.username}

We received a request to reset the password for your ConquestK account.

Reset your password by clicking this link:
${data.resetLink}

This link expires in ${data.expiresIn} and can only be used once.

If you didn't request a password reset, please ignore this email. Your password won't be changed.

© 2024 ConquestK. All rights reserved.
    `.trim()

    return await this.sendEmail({
      to: data.email,
      subject,
      html,
      text,
    })
  }

  public isEnabled(): boolean {
    return this.emailEnabled
  }
}

export default new EmailService()
