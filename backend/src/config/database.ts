import { Pool, QueryResult } from 'pg';
import { Database } from 'sqlite3';
import { logger } from '../utils/logger';
import { runMigrations } from '../utils/migrationRunner';

type DatabaseType = 'postgresql' | 'sqlite';
// Force PostgreSQL in production if DATABASE_URL is set
const DB_TYPE: DatabaseType = process.env.DATABASE_URL ? 'postgresql' : 
  (process.env.DB_TYPE as DatabaseType) || 
  (process.env.NODE_ENV === 'production' ? 'postgresql' : 'sqlite');

// Log database configuration for debugging
logger.info('🔧 Database Configuration:', {
  DB_TYPE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
  DB_HOST: process.env.DB_HOST || 'NOT_SET',
  DB_NAME: process.env.DB_NAME || 'NOT_SET'
});


let pgPool: Pool | null = null;
let sqliteDb: Database | null = null;

if (DB_TYPE === 'postgresql') {
  // Use DATABASE_URL if available (Railway/Heroku style), otherwise use individual env vars
  if (process.env.DATABASE_URL) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  } else {
    pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'risk_game',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
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
}

export interface DatabaseClient {
  query(text: string, params?: any[]): Promise<DatabaseResult>;
  release?(): void;
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
          else resolve({ rows: [], rowCount: this.changes });
        });
      }
    });
  }
}

class PostgresClient implements DatabaseClient {
  constructor(private client: any) {}

  async query(text: string, params: any[] = []): Promise<DatabaseResult> {
    const result = await this.client.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount
    };
  }

  release() {
    this.client.release();
  }
}

export const query = async (text: string, params: any[] = []): Promise<DatabaseResult> => {
  if (DB_TYPE === 'postgresql' && pgPool) {
    const result = await pgPool.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? undefined
    };
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    const client = new SqliteClient(sqliteDb);
    return await client.query(text, params);
  } else {
    throw new Error('No database connection available');
  }
};

export const getClient = async (): Promise<DatabaseClient> => {
  if (DB_TYPE === 'postgresql' && pgPool) {
    const client = await pgPool.connect();
    return new PostgresClient(client);
  } else if (DB_TYPE === 'sqlite' && sqliteDb) {
    return new SqliteClient(sqliteDb);
  } else {
    throw new Error('No database connection available');
  }
};

export async function initDatabase() {
  try {
    logger.info(`Initializing ${DB_TYPE.toUpperCase()} database...`);
    
    if (DB_TYPE === 'postgresql') {
      if (!pgPool) {
        throw new Error('PostgreSQL pool not initialized. Check your DATABASE_URL or DB_* environment variables.');
      }
      
      await query('SELECT NOW()');
      logger.info('✅ PostgreSQL database connected successfully');
      
      // Test if tables exist and create them if not
      try {
        await query('SELECT 1 FROM users LIMIT 1');
        logger.info('✅ Database tables found');
      } catch (tableError) {
        logger.warn('⚠️  Database tables not found, attempting to create them...');
        await createPostgreSQLTables();
        logger.info('✅ PostgreSQL tables created successfully');
      }
      
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
      throw new Error(`Unsupported database type: ${DB_TYPE}. Use 'postgresql' or 'sqlite'.`);
    }
    
    logger.info('🎯 Database initialization complete');
    
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    
    if (DB_TYPE === 'postgresql') {
      logger.error(`
🔧 PostgreSQL Connection Troubleshooting:
  1. Is PostgreSQL server running? Try: pg_isready
  2. Check connection string: ${process.env.DATABASE_URL || 'Not set'}
  3. Verify credentials and database exists
  4. Try: createdb risk_game
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
      logger.error('💡 To fix in Railway: Ensure PostgreSQL plugin is added and DATABASE_URL is set');
      // Don't throw in production - let the app start so we can see logs
      // throw error;
    }
  }
}

async function createPostgreSQLTables() {
  const createTables = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Game rooms table
    CREATE TABLE IF NOT EXISTS game_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_players INTEGER NOT NULL DEFAULT 6,
        is_private BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Room players table
    CREATE TABLE IF NOT EXISTS room_players (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, user_id)
    );

    -- Game states table
    CREATE TABLE IF NOT EXISTS game_states (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        game_data JSONB NOT NULL,
        turn_number INTEGER DEFAULT 1,
        current_player_id UUID REFERENCES users(id),
        phase VARCHAR(20) DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Game moves table
    CREATE TABLE IF NOT EXISTS game_moves (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        move_type VARCHAR(50) NOT NULL,
        move_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Custom maps table
    CREATE TABLE IF NOT EXISTS custom_maps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        map_data JSONB NOT NULL,
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Player statistics table
    CREATE TABLE IF NOT EXISTS player_stats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        total_playtime_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
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

    -- Function to update updated_at timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Triggers to automatically update updated_at
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_game_states_updated_at BEFORE UPDATE ON game_states
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_custom_maps_updated_at BEFORE UPDATE ON custom_maps
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON player_stats
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  const statements = createTables.split(';').filter(stmt => stmt.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await query(statement.trim());
      } catch (error: any) {
        // Log but don't fail on duplicate triggers/functions
        if (!error.message.includes('already exists')) {
          logger.error('Error creating table:', error);
          throw error;
        }
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