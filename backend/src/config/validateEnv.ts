import { logger } from '../utils/logger'

interface EnvVariable {
  name: string
  required: boolean
  defaultValue?: string
  validator?: (value: string) => boolean
  description?: string
}

const ENV_VARIABLES: EnvVariable[] = [
  // Database
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string',
    validator: (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
  },

  // Server
  {
    name: 'PORT',
    required: false,
    defaultValue: '5001',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0 && parseInt(value) < 65536,
    description: 'Server port number',
  },

  // Authentication
  {
    name: 'JWT_SECRET',
    required: true,
    description: 'Secret key for JWT token signing',
    validator: (value) => value.length >= 32,
  },
  {
    name: 'JWT_EXPIRES_IN',
    required: false,
    defaultValue: '7d',
    description: 'JWT token expiration time',
  },

  // Session
  {
    name: 'SESSION_SECRET',
    required: false, // Optional - will be generated if missing
    description: 'Secret key for session encryption',
    validator: (value) => {
      // Skip validation if it's a Railway reference (will be generated)
      if (value.startsWith('$')) return true
      return value.length >= 32
    },
  },

  // Environment
  {
    name: 'NODE_ENV',
    required: false,
    defaultValue: 'development',
    validator: (value) => ['development', 'production', 'staging', 'test'].includes(value),
    description: 'Application environment',
  },

  // Database Pool (optional but recommended)
  {
    name: 'DB_POOL_MAX',
    required: false,
    defaultValue: '20',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Maximum database connections',
  },
  {
    name: 'DB_POOL_IDLE_TIMEOUT',
    required: false,
    defaultValue: '30000',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Database idle connection timeout (ms)',
  },
  {
    name: 'DB_POOL_CONNECTION_TIMEOUT',
    required: false,
    defaultValue: '2000',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Database connection timeout (ms)',
  },
  {
    name: 'DB_STATEMENT_TIMEOUT',
    required: false,
    defaultValue: '30000',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Database statement timeout (ms)',
  },
  {
    name: 'DB_QUERY_TIMEOUT',
    required: false,
    defaultValue: '30000',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Database query timeout (ms)',
  },

  // File Upload
  {
    name: 'MAX_FILE_SIZE',
    required: false,
    defaultValue: '5242880', // 5MB
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    description: 'Maximum file upload size (bytes)',
  },

  // CORS
  {
    name: 'CORS_ORIGIN',
    required: false,
    defaultValue: 'http://localhost:5173',
    description: 'CORS allowed origins',
  },

  // Optional Features
  {
    name: 'REDIS_URL',
    required: false,
    description: 'Redis connection URL for sessions/caching',
  },
  {
    name: 'SMTP_HOST',
    required: false,
    description: 'SMTP server for sending emails',
  },
  {
    name: 'SMTP_PORT',
    required: false,
    defaultValue: '587',
    validator: (value) => !isNaN(parseInt(value)),
    description: 'SMTP server port',
  },
  {
    name: 'SMTP_USER',
    required: false,
    description: 'SMTP authentication username',
  },
  {
    name: 'SMTP_PASS',
    required: false,
    description: 'SMTP authentication password',
  },
  {
    name: 'ADMIN_EMAIL',
    required: false,
    description: 'Admin email for notifications',
    validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },
]

export function validateEnvironmentVariables(): void {
  logger.info('🔍 Validating environment variables...')

  const errors: string[] = []
  const warnings: string[] = []
  const applied: string[] = []

  // Handle production/staging-specific secret generation FIRST before validation
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    const crypto = require('crypto')

    // Generate JWT_SECRET if missing or invalid (Railway reference)
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('$')) {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
      warnings.push('⚠️  JWT_SECRET not provided or is Railway reference - generated random key')
      applied.push(`✅ Generated JWT_SECRET for production`)
    }

    // Generate SESSION_SECRET if missing or invalid (Railway reference)
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.startsWith('$')) {
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex')
      warnings.push('⚠️  SESSION_SECRET not provided or is Railway reference - generated random key')
      applied.push(`✅ Generated SESSION_SECRET for production`)
    }

    // Ensure they're different
    if (process.env.JWT_SECRET === process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex')
      warnings.push('⚠️  Regenerated SESSION_SECRET to be different from JWT_SECRET')
    }
  }

  for (const envVar of ENV_VARIABLES) {
    const value = process.env[envVar.name]

    // Check if required variable is missing
    if (envVar.required && !value) {
      errors.push(
        `❌ Missing required environment variable: ${envVar.name}${envVar.description ? ` (${envVar.description})` : ''}`,
      )
      continue
    }

    // Apply default value if not set and has default
    if (!value && envVar.defaultValue) {
      process.env[envVar.name] = envVar.defaultValue
      applied.push(`✅ Applied default value for ${envVar.name}: ${envVar.defaultValue}`)
      continue
    }

    // Skip validation if not set and not required
    if (!value) {
      continue
    }

    // Validate the value if validator exists
    if (envVar.validator && !envVar.validator(value)) {
      errors.push(
        `❌ Invalid value for ${envVar.name}: "${value}"${envVar.description ? ` (${envVar.description})` : ''}`,
      )
      continue
    }

    // Check for common issues
    if (envVar.name.includes('SECRET') || envVar.name.includes('KEY')) {
      if (value === 'your-secret-here' || value === 'change-me' || value.length < 16) {
        warnings.push(`⚠️  Weak value for ${envVar.name} - please use a strong secret`)
      }
    }
  }

  // Check for other production/staging-specific warnings
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    if (!process.env.REDIS_URL) {
      warnings.push(
        '⚠️  REDIS_URL not set - sessions will use memory storage (not recommended for production)',
      )
    }

    if (!process.env.SMTP_HOST && !process.env.RESEND_API_KEY) {
      warnings.push('⚠️  Email service not configured (SMTP_HOST or RESEND_API_KEY missing)')
    }
  }

  // Log results
  if (applied.length > 0) {
    logger.info('Applied defaults:')
    applied.forEach((msg) => logger.info(msg))
  }

  if (warnings.length > 0) {
    logger.warn('Environment warnings:')
    warnings.forEach((msg) => logger.warn(msg))
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:')
    errors.forEach((msg) => logger.error(msg))

    // In production/staging, fail fast on missing required variables
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      logger.error(
        '🛑 Cannot start server with missing/invalid environment variables in production',
      )
      process.exit(1)
    } else {
      logger.warn('⚠️  Starting with missing/invalid environment variables (development mode)')
    }
  } else {
    logger.info('✅ Environment variables validated successfully')
  }

  // Log current environment summary
  logger.info(`📊 Environment Summary:
  - Mode: ${process.env.NODE_ENV || 'development'}
  - Port: ${process.env.PORT || '5001'}
  - Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}
  - Redis: ${process.env.REDIS_URL ? 'Configured' : 'Not configured'}
  - Email: ${process.env.SMTP_HOST ? 'Configured' : 'Not configured'}`)
}

// Export for testing
export { ENV_VARIABLES }
