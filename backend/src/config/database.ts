import { QueryResult as PgQueryResult, Pool } from 'pg'
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
  pgPool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
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
export async function query<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  if (!pgPool) {
    throw new Error('Database connection not available')
  }

  try {
    const result = await pgPool.query<T>(text, params)
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
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
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
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `)

    if (result.rows[0].exists) {
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
  updates: Record<string, any>,
  conditions: Record<string, any>,
): { text: string; values: any[] } {
  const updateParts: string[] = []
  const conditionParts: string[] = []
  const values: any[] = []
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
  data: Record<string, any>,
  returning = '*',
): { text: string; values: any[] } {
  const columns: string[] = []
  const placeholders: string[] = []
  const values: any[] = []
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

export default { query, transaction, initDatabase, closeDatabase, getClient }
