import type { GameState, Territory } from '../types/index.js'
import type { InputFrame, LockstepCommand } from '../types/lockstep.js'

type ReinforcementHistoryEntry = {
  playerId: string
  territoryId: string
  armies: number
  ts: number
}

type FortifyHistoryEntry = {
  playerId: string
  fromTerritoryId: string
  toTerritoryId: string
  armies: number
  ts: number
}

export type LockstepState = GameState & {
  reinforcementHistory?: ReinforcementHistoryEntry[]
  fortifyHistory?: FortifyHistoryEntry[]
}

type DeployPayload = {
  territoryId?: unknown
  armies?: unknown
}

type FortifyPayload = {
  fromTerritoryId?: unknown
  toTerritoryId?: unknown
  armies?: unknown
}

interface SimulationResult {
  state: LockstepState
  unsupported: LockstepCommand['kind'][]
}

const cloneState = (state: LockstepState): LockstepState => {
  return structuredClone(state) as LockstepState
}

const ensureArray = <T>(value: T[] | undefined): T[] => {
  return Array.isArray(value) ? [...value] : []
}

const simulateDeploy = (
  state: LockstepState,
  playerId: string,
  payload: DeployPayload,
): { state: LockstepState; supported: boolean } => {
  if (typeof payload?.territoryId !== 'string' || typeof payload?.armies !== 'number') {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const territoryIndex = working.board.findIndex((t) => t.id === payload.territoryId)
  if (territoryIndex === -1) {
    return { state, supported: false }
  }

  const armies = Math.max(0, Math.trunc(payload.armies))
  const territory = { ...working.board[territoryIndex] } as Territory
  territory.armies = Math.max(0, (territory.armies ?? 0) + armies)
  territory.ownerId = territory.ownerId ?? playerId
  working.board = [...working.board]
  working.board[territoryIndex] = territory

  const player = working.players.find((p) => p.id === playerId)
  if (player) {
    player.armies = Math.max(0, (player.armies ?? 0) - armies)
  }

  const history = ensureArray<ReinforcementHistoryEntry>(working.reinforcementHistory)
  history.push({
    playerId,
    territoryId: payload.territoryId,
    armies,
    ts: Date.now(),
  })
  working.reinforcementHistory = history

  return { state: working, supported: true }
}

const simulateFortify = (
  state: LockstepState,
  playerId: string,
  payload: FortifyPayload,
): { state: LockstepState; supported: boolean } => {
  if (
    typeof payload?.fromTerritoryId !== 'string' ||
    typeof payload?.toTerritoryId !== 'string' ||
    typeof payload?.armies !== 'number'
  ) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const fromIndex = working.board.findIndex((t) => t.id === payload.fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === payload.toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const armies = Math.max(0, Math.trunc(payload.armies))
  const from = { ...working.board[fromIndex] } as Territory
  const to = { ...working.board[toIndex] } as Territory
  if ((from.ownerId ?? playerId) !== playerId) {
    return { state, supported: false }
  }

  if ((to.ownerId ?? playerId) !== playerId) {
    return { state, supported: false }
  }

  if ((from.armies ?? 0) <= armies) {
    return { state, supported: false }
  }

  from.armies = Math.max(0, (from.armies ?? 0) - armies)
  to.armies = Math.max(0, (to.armies ?? 0) + armies)

  working.board = [...working.board]
  working.board[fromIndex] = from
  working.board[toIndex] = to

  const history = ensureArray<FortifyHistoryEntry>(working.fortifyHistory)
  history.push({
    playerId,
    fromTerritoryId: payload.fromTerritoryId,
    toTerritoryId: payload.toTerritoryId,
    armies,
    ts: Date.now(),
  })
  working.fortifyHistory = history

  return { state: working, supported: true }
}

const simulateUndoFortify = (
  state: LockstepState,
): { state: LockstepState; supported: boolean } => {
  const history = ensureArray<FortifyHistoryEntry>(state.fortifyHistory)
  if (history.length === 0) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const last = history[history.length - 1]
  if (!last) {
    return { state, supported: false }
  }

  const fromIndex = working.board.findIndex((t) => t.id === last.fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === last.toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const from = { ...working.board[fromIndex] } as Territory
  const to = { ...working.board[toIndex] } as Territory

  from.armies = Math.max(0, (from.armies ?? 0) + last.armies)
  to.armies = Math.max(0, (to.armies ?? 0) - last.armies)

  working.board = [...working.board]
  working.board[fromIndex] = from
  working.board[toIndex] = to
  working.fortifyHistory = history.slice(0, -1)

  return { state: working, supported: true }
}

export const simulateFrame = (state: GameState, frame: InputFrame): SimulationResult => {
  let working = cloneState(state as LockstepState)
  const unsupported: LockstepCommand['kind'][] = []

  for (const command of frame.commands) {
    switch (command.kind) {
      case 'deploy': {
        const result = simulateDeploy(working, frame.playerId, command.payload as DeployPayload)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'fortify': {
        const result = simulateFortify(working, frame.playerId, command.payload as FortifyPayload)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'undo_fortify': {
        const result = simulateUndoFortify(working)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      default: {
        unsupported.push(command.kind)
        break
      }
    }
  }

  return {
    state: working,
    unsupported,
  }
}
