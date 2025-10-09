import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { logger } from '../utils/logger.js'

// Normalized query result interface
export interface DatabaseQueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[]
  rowCount: number | null
}

type QueryValues = ReadonlyArray<unknown>

function convertQuestionMarksToPgPlaceholders(sql: string, params: QueryValues): string {
  let placeholderIndex = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let converted = ''

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]

    if (char === "'" && !inDoubleQuote) {
      converted += char
      // Handle escaped single quote represented as ''
      if (inSingleQuote && sql[i + 1] === "'") {
        converted += "'"
        i++
        continue
      }
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      converted += char
      // Handle escaped double quote represented as ""
      if (inDoubleQuote && sql[i + 1] === '"') {
        converted += '"'
        i++
        continue
      }
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && char === '?') {
      placeholderIndex++
      converted += `$${placeholderIndex}`
      continue
    }

    converted += char
  }

  if (placeholderIndex !== params.length) {
    logger.warn('Converted parameter count does not match supplied values', {
      sql,
      expected: placeholderIndex,
      provided: params.length,
    })
  }

  return converted
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
    : parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000', 10)
  const isProduction = process.env.NODE_ENV === 'production'

  pgPool = new Pool({
    connectionString: databaseUrl,
    // Enhanced pool sizing based on environment
    max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '25' : '15'), 10), // More connections in production
    min: parseInt(process.env.DB_POOL_MIN || (isProduction ? '5' : '2'), 10), // Keep minimum connections alive
    idleTimeoutMillis: parseInt(
      process.env.DB_POOL_IDLE_TIMEOUT || (isProduction ? '60000' : '30000'),
      10,
    ), // Longer idle in production
    connectionTimeoutMillis: connectionTimeout,
    // Note: acquireTimeoutMillis is not a valid pg Pool option, removing it
    // Query timeouts
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
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
  pgPool.on('connect', (_client) => {
    if (pgPool) {
      logger.debug(
        `🔌 New client connected. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle, ${pgPool.waitingCount} waiting`,
      )
    }
  })

  pgPool.on('error', (err, _client) => {
    logger.error('❌ Unexpected error on idle client:', err)
  })

  pgPool.on('remove', (_client) => {
    if (pgPool) {
      logger.debug(`🔌 Client removed. Pool: ${pgPool.totalCount} total, ${pgPool.idleCount} idle`)
    }
  })

  const shouldTestConnection =
    process.env.NODE_ENV !== 'test' && process.env.SKIP_DB_CONNECTION_TEST !== 'true'

  if (shouldTestConnection) {
    pgPool.query('SELECT 1', (err) => {
      if (err) {
        logger.error('❌ PostgreSQL connection test failed:', err)
        throw err
      }
      logger.info('✅ PostgreSQL connection established')
    })
  } else {
    logger.debug('ℹ️ Skipping PostgreSQL connection test in test environment')
  }
} catch (error) {
  logger.error('❌ Failed to create PostgreSQL pool:', error)
  throw error
}

// Generic query function
export interface QueryOptions {
  client?: PoolClient
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: QueryValues,
  options?: QueryOptions,
): Promise<DatabaseQueryResult<T>> {
  const executor = options?.client ?? pgPool
  if (!executor) {
    throw new Error('Database connection not available')
  }

  try {
    let preparedText = text
    const values: QueryValues | undefined = params ? [...params] : undefined

    if (values && values.length > 0 && text.includes('?')) {
      preparedText = convertQuestionMarksToPgPlaceholders(text, values)
    }
    const queryValues = values ? [...values] : undefined

    const result = await executor.query<T>(preparedText, queryValues)
    return {
      rows: result.rows,
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

interface WithClientOptions {
  client?: PoolClient
}

/**
 * Utility helper to borrow a database client, ensuring it is always released.
 *
 * When a client is supplied (typically from an existing transaction), it will
 * be passed straight through to the callback without touching the pool. When no
 * client is provided, the helper acquires one from the pool and guarantees it
 * is released even if the callback throws.
 */
export async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>,
  options: WithClientOptions = {},
): Promise<T> {
  if (options.client) {
    return await callback(options.client)
  }

  if (!pgPool) {
    throw new Error('Database connection not available')
  }

  const client = await pgPool.connect()

  try {
    return await callback(client)
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

/**
 * Helper function for parameterized UPDATE queries
 *
 * ⚠️ SECURITY WARNING: This function does NOT validate table or column names.
 * Column and table names MUST be validated against a strict whitelist before calling this function
 * to prevent SQL injection attacks. Do NOT pass user-controllable values directly as keys.
 *
 * @example
 * // SAFE: Using predefined column names
 * const ALLOWED_COLUMNS = ['username', 'email', 'updated_at'];
 * const safeUpdates = Object.fromEntries(
 *   Object.entries(updates).filter(([key]) => ALLOWED_COLUMNS.includes(key))
 * );
 * const query = buildUpdateQuery('users', safeUpdates, { id: userId });
 */
export function buildUpdateQuery(
  table: string,
  updates: Record<string, unknown>,
  conditions: Record<string, unknown>,
): { text: string; values: unknown[] } {
  // Validate that we have updates and conditions
  if (Object.keys(updates).length === 0) {
    throw new Error('buildUpdateQuery: updates object cannot be empty')
  }
  if (Object.keys(conditions).length === 0) {
    throw new Error('buildUpdateQuery: conditions object cannot be empty')
  }

  const updateParts: string[] = []
  const conditionParts: string[] = []
  const values: unknown[] = []
  let paramCounter = 1

  // Build SET clause
  // WARNING: Keys are interpolated directly - caller MUST validate column names
  for (const [key, value] of Object.entries(updates)) {
    // Basic sanity check - column names should be simple identifiers
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
      throw new Error(`buildUpdateQuery: Invalid column name format: ${key}`)
    }
    updateParts.push(`${key} = $${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  // Build WHERE clause
  // WARNING: Keys are interpolated directly - caller MUST validate column names
  for (const [key, value] of Object.entries(conditions)) {
    // Basic sanity check - column names should be simple identifiers
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
      throw new Error(`buildUpdateQuery: Invalid column name format: ${key}`)
    }
    conditionParts.push(`${key} = $${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  // Basic sanity check for table name
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`buildUpdateQuery: Invalid table name format: ${table}`)
  }

  const text = `
    UPDATE ${table}
    SET ${updateParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE ${conditionParts.join(' AND ')}
  `

  return { text, values }
}

/**
 * Helper for INSERT queries with RETURNING clause
 *
 * ⚠️ SECURITY WARNING: This function does NOT validate table or column names.
 * Column and table names MUST be validated against a strict whitelist before calling this function
 * to prevent SQL injection attacks. Do NOT pass user-controllable values directly as keys.
 *
 * @example
 * // SAFE: Using predefined column names
 * const ALLOWED_COLUMNS = ['username', 'email', 'created_at'];
 * const safeData = Object.fromEntries(
 *   Object.entries(data).filter(([key]) => ALLOWED_COLUMNS.includes(key))
 * );
 * const query = buildInsertQuery('users', safeData);
 */
export function buildInsertQuery(
  table: string,
  data: Record<string, unknown>,
  returning = '*',
): { text: string; values: unknown[] } {
  // Validate that we have data to insert
  if (Object.keys(data).length === 0) {
    throw new Error('buildInsertQuery: data object cannot be empty')
  }

  const columns: string[] = []
  const placeholders: string[] = []
  const values: unknown[] = []
  let paramCounter = 1

  // WARNING: Keys are interpolated directly - caller MUST validate column names
  for (const [key, value] of Object.entries(data)) {
    // Basic sanity check - column names should be simple identifiers
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) {
      throw new Error(`buildInsertQuery: Invalid column name format: ${key}`)
    }
    columns.push(key)
    placeholders.push(`$${paramCounter}`)
    values.push(value)
    paramCounter++
  }

  // Basic sanity check for table name
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`buildInsertQuery: Invalid table name format: ${table}`)
  }

  // Basic sanity check for RETURNING clause
  if (returning !== '*' && !/^[a-z_][a-z0-9_,\s]*$/i.test(returning)) {
    throw new Error(`buildInsertQuery: Invalid RETURNING clause format: ${returning}`)
  }

  const text = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING ${returning}
  `

  return { text, values }
}

// Export getClient function for transaction support
export async function getClient(): Promise<PoolClient> {
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
interface PoolMetrics {
  totalCount: number
  idleCount: number
  waitingCount: number
  config: {
    max: number | undefined
    min: number | undefined
    idleTimeoutMillis: number | undefined
    connectionTimeoutMillis: number | undefined | null
  }
  utilization: string
}

export function getPoolMetrics(): PoolMetrics | { error: string } {
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
      connectionTimeoutMillis: pgPool.options.connectionTimeoutMillis ?? null,
    },
    utilization:
      pgPool.totalCount > 0
        ? `${(((pgPool.totalCount - pgPool.idleCount) / pgPool.totalCount) * 100).toFixed(1)}%`
        : '0%',
  } as PoolMetrics
}

export default { query, transaction, initDatabase, closeDatabase, getClient }
