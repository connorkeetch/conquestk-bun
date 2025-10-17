import type {
  AttackAction,
  GameState,
  Player,
  Territory,
  TransferConquestAction,
} from '../types/index.js'
import type { InputFrame, LockstepCommand } from '../types/lockstep.js'
import { DeterministicRng, deriveStateFromSeed } from '../utils/deterministicRng.js'

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
  rngSeed?: string
  rngState?: {
    a: number
    b: number
    c: number
    d: number
  }
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

const initializeRng = (state: LockstepState): DeterministicRng => {
  const baseSeed = state.rngSeed ?? `${state.roomId ?? 'lockstep'}:seed`
  if (!state.rngSeed) {
    state.rngSeed = baseSeed
  }
  const seedState = state.rngState ?? deriveStateFromSeed(baseSeed).state
  return DeterministicRng.fromState(baseSeed, seedState)
}

const withRng = <T>(state: LockstepState, fn: (rng: DeterministicRng) => T): T => {
  const rng = initializeRng(state)
  const result = fn(rng)
  state.rngSeed = rng.seed
  state.rngState = rng.getState()
  return result
}

const rollDice = (state: LockstepState, count: number): number[] => {
  return withRng(state, (rng) => {
    const dice: number[] = []
    for (let i = 0; i < count; i += 1) {
      dice.push(rng.nextIntInclusive(1, 6))
    }
    return dice
  })
}

const simulateBattle = (
  state: LockstepState,
  attackerDiceCount: number,
  defenderDiceCount: number,
): {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
} => {
  const attackerDice = rollDice(state, attackerDiceCount).sort((a, b) => b - a)
  const defenderDice = rollDice(state, defenderDiceCount).sort((a, b) => b - a)

  let attackerLosses = 0
  let defenderLosses = 0

  if ((attackerDice[0] ?? 0) > (defenderDice[0] ?? 0)) {
    defenderLosses += 1
  } else {
    attackerLosses += 1
  }

  if (attackerDice.length > 1 && defenderDice.length > 1) {
    if ((attackerDice[1] ?? 0) > (defenderDice[1] ?? 0)) {
      defenderLosses += 1
    } else {
      attackerLosses += 1
    }
  }

  return {
    attackerDice,
    defenderDice,
    attackerLosses,
    defenderLosses,
  }
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

const simulateAttack = (
  state: LockstepState,
  playerId: string,
  payload: AttackAction['payload'] | DeployPayload,
): { state: LockstepState; supported: boolean } => {
  if (
    typeof (payload as AttackAction['payload'])?.fromTerritoryId !== 'string' ||
    typeof (payload as AttackAction['payload'])?.toTerritoryId !== 'string'
  ) {
    return { state, supported: false }
  }

  const { fromTerritoryId, toTerritoryId } = payload as AttackAction['payload']
  const working = cloneState(state)

  if (working.phase !== 'attack') {
    return { state, supported: false }
  }

  const fromIndex = working.board.findIndex((t) => t.id === fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const from = { ...working.board[fromIndex] } as Territory
  const to = { ...working.board[toIndex] } as Territory

  if ((from.ownerId ?? playerId) !== playerId || (from.armies ?? 0) <= 1) {
    return { state, supported: false }
  }

  if (working.gameConfig?.useTerritoryModifiers) {
    return { state, supported: false }
  }

  const attackerDiceCount = Math.max(1, Math.min(3, (from.armies ?? 0) - 1))
  const defenderDiceCount = Math.max(1, Math.min(2, to.armies ?? 0))

  const battle = simulateBattle(working, attackerDiceCount, defenderDiceCount)

  from.armies = Math.max(1, (from.armies ?? 0) - battle.attackerLosses)
  to.armies = Math.max(0, (to.armies ?? 0) - battle.defenderLosses)

  const players = ensureArray<Player>(working.players as Player[])
  const attacker = players.find((p) => p.id === playerId)
  const defender = players.find((p) => p.id === to.ownerId)

  let conquered = false
  if (to.armies === 0) {
    if (!attacker || !defender) {
      return { state, supported: false }
    }

    defender.territories = defender.territories.filter((t) => t !== toTerritoryId)
    attacker.territories = [...attacker.territories, toTerritoryId]

    to.ownerId = playerId
    to.armies = 1
    from.armies = Math.max(1, (from.armies ?? 1) - 1)
    working.conqueredDuringTurn = true
    conquered = true

    if (defender.territories.length === 0) {
      return { state, supported: false }
    }
  }

  working.hasAttackedThisTurn = true

  working.board = [...working.board]
  working.board[fromIndex] = from
  working.board[toIndex] = to

  working.players = players as unknown as Player[]

  working.lastBattleResult = {
    attackerDice: battle.attackerDice,
    defenderDice: battle.defenderDice,
    attackerLosses: battle.attackerLosses,
    defenderLosses: battle.defenderLosses,
    conquered,
    fromTerritory: {
      id: from.id,
      name: from.name,
      armies: from.armies ?? 0,
    },
    toTerritory: {
      id: to.id,
      name: to.name,
      armies: to.armies ?? 0,
      ownerId: to.ownerId ?? playerId,
    },
    pendingConquestFor: conquered ? playerId : null,
  } as unknown as GameState['lastBattleResult']

  return { state: working, supported: true }
}

const simulateTransferConquest = (
  state: LockstepState,
  playerId: string,
  payload: TransferConquestAction['payload'] | undefined,
): { state: LockstepState; supported: boolean } => {
  if (
    !payload ||
    typeof payload.fromTerritoryId !== 'string' ||
    typeof payload.toTerritoryId !== 'string' ||
    typeof payload.armies !== 'number'
  ) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const lastBattle = working.lastBattleResult as
    | (GameState['lastBattleResult'] & {
        pendingConquestFor?: string | null
        fromTerritory?: { id: string; armies: number }
        toTerritory?: { id: string; armies: number; ownerId: string }
      })
    | undefined

  if (!lastBattle || lastBattle.pendingConquestFor !== playerId) {
    return { state, supported: false }
  }

  if (
    lastBattle.fromTerritory?.id !== payload.fromTerritoryId ||
    lastBattle.toTerritory?.id !== payload.toTerritoryId
  ) {
    return { state, supported: false }
  }

  const fromIndex = working.board.findIndex((t) => t.id === payload.fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === payload.toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const from = { ...working.board[fromIndex] } as Territory
  const to = { ...working.board[toIndex] } as Territory

  const armies = Math.max(0, Math.trunc(payload.armies))
  if (armies >= (from.armies ?? 0)) {
    return { state, supported: false }
  }

  from.armies = Math.max(0, (from.armies ?? 0) - armies)
  to.armies = Math.max(0, (to.armies ?? 0) + armies)

  working.board = [...working.board]
  working.board[fromIndex] = from
  working.board[toIndex] = to

  working.lastBattleResult = {
    ...lastBattle,
    fromTerritory: {
      id: from.id,
      name: from.name,
      armies: from.armies ?? 0,
    },
    toTerritory: {
      id: to.id,
      name: to.name,
      armies: to.armies ?? 0,
      ownerId: to.ownerId ?? playerId,
    },
    pendingConquestFor: null,
  } as unknown as GameState['lastBattleResult']

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
      case 'attack': {
        const result = simulateAttack(
          working,
          frame.playerId,
          command.payload as AttackAction['payload'],
        )
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
      case 'transfer_conquest': {
        const result = simulateTransferConquest(
          working,
          frame.playerId,
          command.payload as TransferConquestAction['payload'],
        )
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
