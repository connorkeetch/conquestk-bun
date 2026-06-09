import type { GameState as SharedGameState } from '@conquestk/shared'
// TODO: Replace with event-based replay types
// import type { LockstepCommand } from '@conquestk/shared/types/lockstep'
import apiClient from './api'

// Temporary stub for old lockstep command type - TODO: Replace with event-based replay
type LockstepCommand = Record<string, unknown>

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

export type ReplayFrameRecord = {
  matchId: string
  seq: number
  playerId: string
  committedAt: string
  commands: LockstepCommand[]
}

export type ReplayFrameChunk = {
  snapshot?: SharedGameState | null
  frames: ReplayFrameRecord[]
  fromSeq: number
  toSeq: number
  finalSeq: number
  totalFrames: number
  nextSeq: number | null
  hasMore: boolean
}

export async function getReplaySummary(
  gameId: string,
  signal?: AbortSignal,
): Promise<ReplaySummary> {
  const r = await apiClient.get(`/games/${encodeURIComponent(gameId)}/replay/summary`, {
    ...(signal ? { signal } : {}),
  })
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
    ...(signal ? { signal } : {}),
  })
  return r.data as ReplayTurnItem[]
}

export async function getReplayFrameChunkWindow(
  gameId: string,
  params: { fromSeq?: number; limit?: number; includeSnapshot?: boolean } = {},
  signal?: AbortSignal,
): Promise<ReplayFrameChunk> {
  const { fromSeq = 1, limit = 50, includeSnapshot = false } = params
  const response = await apiClient.get(`/games/${encodeURIComponent(gameId)}/replay/frames`, {
    params: {
      fromSeq,
      limit,
      includeSnapshot: includeSnapshot ? 'true' : 'false',
    },
    ...(signal ? { signal } : {}),
  })
  const payload = response.data?.data ?? response.data
  return {
    snapshot: payload?.snapshot ?? null,
    frames: Array.isArray(payload?.frames) ? (payload.frames as ReplayFrameRecord[]) : [],
    fromSeq: Number(payload?.fromSeq ?? fromSeq),
    toSeq: Number(payload?.toSeq ?? fromSeq - 1),
    finalSeq: Number(payload?.finalSeq ?? 0),
    totalFrames: Number(payload?.totalFrames ?? 0),
    nextSeq:
      payload?.nextSeq != null && Number.isFinite(Number(payload.nextSeq))
        ? Number(payload.nextSeq)
        : null,
    hasMore: Boolean(payload?.hasMore),
  }
}
