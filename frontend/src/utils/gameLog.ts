import type { GameRoom } from '@/types/gameRoom'
import type { GameState } from '@/types/game'

export function isParticipantInRoom(
  room: GameRoom | null | undefined,
  game: GameState | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  try {
    const uid = currentUserId || undefined
    if (!uid) return false
    if (room?.hostId && room.hostId === uid) return true
    if (Array.isArray(room?.players)) {
      for (const p of room!.players!) {
        const pid = (p.userId ?? p.id) as string | undefined
        if (pid && pid === uid) return true
      }
    }
    if (Array.isArray(game?.players)) {
      for (const gp of game!.players!) {
        if (gp.id === uid) return true
      }
    }
    return false
  } catch {
    return false
  }
}

export type TurnStatLike = {
  turn: number
  timestamp: string
  players?: Array<{ eliminated?: boolean }>
}

export function deriveRoundMarkers(
  turnStats: TurnStatLike[],
): Array<{ timestamp: string; round: number }> {
  if (!Array.isArray(turnStats) || turnStats.length === 0) return []
  const sorted = [...turnStats].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const markers: Array<{ timestamp: string; round: number }> = []
  let lastRound = 0
  for (const snap of sorted) {
    const turnNum = Number.isFinite(Number(snap.turn)) ? Math.max(1, Math.trunc(Number(snap.turn))) : NaN
    if (!Number.isFinite(turnNum)) continue
    const playersArr = Array.isArray(snap.players) ? snap.players : []
    const active = Math.max(1, playersArr.filter((p) => !p?.eliminated).length || playersArr.length || 1)
    const round = Math.max(1, Math.ceil(turnNum / active))
    if (round > lastRound) {
      markers.push({ timestamp: snap.timestamp, round })
      lastRound = round
    }
  }
  return markers
}

