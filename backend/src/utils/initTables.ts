import { query } from '../config/database';
import { logger } from './logger';

export async function ensureTablesExist(): Promise<void> {
  try {
    logger.info('🔧 Checking if database tables exist...');
    
    // First check if we can connect and if tables exist
    const result = await query('SELECT 1 FROM users LIMIT 1');
    logger.info('✅ Database tables already exist');
    return;
  } catch (error) {
    logger.warn('⚠️  Tables not found, creating them now...');
    
    try {
      // Create PostgreSQL tables
      await createPostgreSQLTables();
      logger.info('✅ Successfully created all PostgreSQL tables');
      
      // Verify tables were created
      await query('SELECT 1 FROM users LIMIT 1');
      logger.info('✅ Table creation verified');
      
    } catch (createError) {
      logger.error('❌ Failed to create tables:', createError);
      throw new Error(`Database table creation failed: ${createError}`);
    }
  }
}

async function createPostgreSQLTables(): Promise<void> {
  const statements = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    
    `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS game_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_players INTEGER NOT NULL DEFAULT 6,
        is_private BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS room_players (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, user_id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS game_states (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        game_data JSONB NOT NULL,
        turn_number INTEGER DEFAULT 1,
        current_player_id UUID REFERENCES users(id),
        phase VARCHAR(20) DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS game_moves (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        move_type VARCHAR(50) NOT NULL,
        move_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS custom_maps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        map_data JSONB NOT NULL,
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS player_stats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        total_playtime_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
    )`,
    
    // Create indexes
    'CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status)',
    'CREATE INDEX IF NOT EXISTS idx_game_rooms_host_id ON game_rooms(host_id)',
    'CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_moves_game_state_id ON game_moves(game_state_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON game_moves(player_id)',
    'CREATE INDEX IF NOT EXISTS idx_custom_maps_creator_id ON custom_maps(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_custom_maps_public ON custom_maps(is_public)',
    'CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id)',
    
    // Function for updating timestamps
    `CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql'`,
    
    // Triggers
    `DO $$ BEGIN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$`,
    
    `DO $$ BEGIN
        CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$`,
    
    `DO $$ BEGIN
        CREATE TRIGGER update_game_states_updated_at BEFORE UPDATE ON game_states
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$`,
    
    `DO $$ BEGIN
        CREATE TRIGGER update_custom_maps_updated_at BEFORE UPDATE ON custom_maps
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$`,
    
    `DO $$ BEGIN
        CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON player_stats
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$`
  ];

  for (const statement of statements) {
    try {
      await query(statement);
      logger.debug(`✅ Executed: ${statement.substring(0, 50)}...`);
    } catch (error: any) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        logger.debug(`⏭️  Skipped duplicate: ${statement.substring(0, 50)}...`);
      } else {
        logger.error(`❌ Failed statement: ${statement.substring(0, 100)}...`);
        throw error;
      }
    }
  }
}