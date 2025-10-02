import dotenv from 'dotenv'

dotenv.config()

import { v4 as uuidv4 } from 'uuid'
import { initDatabase, query } from '../config/database'
import achievementService from '../services/achievementService'
import { profileService } from '../services/profileService'
import { logger } from '../utils/logger'

async function ensureUsers(): Promise<{ p1: { id: string }; p2: { id: string } }> {
  // Try to find player1/player2; if missing, seed them via insert
  const existing = await query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE username IN ('player1','player2')`,
  )
  const map = new Map(existing.rows.map((r) => [r.username, r.id]))

  async function create(username: string, email: string, passwordHash: string) {
    const res = await query<{ id: string }>(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [username, email, passwordHash],
    )
    return res.rows[0].id
  }

  const dummyHash = '$2a$10$CVM2rB8F/p86p2s2mQtQeuZyGgfcx7jYkYoRHGOLfaHM8r7yqXo/m' // 'player123'
  const p1Id = map.get('player1') || (await create('player1', 'player1@example.com', dummyHash))
  const p2Id = map.get('player2') || (await create('player2', 'player2@example.com', dummyHash))
  return { p1: { id: p1Id }, p2: { id: p2Id } }
}

async function insertResult(
  gameId: string,
  gameMode: string,
  winnerId: string,
  loserId: string,
  dominated: boolean,
) {
  // Minimal room for mode lookup by achievementService
  await query(
    `INSERT INTO game_rooms (id, name, host_id, map_id, game_mode, status, started_at, ended_at, winner_id, turn_timer)
     SELECT $1, $2, $3, m.id, $4, 'completed', NOW() - INTERVAL '5 minutes', NOW(), $3, 86400
     FROM maps m
     ORDER BY m.created_at ASC
     LIMIT 1
     ON CONFLICT (id) DO NOTHING`,
    [gameId, `${gameMode}-test`, winnerId, gameMode],
  )

  // Create matching game_results row required by player_game_results FK
  await query(
    `INSERT INTO game_results (room_id, map_id, winner_id, duration_seconds, total_turns, final_state, player_summary, battle_log)
     SELECT $1, m.id, $2, 300, 10, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb
     FROM maps m
     ORDER BY m.created_at ASC
     LIMIT 1
     ON CONFLICT (room_id) DO NOTHING`,
    [gameId, winnerId],
  )

  // Insert player_game_results
  await query(
    `INSERT INTO player_game_results (
       room_id, user_id, position, is_winner, eliminated, territories, armies, elimination_order, rating_before, rating_after, rating_change
     ) VALUES 
       ($1, $2, 1, TRUE, FALSE, 20, 100, NULL, 1000, 1010, 10),
       ($1, $3, 2, FALSE, $4, 0, 10, 1, 1000, 990, -10)
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [gameId, winnerId, loserId, dominated],
  )
}

async function simulate() {
  await initDatabase()
  const { p1, p2 } = await ensureUsers()

  // Classic dominated win (first win) → World Eater + Classic Conqueror
  const normalGameId = uuidv4()
  await insertResult(normalGameId, 'classic', p1.id, p2.id, true)
  await achievementService.handleGameCompleted(normalGameId, [
    { userId: p1.id, isWinner: true, eliminated: false },
    { userId: p2.id, isWinner: false, eliminated: true },
  ])

  // Capitals win → Crown Jewel (second win, so World Eater should not recur)
  const capitalsGameId = uuidv4()
  await insertResult(capitalsGameId, 'capital', p1.id, p2.id, false)
  await achievementService.handleGameCompleted(capitalsGameId, [
    { userId: p1.id, isWinner: true, eliminated: false },
    { userId: p2.id, isWinner: false, eliminated: false },
  ])

  // Report unlocked achievements for p1
  const { unlocked } = await profileService.getAchievements(p1.id)
  const names = (unlocked as unknown as Array<{ name?: string }>).map((u) => u.name ?? 'unknown')
  logger.info('Unlocked achievements for player1:', { names })
}

simulate()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error('Simulation failed', e)
    process.exit(1)
  })
