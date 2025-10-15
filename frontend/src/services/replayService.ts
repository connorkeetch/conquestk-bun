import apiClient from './api'

export type ReplayPlayerMeta = { id: string; username: string; color?: string }

export type ReplaySummary = {
  rounds: number
  turns: number
  players: ReplayPlayerMeta[]
  hasFog: boolean
  mode: string
  options: {
    fogOfWar?: string
    mapId?: string | null
    isPrivate?: boolean
  }
  createdAt: string | null
  completedAt: string | null
}

export type ArmyMap = Record<string, { ownerId: string | null; armies: number }>

export type ReplayTurnItem = {
  turnNumber: number
  roundNumber: number
  playerId: string | null
  phases: Array<'reinforce' | 'attack' | 'fortify'>
  deltas: Array<import('@conquestk/shared/types').GameDelta>
  stats: {
    conquered: number
    lost: number
    armiesLost: number
    armiesKilled: number
    treasuresDrawn: number
    treasuresRedeemed: number
    treasurePayout: number
  }
  preArmyMap?: ArmyMap
  postArmyMap?: ArmyMap
}

export async function getReplaySummary(
  gameId: string,
  signal?: AbortSignal,
): Promise<ReplaySummary> {
  const r = await apiClient.get(`/games/${encodeURIComponent(gameId)}/replay/summary`, { signal })
  return r.data as ReplaySummary
}

export async function getReplayChunk(
  gameId: string,
  fromTurn: number,
  toTurn: number,
  signal?: AbortSignal,
): Promise<ReplayTurnItem[]> {
  const r = await apiClient.get(`/games/${encodeURIComponent(gameId)}/replay/chunk`, {
    params: { fromTurn, toTurn },
    signal,
  })
  return r.data as ReplayTurnItem[]
}
