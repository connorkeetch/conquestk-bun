import mysql from 'mysql2/promise';
import { Database } from 'sqlite3';
import { logger } from '../utils/logger';
import { runMigrations } from '../utils/migrationRunner';

type DatabaseType = 'mysql' | 'sqlite';

// Check for MySQL environment variables (Railway format or custom)
const hasMySQLURL = process.env.MYSQL_URL && process.env.MYSQL_URL !== '';
const hasRailwayMySQL = process.env.MYSQLHOST && process.env.MYSQLDATABASE;
const hasCustomMySQL = process.env.DB_HOST && process.env.DB_NAME;
const hasDatabaseURL = process.env.DATABASE_URL && process.env.DATABASE_URL !== '';

// Use MySQL in production, SQLite in development
// Prioritize MYSQL_URL first since it's Railway's preferred format
const DB_TYPE: DatabaseType = (hasMySQLURL || hasRailwayMySQL || hasCustomMySQL || hasDatabaseURL) ? 'mysql' : 
  (process.env.DB_TYPE as DatabaseType) || 
  (process.env.NODE_ENV === 'production' ? 'mysql' : 'sqlite');

// Log database configuration for debugging
logger.info('🔧 Database Configuration:', {
  DB_TYPE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
  MYSQL_URL: process.env.MYSQL_URL ? 'SET' : 'NOT_SET',
  MYSQLHOST: process.env.MYSQLHOST || 'NOT_SET',
  MYSQLDATABASE: process.env.MYSQLDATABASE || 'NOT_SET',
  DB_HOST: process.env.DB_HOST || 'NOT_SET',
  DB_NAME: process.env.DB_NAME || 'NOT_SET'
});

let mysqlPool: mysql.Pool | null = null;
let sqliteDb: Database | null = null;

if (DB_TYPE === 'mysql') {
  // Try MYSQL_URL first (Railway's preferred format)
  if (hasMySQLURL) {
    logger.info('🔧 Using MYSQL_URL for MySQL connection');
    const url = new URL(process.env.MYSQL_URL!);
    mysqlPool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port || '3306'),
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1), // Remove leading /
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }
  // Railway MySQL format (separate variables)
  else if (hasRailwayMySQL) {
    logger.info('🔧 Using Railway MySQL configuration (individual variables)');
    mysqlPool = mysql.createPool({
      host: process.env.MYSQLHOST!,
      port: parseInt(process.env.MYSQLPORT || '3306'),
      database: process.env.MYSQLDATABASE!,
      user: process.env.MYSQLUSER || 'root',
      password: process.env.MYSQLPASSWORD || '',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  } 
  // Parse DATABASE_URL if available (standard format mysql://user:pass@host:port/database)
  else if (hasDatabaseURL) {
    logger.info('🔧 Using DATABASE_URL for MySQL');
    const url = new URL(process.env.DATABASE_URL!);
    mysqlPool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port || '3306'),
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1), // Remove leading /
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  } 
  // Use custom individual env vars
  else {
    logger.info('🔧 Using custom MySQL environment variables');
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'risk_game',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.SQLITE_DB_PATH || './risk_game.db';
  sqliteDb = new sqlite3.Database(dbPath);
}

export interface DatabaseResult {
  rows: any[];
  rowCount?: number;
  lastID?: number;
  insertId?: number;
}

export interface DatabaseClient {
  query(text: string, params?: any[]): Promise<DatabaseResult>;
  release?(): void;
  beginTransaction?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

class SqliteClient implements DatabaseClient {
  constructor(private db: Database) {}

  async query(text: string, params: any[] = []): Promise<DatabaseResult> {
    return new Promise((resolve, reject) => {
      const isSelect = text.trim().toLowerCase().startsWith('select') || 
                      text.trim().toLowerCase().startsWith('with');
      
      if (isSelect) {
        this.db.all(text, params, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows: rows || [], rowCount: rows?.length || 0 });
        });
      } else {
        this.db.run(text, params, function(err) {
          if (err) reject(err);
          else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
        });
      }
    });
  }

  async beginTransaction(): Promise<void> {
    await this.query('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.query('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.query('ROLLBACK');
  }
}

class MySQLClient implements DatabaseClient {
  constructor(private connection: mysql.PoolConnection) {}

  async query(text: string, params: any[] = []): Promise<DatabaseResult> {
    try {
      const [result] = await this.connection.execute(text, params);
      
      if (Array.isArray(result)) {
        // SELECT query
        return {
          rows: result,
          rowCount: result.length
        };
      } else {
        // INSERT, UPDATE, DELETE query
        const resultSetHeader = result as mysql.ResultSetHeader;
        return {
          rows: [],
          rowCount: resultSetHeader.affectedRows,
          insertId: resultSetHeader.insertId
        };
      }
    } catch (error: any) {
      logger.error('MySQL query error:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        query: text,
        params: params
      });
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.connection.commit();
  }

  async rollback(): Promise<void> {
    await this.connection.rollback();
  }

  release() {
    this.connection.release();
  }
}

export const query = async (text: string, params: any[] = []): Promise<DatabaseResult> => {
  if (DB_TYPE === 'mysql' && mysqlPool) {
    try {
      const [result] = await mysqlPool.execute(text, params);
      
      if (Array.isArray(result)) {
        // SELECT query
        return {
          rows: result,
          rowCount: result.length
        };
      } else {
        // INSERT, UPDATE, DELETE query
        const resultSetHeader = result as mysql.ResultSetHeader;
        return {
          rows: [],
          rowCount: resultSetHeader.affectedRows,
          insertId: resultSetHeader.insertId
        };
      }
    } catch (error: any) {
      logger.error('MySQL query error:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        query: text,
        params: params
      });
      throw error;
    }
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    const client = new SqliteClient(sqliteDb);
    return await client.query(text, params);
  } else {
    throw new Error('No database connection available');
  }
};

export const getClient = async (): Promise<DatabaseClient> => {
  if (DB_TYPE === 'mysql' && mysqlPool) {
    const connection = await mysqlPool.getConnection();
    return new MySQLClient(connection);
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    return new SqliteClient(sqliteDb);
  } else {
    throw new Error('No database connection available');
  }
};

export async function initDatabase() {
  try {
    logger.info(`Initializing ${DB_TYPE.toUpperCase()} database...`);
    
    if (DB_TYPE === 'mysql') {
      if (!mysqlPool) {
        throw new Error('MySQL pool not initialized. Check your DATABASE_URL or DB_* environment variables.');
      }
      
      const testResult = await query('SELECT NOW() as current_time');
      logger.info('✅ MySQL database connected successfully');
      logger.info('  Connection test result:', testResult.rows[0]);
      
      // Test if tables exist and create them if not
      try {
        await query('SELECT 1 FROM users LIMIT 1');
        logger.info('✅ Database tables found');
      } catch (tableError) {
        logger.warn('⚠️  Database tables not found, attempting to create them...');
        await createMySQLTables();
        logger.info('✅ MySQL tables created successfully');
      }
      
      // Run additional migrations for MySQL too
      await runMigrations();
      logger.info('✅ MySQL migrations applied');
      
    } else if (DB_TYPE === 'sqlite') {
      if (!sqliteDb) {
        throw new Error('SQLite database not initialized. Check your SQLITE_DB_PATH environment variable.');
      }
      
      await query('SELECT 1');
      logger.info('✅ SQLite database connected successfully');
      await initializeSqliteTables();
      logger.info('✅ SQLite tables initialized');
      
      // Run additional migrations
      await runMigrations();
      logger.info('✅ Extended map schema applied');
      
    } else {
      throw new Error(`Unsupported database type: ${DB_TYPE}. Use 'mysql' or 'sqlite'.`);
    }
    
    logger.info('🎯 Database initialization complete');
    
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    
    if (DB_TYPE === 'mysql') {
      logger.error(`
🔧 MySQL Connection Troubleshooting:
  1. Is MySQL server running? Try: mysql --version
  2. Check connection string: ${process.env.DATABASE_URL || 'Not set'}
  3. Verify credentials and database exists
  4. Try: CREATE DATABASE risk_game;
  5. Alternative: Set DB_TYPE=sqlite to use SQLite instead
      `);
    } else if (DB_TYPE === 'sqlite') {
      logger.error(`
🔧 SQLite Connection Troubleshooting:
  1. Check file permissions for: ${process.env.SQLITE_DB_PATH || './risk_game.db'}
  2. Ensure directory exists and is writable
  3. Try deleting the database file to recreate it
      `);
    }
    
    // In production, log the error but don't crash the server immediately
    // This allows Railway to display better error logs
    logger.warn('⚠️  Running without database - some features will be limited');
    logger.warn('🔧 Fix database issues above and restart to enable full functionality');
    
    if (process.env.NODE_ENV === 'production') {
      logger.error('💡 To fix in Railway: Ensure MySQL database is added and DATABASE_URL is set');
      // Don't throw in production - let the app start so we can see logs
      // throw error;
    }
  }
}

async function createMySQLTables() {
  const createTables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Game rooms table
    `CREATE TABLE IF NOT EXISTS game_rooms (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        name VARCHAR(100) NOT NULL,
        host_id VARCHAR(36) NOT NULL,
        max_players INTEGER NOT NULL DEFAULT 6,
        is_private BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Room players table
    `CREATE TABLE IF NOT EXISTS room_players (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_room_user (room_id, user_id)
    )`,

    // Game states table
    `CREATE TABLE IF NOT EXISTS game_states (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        room_id VARCHAR(36) NOT NULL,
        game_data JSON NOT NULL,
        turn_number INTEGER DEFAULT 1,
        current_player_id VARCHAR(36),
        phase VARCHAR(20) DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (current_player_id) REFERENCES users(id)
    )`,

    // Game moves table
    `CREATE TABLE IF NOT EXISTS game_moves (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        game_state_id VARCHAR(36) NOT NULL,
        player_id VARCHAR(36) NOT NULL,
        move_type VARCHAR(50) NOT NULL,
        move_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_state_id) REFERENCES game_states(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Custom maps table
    `CREATE TABLE IF NOT EXISTS custom_maps (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        name VARCHAR(100) NOT NULL,
        creator_id VARCHAR(36) NOT NULL,
        map_data JSON NOT NULL,
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Player statistics table
    `CREATE TABLE IF NOT EXISTS player_stats (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id VARCHAR(36) NOT NULL UNIQUE,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        total_playtime_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status)`,
    `CREATE INDEX IF NOT EXISTS idx_game_rooms_host_id ON game_rooms(host_id)`,
    `CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_game_moves_game_state_id ON game_moves(game_state_id)`,
    `CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON game_moves(player_id)`,
    `CREATE INDEX IF NOT EXISTS idx_custom_maps_creator_id ON custom_maps(creator_id)`,
    `CREATE INDEX IF NOT EXISTS idx_custom_maps_public ON custom_maps(is_public)`,
    `CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id)`
  ];

  for (const statement of createTables) {
    try {
      await query(statement);
    } catch (error: any) {
      // Log but don't fail on duplicate indexes
      if (!error.message.includes('already exists') && !error.message.includes('Duplicate')) {
        logger.error('Error creating table/index:', error);
        throw error;
      }
    }
  }
}

async function initializeSqliteTables() {
  const createTables = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_sent_at TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Game rooms table
    CREATE TABLE IF NOT EXISTS game_rooms (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        name TEXT NOT NULL,
        host_id TEXT NOT NULL,
        max_players INTEGER NOT NULL DEFAULT 6,
        is_private BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Room players table
    CREATE TABLE IF NOT EXISTS room_players (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(room_id, user_id)
    );

    -- Game states table
    CREATE TABLE IF NOT EXISTS game_states (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        room_id TEXT NOT NULL,
        game_data TEXT NOT NULL,
        turn_number INTEGER DEFAULT 1,
        current_player_id TEXT,
        phase TEXT DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (current_player_id) REFERENCES users(id)
    );

    -- Game moves table
    CREATE TABLE IF NOT EXISTS game_moves (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        game_state_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        move_type TEXT NOT NULL,
        move_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_state_id) REFERENCES game_states(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Custom maps table
    CREATE TABLE IF NOT EXISTS custom_maps (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        name TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        map_data TEXT NOT NULL,
        is_public BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Player statistics table
    CREATE TABLE IF NOT EXISTS player_stats (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        user_id TEXT NOT NULL UNIQUE,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        total_playtime_minutes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
    CREATE INDEX IF NOT EXISTS idx_game_rooms_host_id ON game_rooms(host_id);
    CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);
    CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id);
    CREATE INDEX IF NOT EXISTS idx_game_moves_game_state_id ON game_moves(game_state_id);
    CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON game_moves(player_id);
    CREATE INDEX IF NOT EXISTS idx_custom_maps_creator_id ON custom_maps(creator_id);
    CREATE INDEX IF NOT EXISTS idx_custom_maps_public ON custom_maps(is_public);
    CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);
  `;

  const statements = createTables.split(';').filter(stmt => stmt.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await query(statement.trim());
    }
  }
}

// Legacy export for backward compatibility
export const pool = {
  query,
  connect: getClient
};