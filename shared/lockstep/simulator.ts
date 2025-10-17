import type { GameState } from '@conquestk/shared/types'
import type { InputFrame, LockstepCommand } from '@conquestk/shared/types/lockstep.js'

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
  state: GameState
  unsupported: LockstepCommand['kind'][]
}

const cloneState = (state: GameState): GameState => {
  return structuredClone(state) as GameState
}

const ensureArray = <T>(value: T[] | undefined): T[] => {
  return Array.isArray(value) ? [...value] : []
}

const simulateDeploy = (
  state: GameState,
  playerId: string,
  payload: DeployPayload,
): { state: GameState; supported: boolean } => {
  if (typeof payload?.territoryId !== 'string' || typeof payload?.armies !== 'number') {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const territoryIndex = working.board.findIndex((t) => t.id === payload.territoryId)
  if (territoryIndex === -1) {
    return { state, supported: false }
  }

  const armies = Math.max(0, Math.trunc(payload.armies))
  const territory = { ...working.board[territoryIndex] }
  territory.armies = Math.max(0, (territory.armies ?? 0) + armies)
  territory.ownerId = territory.ownerId ?? playerId
  working.board = [...working.board]
  working.board[territoryIndex] = territory

  const player = working.players.find((p) => p.id === playerId)
  if (player) {
    player.armies = Math.max(0, (player.armies ?? 0) - armies)
  }

  const history = ensureArray(working.reinforcementHistory)
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
  state: GameState,
  playerId: string,
  payload: FortifyPayload,
): { state: GameState; supported: boolean } => {
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
  const from = { ...working.board[fromIndex] }
  const to = { ...working.board[toIndex] }
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

  const history = ensureArray(working.fortifyHistory)
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

const simulateUndoFortify = (state: GameState): { state: GameState; supported: boolean } => {
  const history = ensureArray(state.fortifyHistory)
  if (history.length === 0) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const last = history[history.length - 1]

  const fromIndex = working.board.findIndex((t) => t.id === last.fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === last.toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const from = { ...working.board[fromIndex] }
  const to = { ...working.board[toIndex] }

  from.armies = Math.max(0, (from.armies ?? 0) + last.armies)
  to.armies = Math.max(0, (to.armies ?? 0) - last.armies)

  working.board = [...working.board]
  working.board[fromIndex] = from
  working.board[toIndex] = to
  working.fortifyHistory = history.slice(0, -1)

  return { state: working, supported: true }
}

export const simulateFrame = (state: GameState, frame: InputFrame): SimulationResult => {
  let working = cloneState(state)
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
