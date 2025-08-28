import mysql from 'mysql2/promise'
import { Client, Pool } from 'pg'
import BetterSqlite3 from 'better-sqlite3'
import { logger } from '../utils/logger'

type DatabaseType = 'postgresql' | 'mysql' | 'sqlite'

// Auto-detect database type from DATABASE_URL
function detectDatabaseType(): DatabaseType {
  // If DB_TYPE is explicitly set, use it (but convert 'postgres' to 'postgresql')
  if (process.env.DB_TYPE) {
    const dbType = process.env.DB_TYPE.toLowerCase()
    if (dbType === 'postgres' || dbType === 'postgresql') return 'postgresql'
    if (dbType === 'mysql') return 'mysql'
    if (dbType === 'sqlite') return 'sqlite'
  }

  // Auto-detect from DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) {
    if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
      return 'postgresql'
    }
    if (databaseUrl.startsWith('mysql://')) {
      return 'mysql'
    }
    if (databaseUrl.startsWith('sqlite://')) {
      return 'sqlite'
    }
  }

  // Check for MySQL-specific env vars
  if (process.env.MYSQL_URL || process.env.MYSQLHOST) {
    return 'mysql'
  }

  // Default to SQLite for development, PostgreSQL for production
  return process.env.NODE_ENV === 'production' ? 'postgresql' : 'sqlite'
}

const DB_TYPE = detectDatabaseType()

// Log database configuration for debugging
logger.info('🔧 Database Configuration:', {
  DB_TYPE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
  DATABASE_URL_PREFIX: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'N/A',
})

let pgPool: Pool | null = null
let mysqlPool: mysql.Pool | null = null
let sqliteDb: BetterSqlite3.Database | null = null

// Initialize PostgreSQL
if (DB_TYPE === 'postgresql') {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    logger.error('❌ DATABASE_URL is required for PostgreSQL connection')
  } else {
    logger.info('🔧 Initializing PostgreSQL connection pool')
    pgPool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
    
    // Test the connection
    pgPool.query('SELECT 1', (err) => {
      if (err) {
        logger.error('❌ PostgreSQL connection test failed:', err)
      } else {
        logger.info('✅ PostgreSQL connection established')
      }
    })
  }
}

// Initialize MySQL
else if (DB_TYPE === 'mysql') {
  // Try MYSQL_URL first (Railway's preferred format)
  if (process.env.MYSQL_URL) {
    logger.info('🔧 Using MYSQL_URL for MySQL connection')
    const url = new URL(process.env.MYSQL_URL)
    mysqlPool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port || '3306', 10),
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  // Railway MySQL format (separate variables)
  else if (process.env.MYSQLHOST && process.env.MYSQLDATABASE) {
    logger.info('🔧 Using Railway MySQL configuration (individual variables)')
    mysqlPool = mysql.createPool({
      host: process.env.MYSQLHOST,
      port: parseInt(process.env.MYSQLPORT || '3306', 10),
      database: process.env.MYSQLDATABASE,
      user: process.env.MYSQLUSER || 'root',
      password: process.env.MYSQLPASSWORD || '',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  // Try DATABASE_URL as MySQL
  else if (process.env.DATABASE_URL) {
    logger.info('🔧 Using DATABASE_URL for MySQL connection')
    const url = new URL(process.env.DATABASE_URL)
    mysqlPool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port || '3306', 10),
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  // Custom MySQL configuration
  else if (process.env.DB_HOST && process.env.DB_NAME) {
    logger.info('🔧 Using custom MySQL configuration (DB_HOST/DB_NAME)')
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
}

// Initialize SQLite
else if (DB_TYPE === 'sqlite') {
  const dbPath = process.env.DATABASE_PATH || './game.db'
  logger.info(`🔧 Using SQLite database at: ${dbPath}`)
  sqliteDb = new BetterSqlite3(dbPath)
  sqliteDb.pragma('journal_mode = WAL')
  sqliteDb.pragma('foreign_keys = ON')
}

// Generic query function that works with all database types
export async function query(sql: string, params?: any[]): Promise<any> {
  try {
    // PostgreSQL
    if (DB_TYPE === 'postgresql' && pgPool) {
      const result = await pgPool.query(sql, params)
      return {
        rows: result.rows,
        rowCount: result.rowCount,
      }
    }
    
    // MySQL
    if (DB_TYPE === 'mysql' && mysqlPool) {
      const [rows] = await mysqlPool.execute(sql, params || [])
      return {
        rows: Array.isArray(rows) ? rows : [rows],
        rowCount: (rows as any).affectedRows || (rows as any[]).length || 0,
      }
    }
    
    // SQLite
    if (DB_TYPE === 'sqlite' && sqliteDb) {
      // Handle different query types
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rows = sqliteDb.prepare(sql).all(...(params || []))
        return {
          rows,
          rowCount: rows.length,
        }
      } else if (
        sql.trim().toUpperCase().startsWith('INSERT') ||
        sql.trim().toUpperCase().startsWith('UPDATE') ||
        sql.trim().toUpperCase().startsWith('DELETE')
      ) {
        const stmt = sqliteDb.prepare(sql)
        const result = stmt.run(...(params || []))
        return {
          rows: [],
          rowCount: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        }
      } else {
        // For CREATE TABLE, DROP TABLE, etc.
        sqliteDb.exec(sql)
        return {
          rows: [],
          rowCount: 0,
        }
      }
    }
    
    throw new Error(`No database connection available for ${DB_TYPE}`)
  } catch (error) {
    logger.error(`Database query failed (${DB_TYPE}):`, error)
    logger.error('SQL:', sql)
    logger.error('Params:', params)
    throw error
  }
}

// Transaction support
export async function beginTransaction(): Promise<void> {
  if (DB_TYPE === 'postgresql' && pgPool) {
    await pgPool.query('BEGIN')
  } else if (DB_TYPE === 'mysql' && mysqlPool) {
    const connection = await mysqlPool.getConnection()
    await connection.beginTransaction()
    // Store connection for commit/rollback
    ;(global as any).__dbTransaction = connection
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    sqliteDb.exec('BEGIN')
  }
}

export async function commitTransaction(): Promise<void> {
  if (DB_TYPE === 'postgresql' && pgPool) {
    await pgPool.query('COMMIT')
  } else if (DB_TYPE === 'mysql' && (global as any).__dbTransaction) {
    const connection = (global as any).__dbTransaction
    await connection.commit()
    connection.release()
    delete (global as any).__dbTransaction
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    sqliteDb.exec('COMMIT')
  }
}

export async function rollbackTransaction(): Promise<void> {
  if (DB_TYPE === 'postgresql' && pgPool) {
    await pgPool.query('ROLLBACK')
  } else if (DB_TYPE === 'mysql' && (global as any).__dbTransaction) {
    const connection = (global as any).__dbTransaction
    await connection.rollback()
    connection.release()
    delete (global as any).__dbTransaction
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    sqliteDb.exec('ROLLBACK')
  }
}

// Close database connections
export async function closeDatabase(): Promise<void> {
  if (DB_TYPE === 'postgresql' && pgPool) {
    await pgPool.end()
    pgPool = null
  }
  if (DB_TYPE === 'mysql' && mysqlPool) {
    await mysqlPool.end()
    mysqlPool = null
  }
  if (DB_TYPE === 'sqlite' && sqliteDb) {
    sqliteDb.close()
    sqliteDb = null
  }
}

// Initialize database connection
export async function initDatabase(): Promise<void> {
  try {
    logger.info(`Initializing ${DB_TYPE.toUpperCase()} database...`)
    
    // Test the connection
    await query('SELECT 1')
    logger.info(`✅ ${DB_TYPE.toUpperCase()} database connected successfully`)
  } catch (error) {
    logger.error(`❌ Failed to initialize ${DB_TYPE} database:`, error)
    
    if (DB_TYPE === 'postgresql') {
      logger.error('PostgreSQL connection help:')
      logger.error('  1. Check DATABASE_URL is set correctly')
      logger.error('  2. Format: postgresql://user:password@host:port/database')
      logger.error('  3. Ensure PostgreSQL server is running')
      logger.error('  4. Check network connectivity to database server')
    } else if (DB_TYPE === 'mysql') {
      logger.error('MySQL connection help:')
      logger.error('  1. Check MySQL environment variables are set correctly')
      logger.error('  2. MYSQL_URL or MYSQLHOST, MYSQLDATABASE, MYSQLUSER, MYSQLPASSWORD')
      logger.error('  3. Ensure MySQL server is running on port 3306')
      logger.error('  4. Check user permissions for the database')
    } else if (DB_TYPE === 'sqlite') {
      logger.error('SQLite connection help:')
      logger.error('  1. Check file permissions for database file')
      logger.error('  2. Ensure directory exists and is writable')
    }
    
    throw error
  }
}

// Legacy function for compatibility
export async function getClient() {
  // Return a mock client that uses the query function
  return {
    query: async (sql: string, params?: any[]) => {
      const result = await query(sql, params)
      return result
    },
    release: () => {
      // No-op for compatibility
    },
  }
}

export { DB_TYPE }