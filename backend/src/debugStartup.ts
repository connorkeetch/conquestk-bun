import { logger } from './utils/logger'

// Comprehensive startup debugging
export function logStartupDiagnostics() {
  logger.info('========================================')
  logger.info('🔍 RAILWAY STARTUP DIAGNOSTICS')
  logger.info('========================================')

  // System info
  logger.info('📍 System Information:')
  logger.info(`  Node version: ${process.version}`)
  logger.info(`  Platform: ${process.platform}`)
  logger.info(`  Architecture: ${process.arch}`)
  logger.info(`  Current directory: ${process.cwd()}`)
  logger.info(`  Script directory: ${__dirname}`)
  logger.info(
    `  Memory: ${JSON.stringify({
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    })}`,
  )

  // Environment variables
  logger.info('📋 Environment Variables:')
  logger.info(`  NODE_ENV: "${process.env.NODE_ENV || 'undefined'}"`)
  logger.info(`  PORT: "${process.env.PORT || 'undefined'}"`)
  logger.info(
    `  DATABASE_URL: ${process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.length} chars)` : 'NOT SET'}`,
  )

  // Parse DATABASE_URL if it exists
  if (process.env.DATABASE_URL) {
    try {
      const dbUrl = new URL(process.env.DATABASE_URL)
      logger.info(`  Database parsed:`)
      logger.info(`    Protocol: ${dbUrl.protocol}`)
      logger.info(`    Host: ${dbUrl.hostname}`)
      logger.info(`    Port: ${dbUrl.port || 'default'}`)
      logger.info(`    Database: ${dbUrl.pathname.slice(1)}`)
      logger.info(`    Username: ${dbUrl.username ? 'SET' : 'NOT SET'}`)
    } catch (urlError) {
      logger.error(`  DATABASE_URL parse error: ${urlError}`)
      logger.error(`  Raw URL (first 50 chars): ${process.env.DATABASE_URL.substring(0, 50)}`)
    }
  }

  logger.info(`  CLIENT_URL: "${process.env.CLIENT_URL || 'undefined'}"`)
  logger.info(`  FRONTEND_URL: "${process.env.FRONTEND_URL || 'undefined'}"`)
  logger.info(`  CORS_ORIGIN: "${process.env.CORS_ORIGIN || 'undefined'}"`)
  logger.info(`  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET'}`)

  // Check for Railway-specific variables
  logger.info('🚂 Railway Variables:')
  logger.info(`  RAILWAY_ENVIRONMENT: "${process.env.RAILWAY_ENVIRONMENT || 'undefined'}"`)
  logger.info(`  RAILWAY_PROJECT_ID: "${process.env.RAILWAY_PROJECT_ID || 'undefined'}"`)
  logger.info(`  RAILWAY_SERVICE_ID: "${process.env.RAILWAY_SERVICE_ID || 'undefined'}"`)

  logger.info('========================================')
}

export async function testDatabaseConnection() {
  logger.info('🔌 Testing database connection...')

  if (!process.env.DATABASE_URL) {
    logger.error('❌ DATABASE_URL is not set!')
    return false
  }

  try {
    // Try to import and use the query function
    const { query } = await import('./config/database')

    // Test basic connection
    logger.info('  Testing SELECT 1...')
    const result = await query('SELECT 1 as test')
    logger.info(`  ✅ Basic query successful: ${JSON.stringify(result.rows[0])}`)

    // Test PostgreSQL specific
    logger.info('  Testing PostgreSQL version...')
    const versionResult = await query('SELECT version()')
    logger.info(`  ✅ PostgreSQL version: ${versionResult.rows[0].version}`)

    // Test if we can create a table
    logger.info('  Testing table creation...')
    await query(`
      CREATE TABLE IF NOT EXISTS startup_test (
        id SERIAL PRIMARY KEY,
        test_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    logger.info('  ✅ Can create tables')

    // Clean up
    await query('DROP TABLE IF EXISTS startup_test')

    return true
  } catch (error) {
    logger.error(`❌ Database connection test failed: ${error}`)
    if (error instanceof Error) {
      logger.error(`  Error name: ${error.name}`)
      logger.error(`  Error message: ${error.message}`)
      logger.error(`  Error stack: ${error.stack}`)
    }
    return false
  }
}

export async function testMigrationFiles() {
  logger.info('📁 Checking migration files...')

  try {
    const fs = require('node:fs')
    const path = require('node:path')

    const migrationsPath = path.join(__dirname, '../migrations')
    logger.info(`  Looking for migrations in: ${migrationsPath}`)

    if (!fs.existsSync(migrationsPath)) {
      logger.error(`  ❌ Migrations directory does not exist!`)
      return false
    }

    const files = fs.readdirSync(migrationsPath)
    const sqlFiles = files.filter((f: string) => f.endsWith('.sql'))

    logger.info(`  ✅ Found ${sqlFiles.length} migration files:`)
    sqlFiles.forEach((file: string) => {
      const filePath = path.join(migrationsPath, file)
      const stats = fs.statSync(filePath)
      logger.info(`    - ${file} (${stats.size} bytes)`)
    })

    return true
  } catch (error) {
    logger.error(`❌ Migration files check failed: ${error}`)
    return false
  }
}
