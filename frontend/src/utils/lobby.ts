import type { GameLifecycleStatus, GameRoom } from '../types/gameRoom'

export const statusLabel: Record<GameLifecycleStatus, string> = {
  lobby: 'Waiting for players',
  initializing: 'Launching',
  active: 'In progress',
  completed: 'Finished',
  paused: 'Paused',
  abandoned: 'Closed',
}

export const formatStatus = (status?: GameRoom['status']) => {
  if (!status) return 'Unknown'
  return statusLabel[status]
}

export const seatUsage = (room?: Pick<GameRoom, 'players' | 'maxPlayers'>) => {
  if (!room) return { joined: 0, total: 0, label: '0/0' }
  const joined = Array.isArray(room.players) ? room.players.length : 0
  const total = typeof room.maxPlayers === 'number' ? room.maxPlayers : 0
  return { joined, total, label: `${joined}/${total}` }
}

export const formatTurnTimer = (seconds?: number | null) => {
  const s = seconds ?? 0
  if (!s || s <= 0) return 'Off'
  if (s >= 3600) {
    const hours = Math.floor(s / 3600)
    const rem = Math.floor((s % 3600) / 60)
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`
  }
  if (s >= 60) {
    const minutes = Math.floor(s / 60)
    const rem = s % 60
    return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
  }
  return `${s}s`
}
export const hostDisplay = (room?: Pick<GameRoom, 'hostUsername' | 'hostId'>) => {
  if (!room) return 'Unknown'
  return room.hostUsername || room.hostId || 'Unknown'
}
