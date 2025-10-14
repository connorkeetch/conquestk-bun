/*
  One-off repair script to reconcile corrupted game states.
  Usage:
    npm run repair:game-state            # dry-run (no writes)
    npm run repair:game-state --apply    # apply fixes
*/
import { query } from '../config/database.js'
import type { GamePlayer, SerializedGameState } from '../types/game.js'

type Row = {
  room_id: string
  status: string
  winner_id: string | null
  game_data: SerializedGameState | null
}

const isApply = process.argv.includes('--apply') || process.argv.includes('-y')

function sideKey(_state: SerializedGameState, player: GamePlayer): string {
  const teamId = (player as { teamId?: number | null })?.teamId
  return teamId ? `team:${teamId}` : `player:${player.id}`
}

function summarize(row: Row) {
  const s = row.game_data
  if (!s) {
    return { sides: 0, active: 0, allowTeam: false }
  }
  const active = (s.players || []).filter((p) => !p.isEliminated)
  const sides = new Set(active.map((p) => sideKey(s, p)))
  return {
    sides: sides.size,
    active: active.length,
    allowTeam: Boolean(s.gameConfig?.allowTeamPlay),
  }
}

async function main() {
  const res = await query<Row>(
    `SELECT gs.room_id, gr.status, gr.winner_id, gs.game_data
     FROM game_states gs
     JOIN game_rooms gr ON gr.id = gs.room_id`,
  )

  const rows = res.rows
  const fixes: Array<{ roomId: string; reason: string; actions: string[] }> = []

  for (const row of rows) {
    const { sides, active, allowTeam } = summarize(row)
    const s = row.game_data
    if (!s) continue
    const actions: string[] = []

    if (row.status === 'active' && (allowTeam ? sides <= 1 : active <= 1)) {
      actions.push('status->completed', 'phase->finished')
      if (!row.winner_id) {
        const winner = s.players.find((p) => !p.isEliminated) || null
        if (winner) actions.push(`winner_id->${winner.id}`)
      }
    }

    if (row.status === 'completed') {
      if (!allowTeam && active !== 1) actions.push('completed_but_active!=1')
      if (allowTeam && sides !== 1) actions.push('completed_but_sides!=1')
      if (!row.winner_id) {
        const winner = s.players.find((p) => !p.isEliminated) || null
        if (winner) actions.push(`winner_id->${winner.id}`)
      }
      if (s.phase !== 'finished') actions.push('phase->finished')
    }

    if (actions.length > 0) {
      fixes.push({
        roomId: row.room_id,
        reason: `${row.status} sides=${sides} active=${active}`,
        actions,
      })
      if (isApply) {
        const updated = { ...s, phase: 'finished' as const }
        const winner = updated.players.find((p) => !p.isEliminated) || null
        await query(`UPDATE game_states SET game_data = $2::jsonb WHERE room_id = $1`, [
          row.room_id,
          JSON.stringify(updated),
        ])
        await query(
          `UPDATE game_rooms SET status = 'completed', winner_id = COALESCE($2, winner_id), updated_at = NOW() WHERE id = $1`,
          [row.room_id, winner?.id ?? null],
        )
      }
    }
  }

  // Print summary table
  const header = `${isApply ? 'APPLIED' : 'DRY-RUN'} repairs: ${fixes.length} game(s)`
  // eslint-disable-next-line no-console
  console.log(header)
  for (const fix of fixes) {
    // eslint-disable-next-line no-console
    console.log(` - ${fix.roomId}: ${fix.reason} -> ${fix.actions.join(', ')}`)
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Repair script failed:', e)
  process.exit(1)
})
