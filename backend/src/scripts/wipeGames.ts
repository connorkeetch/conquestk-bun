import readline from 'node:readline'
import { getClient } from '../config/database'
import { logger } from '../utils/logger'

async function promptConfirm(message: string): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer: string = await new Promise((resolve) =>
    rl.question(`${message} (yes/no): `, (ans) => resolve(ans.trim().toLowerCase())),
  )
  rl.close()
  return answer === 'y' || answer === 'yes'
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  logger.warn(`Wipe Games Script starting${dryRun ? ' (dry-run)' : ''}`)

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Count current game rooms
    const preCount = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int as count FROM game_rooms',
    )
    const gameRoomCount = preCount.rows[0]?.count ?? 0

    if (gameRoomCount === 0) {
      logger.info('No game rooms found; nothing to delete')
      await client.query('ROLLBACK')
      return
    }

    logger.warn(`Found ${gameRoomCount} game room(s) to delete`)

    if (
      !(await promptConfirm('This will permanently delete ALL games and related data. Proceed?'))
    ) {
      await client.query('ROLLBACK')
      logger.info('Aborted by user')
      return
    }

    if (dryRun) {
      // Show counts from related tables
      const tablesToCheck = [
        'room_players',
        'game_states',
        'game_moves',
        'game_results',
        'game_territory_modifiers',
        'capital_eliminations',
        'rating_history',
      ] as const

      for (const t of tablesToCheck) {
        const res = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int as count FROM ${t} WHERE (
             ($1::text = 'room_players' AND room_id IS NOT NULL) OR
             ($1::text = 'game_states' AND room_id IS NOT NULL) OR
             ($1::text = 'game_moves' AND room_id IS NOT NULL) OR
             ($1::text = 'game_results' AND room_id IS NOT NULL) OR
             ($1::text = 'game_territory_modifiers' AND game_id IS NOT NULL) OR
             ($1::text = 'capital_eliminations' AND game_id IS NOT NULL) OR
             ($1::text = 'rating_history' AND game_room_id IS NOT NULL)
           )`,
          [t],
        )
        logger.info(`${t}: ~${res.rows[0]?.count ?? 0} row(s) associated`)
      }

      await client.query('ROLLBACK')
      logger.info('Dry-run complete; no changes applied')
      return
    }

    // Order matters for non-cascading references
    const steps: Array<{ label: string; sql: string; params?: unknown[] }> = [
      {
        label: 'Null conversations.game_id references',
        sql: `UPDATE conversations SET game_id = NULL WHERE game_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Null clan_war_matches.game_id references',
        sql: `UPDATE clan_war_matches SET game_id = NULL WHERE game_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete rating_history rows',
        sql: `DELETE FROM rating_history WHERE game_room_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete capital_eliminations',
        sql: `DELETE FROM capital_eliminations WHERE game_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete game_territory_modifiers',
        sql: `DELETE FROM game_territory_modifiers WHERE game_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete game_moves',
        sql: `DELETE FROM game_moves WHERE room_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete game_results',
        sql: `DELETE FROM game_results WHERE room_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete game_states',
        sql: `DELETE FROM game_states WHERE room_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete room_players',
        sql: `DELETE FROM room_players WHERE room_id IN (SELECT id FROM game_rooms)`,
      },
      {
        label: 'Delete game_rooms',
        sql: `DELETE FROM game_rooms`,
      },
      {
        label: 'Reset game_room_code_seq (if present)',
        sql: `DO $$ BEGIN IF EXISTS (
                SELECT 1 FROM information_schema.sequences 
                WHERE sequence_schema='public' AND sequence_name='game_room_code_seq'
              ) THEN
                EXECUTE 'ALTER SEQUENCE public.game_room_code_seq RESTART WITH 1';
              END IF; END $$;`,
      },
    ]

    const results: Array<{ label: string; affected: number | null }> = []
    for (const step of steps) {
      try {
        const res = await client.query(step.sql, step.params ?? [])
        results.push({ label: step.label, affected: (res.rowCount as number) ?? null })
      } catch (err) {
        // For optional steps like sequences, continue
        results.push({ label: `${step.label} (skipped/error)`, affected: null })
        logger.warn(`Step failed or skipped: ${step.label}`, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    await client.query('COMMIT')

    logger.info('Wipe complete. Summary:')
    for (const r of results) {
      logger.info(`- ${r.label}: ${r.affected ?? 'n/a'}`)
    }
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Wipe games failed; rolled back', error)
    process.exitCode = 1
  } finally {
    client.release()
  }
}

main().catch((e) => {
  logger.error('Fatal error in wipeGames script', e)
  process.exit(1)
})
