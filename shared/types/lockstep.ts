/**
 * Shared types for deterministic lockstep transport between client and server.
 */

export type LockstepCommandKind =
  | 'deploy'
  | 'attack'
  | 'fortify'
  | 'transfer_conquest'
  | 'undo_fortify'
  | 'end_turn'
  | 'trade_cards'
  | 'go_back_to_reinforcement'
  | 'resign'

export interface LockstepCommand<TPayload = Record<string, unknown>> {
  kind: LockstepCommandKind
  payload: TPayload
}

export interface InputFrame {
  matchId: string
  seq: number
  playerId: string
  commands: LockstepCommand[]
  committedAt: string
}

export interface TickChecksum {
  matchId: string
  seq: number
  crc32: number
  computedAt: string
}

export interface LockstepSnapshotPayload {
  matchId: string
  seq: number
  state: Record<string, unknown>
  frames: InputFrame[]
}
