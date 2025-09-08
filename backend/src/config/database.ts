import { QueryResult as PgQueryResult, Pool, type PoolClient, QueryResultRow } from 'pg'
import { logger } from '../utils/logger'

// Normalized query result interface
export interface QueryResult<T = any> {
  rows: T[]
  rowCount: number | null
}

let pgPool: Pool | null = null

// Initialize PostgreSQL connection pool
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  logger.error('❌ DATABASE_URL is required for PostgreSQL connection')
  throw new Error('DATABASE_URL environment variable is not set')
}

try {
  logger.info('🔧 Initializing PostgreSQL connection pool')

  // Enhanced connection pool configuration for production loads
  const isRailway = databaseUrl.includes('railway')
  const connectionTimeout = isRailway
    ? 15000
    : parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000')
  const isProduction = process.env.NODE_ENV === 'production'

  pgPool = new Pool({
    connectionString: databaseUrl,
    // Enhanced pool sizing based on environment
    max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '25' : '15')), // More connections in production
    min: parseInt(process.env.DB_POOL_MIN || (isProduction ? '5' : '2')), // Keep minimum connections alive
    idleTimeoutMillis: parseInt(
      process.env.DB_POOL_IDLE_TIMEOUT || (isProduction ? '60000' : '30000'),
    ), // Longer idle in production
    connectionTimeoutMillis: connectionTimeout,
    // Note: acquireTimeoutMillis is not a valid pg Pool option, removing it
    // Query timeouts
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
    // Connection optimization
    application_name: 'conquestk-backend',
    // Railway and production SSL
    ssl: isRailway || isProduction ? { rejectUnauthorized: false } : undefined,
    // Connection keep-alive for Railway reliability
    keepAlive: isRailway,
    keepAliveInitialDelayMillis: isRailway ? 10000 : 0,
  })

  logger.info(
    `📊 Database config: Railway=${isRailway}, Timeout=${connectionTimeout}ms, SSL=${isRailway || isProduction}, Pool: ${pgPool.options.min}-${pgPool.options.max}`,
  )

  // Enhanced connection monitoring
  pgPool.on('connect', (client) => {
    if (pgPool) {
      logger.debug(
        `🔌 New client connected. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle, ${pgPool.waitingCount} waiting`,
      )
    }
  })

  pgPool.on('error', (err, client) => {
    logger.error('❌ Unexpected error on idle client:', err)
  })

  pgPool.on('remove', (client) => {
    if (pgPool) {
      logger.debug(`🔌 Client removed. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle`)
    }
  })

  // Test the connection (non-blocking)
  pgPool.query('SELECT 1', (err) => {
    if (err) {
      logger.error('❌ PostgreSQL connection test failed:', err)
      throw err
    }
    logger.info('✅ PostgreSQL connection established')
  })
} catch (error) {
  logger.error('❌ Failed to create PostgreSQL pool:', error)
  throw error
}

// Generic query function
export async function query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }

  try {
    const result = await pgPool.query(text, params)
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount,
    }
  } catch (error) {
    logger.error('Query error:', error)
    throw error
  }
}

// Transaction support
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }

  const client = await pgPool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Initialize database tables
export async function initDatabase(): Promise<void> {
  logger.info('📊 Checking database tables...')

  try {
    // Check if users table exists
    const result = await query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `)

    if (result.rows[0]?.exists) {
      logger.info('✅ Database tables verified')
    } else {
      logger.warn('⚠️  Database tables not found. Run migrations to create them.')
    }
  } catch (error) {
    logger.error('❌ Database initialization failed:', error)
    throw error
  }
}

// Cleanup function for graceful shutdown
export async function closeDatabase(): Promise<void> {
  if (pgPool) {
    await pgPool.end()
    logger.info('🔌 Database connection closed')
  }
}

// Helper function for parameterized queries
export function buildUpdateQuery(
  table: string,
  updates: Record<string, unknown>,
  conditions: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const updateParts: string[] = []
  const conditionParts: string[] = []
  const values: unknown[] = []
  let paramCounter = 1

  // Build SET clause
  for (const [key, value] of Object.entries(updates)) {
    updateParts.push(`${key} = $${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  // Build WHERE clause
  for (const [key, value] of Object.entries(conditions)) {
    conditionParts.push(`${key} = $${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  const text = `
    UPDATE ${table} 
    SET ${updateParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE ${conditionParts.join(' AND ')}
  `

  return { text, values }
}

// Helper for INSERT queries with RETURNING
export function buildInsertQuery(
  table: string,
  data: Record<string, unknown>,
  returning = '*',
): { text: string; values: unknown[] } {
  const columns: string[] = []
  const placeholders: string[] = []
  const values: unknown[] = []
  let paramCounter = 1

  for (const [key, value] of Object.entries(data)) {
    columns.push(key)
    placeholders.push(`$${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  const text = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING ${returning}
  `

  return { text, values }
}

// Export getClient function for transaction support
export async function getClient() {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }
  return await pgPool.connect()
}

// Export getPool function for services that need direct pool access
export function getPool(): Pool {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }
  return pgPool
}

// Get detailed pool metrics for monitoring
export function getPoolMetrics() {
  if (!pgPool) {
    return { error: 'Pool not initialized' }
  }

  return {
    totalCount: pgPool.totalCount,
    idleCount: pgPool.idleCount,
    waitingCount: pgPool.waitingCount,
    config: {
      max: pgPool.options.max,
      min: pgPool.options.min,
      idleTimeoutMillis: pgPool.options.idleTimeoutMillis,
      connectionTimeoutMillis: pgPool.options.connectionTimeoutMillis,
    },
    utilization:
      pgPool.totalCount > 0
        ? (((pgPool.totalCount - pgPool.idleCount) / pgPool.totalCount) * 100).toFixed(1) + '%'
        : '0%',
  }
}

export default { query, transaction, initDatabase, closeDatabase, getClient }
