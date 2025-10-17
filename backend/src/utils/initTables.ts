import { query } from '../config/database.js'
import { logger } from './logger.js'

export async function ensureTablesExist(): Promise<void> {
  try {
    logger.info('🔧 Checking if database tables exist...')

    // First check if we can connect and if tables exist
    const _result = await query('SELECT 1 FROM users LIMIT 1')
    logger.info('✅ Database tables already exist')
    return
  } catch (_error) {
    logger.warn('⚠️  Tables not found, creating them now...')

    try {
      // Create PostgreSQL tables
      await createPostgreSQLTables()
      logger.info('✅ Successfully created all PostgreSQL tables')

      // Verify tables were created
      await query('SELECT 1 FROM users LIMIT 1')
      logger.info('✅ Table creation verified')
    } catch (createError) {
      logger.error('❌ Failed to create tables:', createError)
      throw new Error(`Database table creation failed: ${createError}`)
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
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS game_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_players INTEGER NOT NULL DEFAULT 6,
        is_private BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'lobby' CHECK (status IN ('lobby', 'initializing', 'active', 'completed', 'abandoned', 'paused')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS room_players (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ai_player_id UUID,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_ai BOOLEAN NOT NULL DEFAULT FALSE,
        ai_difficulty VARCHAR(20),
        ai_personality_seed INTEGER,
        UNIQUE(room_id, user_id),
        CONSTRAINT room_players_ai_difficulty_check CHECK (
          ai_difficulty IS NULL OR ai_difficulty IN ('recruit', 'commander', 'grandmaster')
        )
    )`,

    `CREATE TABLE IF NOT EXISTS game_states (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        game_data JSONB,
        turn_number INTEGER DEFAULT 1 NOT NULL,
        current_player_id UUID REFERENCES users(id),
        game_phase VARCHAR(20) DEFAULT 'reinforcement' CHECK (game_phase IN ('reinforcement','deployment','attack','fortify','finished')),
        territories JSONB NOT NULL DEFAULT '{}'::jsonb,
        player_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
        replay_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        ai_players JSONB NOT NULL DEFAULT '[]'::jsonb,
        winner_id UUID,
        turn_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id)
    )`,

    `CREATE TABLE IF NOT EXISTS game_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        ts TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        turn_number INTEGER NOT NULL DEFAULT 1,
        phase VARCHAR(32) NOT NULL DEFAULT 'reinforcement',
        move_type VARCHAR(64) NOT NULL,
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        from_territory_id TEXT,
        to_territory_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS game_battle_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('BATTLE', 'ENGAGEMENT_SUMMARY')),
        job_id TEXT,
        engagement_id TEXT,
        entry_timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        turn_number INTEGER NOT NULL DEFAULT 1,
        attacking_territory_id TEXT,
        defending_territory_id TEXT,
        attacker_id UUID,
        defender_id UUID,
        attacker_losses INTEGER,
        defender_losses INTEGER,
        conquered BOOLEAN,
        moved_armies INTEGER,
        eliminated_players JSONB NOT NULL DEFAULT '[]'::jsonb,
        initial_from_armies INTEGER,
        initial_to_armies INTEGER,
        total_attacker_losses INTEGER,
        total_defender_losses INTEGER,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS game_moves (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        move_type VARCHAR(50) NOT NULL,
        move_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS game_move_archive (
        id UUID PRIMARY KEY,
        room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        turn_number INTEGER NOT NULL,
        move_type VARCHAR(50) NOT NULL,
        move_data JSONB NOT NULL,
        is_valid BOOLEAN NOT NULL DEFAULT TRUE,
        validation_error TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    'CREATE INDEX IF NOT EXISTS idx_game_logs_game_ts ON game_logs(game_id, ts)',
    'CREATE INDEX IF NOT EXISTS idx_game_battle_logs_game_ts ON game_battle_logs(game_id, entry_timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_game_battle_logs_game_engagement ON game_battle_logs(game_id, engagement_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_game_battle_logs_unique_job ON game_battle_logs(game_id, job_id) WHERE job_id IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_game_moves_game_state_id ON game_moves(game_state_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON game_moves(player_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_room_id ON game_move_archive(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_player_id ON game_move_archive(player_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_turn_number ON game_move_archive(turn_number)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_move_type ON game_move_archive(move_type)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_created_at ON game_move_archive(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_game_move_archive_archived_at ON game_move_archive(archived_at)',
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
    END $$`,
  ]

  for (const statement of statements) {
    try {
      await query(statement)
      logger.debug(`✅ Executed: ${statement.substring(0, 50)}...`)
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          logger.debug(`⏭️  Skipped duplicate: ${statement.substring(0, 50)}...`)
        } else {
          logger.error(`❌ Failed statement: ${statement.substring(0, 100)}...`)
          throw error
        }
      } else {
        logger.error(`❌ Failed statement: ${statement.substring(0, 100)}...`)
        throw error
      }
    }
  }
}
