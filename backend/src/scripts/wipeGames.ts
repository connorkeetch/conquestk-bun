import readline from 'node:readline'
import { getClient } from '../config/database.js'
import { logger } from '../utils/logger.js'

type Filters = {
  ids?: string[]
  nameLike?: string | null
  statusIn?: string[]
  createdBefore?: string | null
  createdAfter?: string | null
}

function parseFilters(): Filters {
  const getArg = (flag: string) => {
    const idx = process.argv.indexOf(flag)
    return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null
  }
  const idsArg = getArg('--ids')
  const nameLike = getArg('--name-like')
  const statusInArg = getArg('--status-in')
  const createdBefore = getArg('--created-before')
  const createdAfter = getArg('--created-after')

  return {
    ids: idsArg
      ? idsArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    nameLike,
    statusIn: statusInArg
      ? statusInArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    createdBefore,
    createdAfter,
  }
}

function hasAnyFilter(f: Filters) {
  return Boolean(
    f.ids?.length || f.nameLike || f.statusIn?.length || f.createdAfter || f.createdBefore,
  )
}

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
  const filters = parseFilters()

  logger.warn(
    `Wipe Games Script starting${dryRun ? ' (dry-run)' : ''}${
      hasAnyFilter(filters) ? ' (filtered)' : ''
    }`,
  )

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Determine target game IDs (filtered or all)
    let idSelectionSQL = 'SELECT id FROM game_rooms'
    const conds: string[] = []
    const params: unknown[] = []

    if (filters.ids && filters.ids.length > 0) {
      const placeholders = filters.ids.map((_id, i) => `$${params.length + i + 1}`).join(',')
      conds.push(`id IN (${placeholders})`)
      params.push(...filters.ids)
    }
    if (filters.nameLike) {
      conds.push(`name ILIKE $${params.length + 1}`)
      params.push(filters.nameLike)
    }
    if (filters.statusIn && filters.statusIn.length > 0) {
      conds.push(`status = ANY($${params.length + 1})`)
      params.push(filters.statusIn)
    }
    if (filters.createdBefore) {
      conds.push(`created_at < $${params.length + 1}`)
      params.push(filters.createdBefore)
    }
    if (filters.createdAfter) {
      conds.push(`created_at > $${params.length + 1}`)
      params.push(filters.createdAfter)
    }
    if (conds.length > 0) {
      idSelectionSQL += ` WHERE ${conds.join(' AND ')}`
    }

    const targetRes = await client.query<{ id: string }>(idSelectionSQL, params)
    const targetIds = targetRes.rows.map((r) => r.id)
    const gameRoomCount = targetIds.length

    if (gameRoomCount === 0) {
      logger.info('No game rooms found; nothing to delete')
      await client.query('ROLLBACK')
      return
    }

    logger.warn(`Found ${gameRoomCount} game room(s) to delete`)
    logger.debug(`Target IDs: ${targetIds.join(', ')}`)

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
        'game_move_archive',
        'game_results',
        'game_territory_modifiers',
        'capital_eliminations',
        'rating_history',
      ] as const

      for (const t of tablesToCheck) {
        const res = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int as count FROM ${t} WHERE (
             ($1::text = 'room_players' AND room_id = ANY($2)) OR
             ($1::text = 'game_states' AND room_id = ANY($2)) OR
             ($1::text = 'game_moves' AND room_id = ANY($2)) OR
             ($1::text = 'game_move_archive' AND room_id = ANY($2)) OR
             ($1::text = 'game_results' AND room_id = ANY($2)) OR
             ($1::text = 'game_territory_modifiers' AND game_id = ANY($2)) OR
             ($1::text = 'capital_eliminations' AND game_id = ANY($2)) OR
             ($1::text = 'rating_history' AND game_room_id = ANY($2))
           )`,
          [t, targetIds],
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
        sql: `UPDATE conversations SET game_id = NULL WHERE game_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Null clan_war_matches.game_id references',
        sql: `UPDATE clan_war_matches SET game_id = NULL WHERE game_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete rating_history rows',
        sql: `DELETE FROM rating_history WHERE game_room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete capital_eliminations',
        sql: `DELETE FROM capital_eliminations WHERE game_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_territory_modifiers',
        sql: `DELETE FROM game_territory_modifiers WHERE game_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_moves',
        sql: `DELETE FROM game_moves WHERE room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_move_archive',
        sql: `DELETE FROM game_move_archive WHERE room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_results',
        sql: `DELETE FROM game_results WHERE room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_states',
        sql: `DELETE FROM game_states WHERE room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete room_players',
        sql: `DELETE FROM room_players WHERE room_id = ANY($1)`,
        params: [targetIds],
      },
      {
        label: 'Delete game_rooms',
        sql: `DELETE FROM game_rooms WHERE id = ANY($1)`,
        params: [targetIds],
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
