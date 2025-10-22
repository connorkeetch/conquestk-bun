import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { logger } from '../utils/logger.js'

/**
 * Represents a normalized database query result.
 * @template T The type of the rows returned by the query.
 */
export interface DatabaseQueryResult<T extends QueryResultRow = QueryResultRow> {
  /** An array of rows returned by the query. */
  rows: T[]
  /** The number of rows affected by the query, or null if not applicable. */
  rowCount: number | null
}

type QueryValues = ReadonlyArray<unknown>

function findPreviousNonWhitespace(sql: string, startIndex: number): string | null {
  for (let i = startIndex; i >= 0; i--) {
    const char = sql[i]
    if (!/\s/.test(char)) {
      return char
    }
  }
  return null
}

function findNextNonWhitespace(sql: string, startIndex: number): string | null {
  for (let i = startIndex; i < sql.length; i++) {
    const char = sql[i]
    if (!/\s/.test(char)) {
      return char
    }
  }
  return null
}

function isLikelyJsonOperator(sql: string, index: number): boolean {
  const nextTwo = sql.slice(index, index + 2)
  if (nextTwo === '?|' || nextTwo === '?&') {
    return true
  }

  const previous = findPreviousNonWhitespace(sql, index - 1)
  if (!previous) {
    return false
  }

  const prevIsIdentifierLike = /[A-Za-z0-9_")\]]/.test(previous)
  if (!prevIsIdentifierLike) {
    return false
  }

  const next = findNextNonWhitespace(sql, index + 1)
  if (!next) {
    return false
  }

  return ["'", '"', '?', '[', '{', '(', '|', '&'].includes(next)
}

export function convertQuestionMarksToPgPlaceholders(sql: string, params: QueryValues): string {
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
      if (isLikelyJsonOperator(sql, i)) {
        converted += char
        continue
      }

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

/**
 * Options for a database query.
 */
export interface QueryOptions {
  /** An optional existing database client to use for the query. */
  client?: PoolClient
}

/**
 * Executes a SQL query against the database.
 * @template T The expected type of the query result rows.
 * @param {string} text The SQL query string.
 * @param {QueryValues} [params] Optional array of query parameters.
 * @param {QueryOptions} [options] Optional query options.
 * @returns {Promise<DatabaseQueryResult<T>>} A promise that resolves to the query result.
 */
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

/**
 * Executes a callback function within a database transaction.
 * @template T The return type of the callback function.
 * @param {(client: PoolClient) => Promise<T>} callback The function to execute within the transaction.
 * @returns {Promise<T>} A promise that resolves with the result of the callback.
 */
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

/**
 * Options for the withClient utility.
 */
interface WithClientOptions {
  /** An optional existing database client to use. */
  client?: PoolClient
}

/**
 * Utility helper to borrow a database client, ensuring it is always released.
 *
 * When a client is supplied (typically from an existing transaction), it will
 * be passed straight through to the callback without touching the pool. When no
 * client is provided, the helper acquires one from the pool and guarantees it
 * is released even if the callback throws.
 * @template T The return type of the callback function.
 * @param {(client: PoolClient) => Promise<T>} callback The function to execute with the client.
 * @param {WithClientOptions} [options={}] Optional options, including an existing client.
 * @returns {Promise<T>} A promise that resolves with the result of the callback.
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

/**
 * Initializes the database by checking for the existence of required tables.
 * @returns {Promise<void>} A promise that resolves when the check is complete.
 */
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

/**
 * Closes the database connection pool.
 * @returns {Promise<void>} A promise that resolves when the connection is closed.
 */
export async function closeDatabase(): Promise<void> {
  if (pgPool) {
    await pgPool.end()
    logger.info('🔌 Database connection closed')
  }
}

/**
 * Helper function for parameterized UPDATE queries.
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
 *
 * @param {string} table The name of the table to update.
 * @param {Record<string, unknown>} updates An object of columns and values to update.
 * @param {Record<string, unknown>} conditions An object of columns and values for the WHERE clause.
 * @returns {{ text: string; values: unknown[] }} The generated SQL query and its parameters.
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
 * Helper for INSERT queries with RETURNING clause.
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
 *
 * @param {string} table The name of the table to insert into.
 * @param {Record<string, unknown>} data An object of columns and values to insert.
 * @param {string} [returning='*'] The columns to return after insertion.
 * @returns {{ text: string; values: unknown[] }} The generated SQL query and its parameters.
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

/**
 * Acquires a client from the connection pool.
 * @returns {Promise<PoolClient>} A promise that resolves with a database client.
 */
export async function getClient(): Promise<PoolClient> {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }
  return await pgPool.connect()
}

/**
 * Gets the singleton instance of the connection pool.
 * @returns {Pool} The connection pool instance.
 */
export function getPool(): Pool {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }
  return pgPool
}

/**
 * Represents database pool metrics for monitoring.
 */
interface PoolMetrics {
  /** The total number of clients in the pool. */
  totalCount: number
  /** The number of idle clients in the pool. */
  idleCount: number
  /** The number of queued requests waiting for a client. */
  waitingCount: number
  config: {
    max: number | undefined
    min: number | undefined
    idleTimeoutMillis: number | undefined
    connectionTimeoutMillis: number | undefined | null
  }
  /** The percentage of the pool that is currently in use. */
  utilization: string
}

/**
 * Retrieves detailed metrics about the connection pool for monitoring.
 * @returns {PoolMetrics | { error: string }} An object with pool metrics or an error object if the pool is not initialized.
 */
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
