import type {
  AttackAction,
  BattleResult,
  EndTurnAction,
  GameConfiguration,
  GamePhase,
  GameState,
  GameTerritoryModifier,
  GoBackToAttackAction,
  GoBackToReinforcementAction,
  Metal,
  Player,
  Territory,
  TradeCardsAction,
  TransferConquestAction,
  TreasureConfig,
  TreasureState,
} from '../types/index.js'
import type { InputFrame, LockstepCommand } from '../types/lockstep.js'
import { DeterministicRng, deriveStateFromSeed } from '../utils/deterministicRng.js'
import { applyCapitalCapture, isCapitalTerritory } from './capitals.js'

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
  reinforcementBaseline?: Record<string, number>
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

type TreasureSetPattern = 'three_of_a_kind' | 'one_of_each' | 'diamond_combo'

type TreasureSetMatch = {
  indices: [number, number, number]
  metals: [Metal, Metal, Metal]
  pattern: TreasureSetPattern
  hasDiamond: boolean
}

type TreasureRedeemResult = {
  troops: number
  updatedHand: Metal[]
  updatedState: TreasureState
  hasDiamond: boolean
  pattern: TreasureSetPattern
}

// Battle and dice constants
const MIN_DICE_VALUE = 1
const MAX_DICE_VALUE = 6
const MAX_ATTACKER_DICE = 3
const MAX_DEFENDER_DICE = 2
const MIN_ARMIES_TO_ATTACK = 1 // Attacker must leave 1 army behind

// Treasure constants
const CLASSIC_TREASURE_SEQUENCE = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]

const DEFAULT_TREASURE_CONFIG: Required<TreasureConfig> = {
  enabled: true,
  diamondsPercent: 0.08,
  payoutMode: 'classic',
  fixedValue: 8,
  handCap: 5,
  diamondSetBonus: 3,
}

// Reinforcement constants
const MIN_REINFORCEMENTS = 3
const TERRITORIES_PER_REINFORCEMENT = 3 // 1 army per 3 territories

const clampDiamondsPercent = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_TREASURE_CONFIG.diamondsPercent
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

const normalizeTreasureConfig = (config?: Partial<TreasureConfig>): TreasureConfig => {
  const merged: TreasureConfig = {
    ...DEFAULT_TREASURE_CONFIG,
    ...(config ?? {}),
  }

  merged.diamondsPercent = clampDiamondsPercent(
    typeof merged.diamondsPercent === 'number'
      ? merged.diamondsPercent
      : DEFAULT_TREASURE_CONFIG.diamondsPercent,
  )

  if (merged.payoutMode === 'fixed') {
    if (typeof merged.fixedValue !== 'number' || Number.isNaN(merged.fixedValue)) {
      merged.fixedValue = DEFAULT_TREASURE_CONFIG.fixedValue
    } else {
      merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)))
    }
  } else if (typeof merged.fixedValue === 'number') {
    merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)))
  }

  merged.handCap = Math.max(1, Math.trunc(merged.handCap))
  merged.diamondSetBonus = Math.max(0, Math.trunc(merged.diamondSetBonus))

  return merged
}

const ensureTreasureConfig = (state: LockstepState): TreasureConfig => {
  const normalized = normalizeTreasureConfig(state.gameConfig?.treasureConfig)
  state.gameConfig = {
    ...(state.gameConfig as GameConfiguration),
    treasureConfig: normalized,
  }
  return normalized
}

const ensureTreasureState = (state?: TreasureState): TreasureState => {
  if (!state) {
    return {
      totalSetsCashed: 0,
      nextPayoutIndex: 0,
    }
  }
  return state
}

const drawTreasure = (config: TreasureConfig, rng: DeterministicRng): Metal => {
  const roll = rng.next()
  if (roll < config.diamondsPercent) {
    return 'diamond'
  }

  const remaining = 1 - config.diamondsPercent
  const slice = remaining / 3
  const firstThreshold = config.diamondsPercent + slice
  const secondThreshold = config.diamondsPercent + slice * 2

  if (roll < firstThreshold) {
    return 'bronze'
  }

  if (roll < secondThreshold) {
    return 'silver'
  }

  return 'gold'
}

const computeTriangularPayout = (index: number): number => {
  if (index <= 0) {
    return 4
  }
  let payout = 4
  let delta = 2
  for (let i = 1; i <= index; i += 1) {
    payout += delta
    delta += 1
  }
  return payout
}

const getPayout = (
  state: TreasureState,
  config: TreasureConfig,
): { amount: number; state: TreasureState } => {
  const nextIndex = state.nextPayoutIndex
  let amount = 0

  switch (config.payoutMode) {
    case 'classic': {
      if (nextIndex < CLASSIC_TREASURE_SEQUENCE.length) {
        const classicValue = CLASSIC_TREASURE_SEQUENCE[nextIndex]
        if (classicValue !== undefined) {
          amount = classicValue
        }
      } else {
        const overflowIndex = nextIndex - CLASSIC_TREASURE_SEQUENCE.length + 1
        const lastClassic = CLASSIC_TREASURE_SEQUENCE[CLASSIC_TREASURE_SEQUENCE.length - 1] ?? 0
        amount = lastClassic + overflowIndex * 5
      }
      break
    }
    case 'fixed': {
      amount = config.fixedValue ?? DEFAULT_TREASURE_CONFIG.fixedValue
      break
    }
    case 'none': {
      amount = 0
      break
    }
    default: {
      amount = computeTriangularPayout(nextIndex)
      break
    }
  }

  const updatedState: TreasureState = {
    totalSetsCashed: state.totalSetsCashed + 1,
    nextPayoutIndex: nextIndex + 1,
  }

  return { amount, state: updatedState }
}

const classifyTreasureSet = (metals: [Metal, Metal, Metal]): TreasureSetPattern | null => {
  const [a, b, c] = metals
  const diamondCount = metals.filter((metal) => metal === 'diamond').length
  if (diamondCount > 0) {
    return 'diamond_combo'
  }
  if (a === b && b === c && (a === 'bronze' || a === 'silver' || a === 'gold')) {
    return 'three_of_a_kind'
  }
  const sorted = [...metals].sort()
  if (sorted[0] === 'bronze' && sorted[1] === 'gold' && sorted[2] === 'silver') {
    return 'one_of_each'
  }
  return null
}

const findRedeemableSets = (hand: Metal[]): TreasureSetMatch[] => {
  const matches: TreasureSetMatch[] = []
  for (let i = 0; i < hand.length - 2; i += 1) {
    for (let j = i + 1; j < hand.length - 1; j += 1) {
      for (let k = j + 1; k < hand.length; k += 1) {
        const first = hand[i]
        const second = hand[j]
        const third = hand[k]
        if (!first || !second || !third) {
          continue
        }
        const metals: [Metal, Metal, Metal] = [first, second, third]
        const pattern = classifyTreasureSet(metals)
        if (!pattern) continue
        matches.push({
          indices: [i, j, k],
          metals,
          pattern,
          hasDiamond: metals.includes('diamond'),
        })
      }
    }
  }
  return matches
}

const redeemSet = (
  hand: Metal[],
  indices: [number, number, number],
  config: TreasureConfig,
  state: TreasureState,
): TreasureRedeemResult => {
  const sorted = [...indices].sort((a, b) => a - b) as [number, number, number]
  if (new Set(sorted).size !== 3) {
    throw new Error('Treasure indices must be unique')
  }
  if (sorted.some((index) => index < 0 || index >= hand.length)) {
    throw new Error('Treasure index out of bounds')
  }

  const first = hand[sorted[0]]
  const second = hand[sorted[1]]
  const third = hand[sorted[2]]
  if (!first || !second || !third) {
    throw new Error('Invalid treasure indices')
  }
  const metals: [Metal, Metal, Metal] = [first, second, third]
  const pattern = classifyTreasureSet(metals)
  if (!pattern) {
    throw new Error('Invalid treasure set')
  }

  const { amount, state: updatedState } = getPayout(state, config)
  const hasDiamond = metals.includes('diamond')
  const bonus = hasDiamond ? (config.diamondSetBonus ?? 0) : 0

  const updatedHand = hand.filter((_, idx) => !sorted.includes(idx))

  return {
    troops: amount + bonus,
    updatedHand,
    updatedState,
    hasDiamond,
    pattern,
  }
}

const getPlayerTreasureHand = (player: Player): Metal[] => {
  if (!Array.isArray(player.treasures)) {
    player.treasures = []
  }
  return player.treasures
}

const updateCurrentPlayerCashRequirement = (
  state: LockstepState,
  treasureConfig: TreasureConfig,
): void => {
  if (!treasureConfig.enabled) {
    state.mustCashInTreasures = false
    return
  }
  const player = (state.players as Player[]).find((p) => p.id === state.currentPlayer)
  if (!player) {
    state.mustCashInTreasures = false
    return
  }

  const hand = getPlayerTreasureHand(player)
  const hasValidSet = findRedeemableSets(hand).length > 0
  player.mustCashInTreasures =
    hand.length >= treasureConfig.handCap && hasValidSet
      ? true
      : (player.mustCashInTreasures ?? false)
  state.mustCashInTreasures = player.mustCashInTreasures ?? false
}

const maybeAwardTreasureForConquest = (
  state: LockstepState,
  player: Player,
  treasureConfig: TreasureConfig,
) => {
  if (!treasureConfig.enabled || !state.conqueredDuringTurn) {
    return
  }
  const treasureState = ensureTreasureState(state.treasureState)
  const treasure = withRng(state, (rng) => drawTreasure(treasureConfig, rng))
  const hand = getPlayerTreasureHand(player)
  hand.push(treasure)
  state.treasureState = treasureState
  if (hand.length >= treasureConfig.handCap) {
    player.mustCashInTreasures = findRedeemableSets(hand).length > 0
  }
}

const transferEliminatedTreasures = (
  state: LockstepState,
  eliminatorId: string,
  treasureConfig: TreasureConfig,
  eliminatedPlayers: string[],
) => {
  if (!treasureConfig.enabled || eliminatedPlayers.length === 0) {
    return
  }
  const eliminator = (state.players as Player[]).find((p) => p.id === eliminatorId)
  if (!eliminator) {
    return
  }
  const eliminatorHand = getPlayerTreasureHand(eliminator)
  let transferred = 0

  for (const eliminatedId of eliminatedPlayers) {
    const eliminated = (state.players as Player[]).find((p) => p.id === eliminatedId)
    if (!eliminated || !Array.isArray(eliminated.treasures) || eliminated.treasures.length === 0) {
      continue
    }
    eliminatorHand.push(...eliminated.treasures)
    transferred += eliminated.treasures.length
    eliminated.treasures = []
    eliminated.mustCashInTreasures = false
  }

  if (transferred > 0 && eliminatorHand.length >= treasureConfig.handCap) {
    const hasValidSet = findRedeemableSets(eliminatorHand).length > 0
    // Preserve existing mustCashInTreasures flag - use logical OR to never clear it
    eliminator.mustCashInTreasures = hasValidSet || (eliminator.mustCashInTreasures ?? false)
    if ((hasValidSet || eliminator.mustCashInTreasures) && eliminator.id === state.currentPlayer) {
      state.mustCashInTreasures = true
    }
  }
}

const getPlayerTeam = (state: LockstepState, playerId?: string | null): number | null => {
  if (!playerId) return null
  const player = (state.players as Player[]).find((p) => p.id === playerId)
  if (!player) return null
  const { teamId } = player
  return typeof teamId === 'number' && Number.isFinite(teamId) && teamId > 0
    ? Math.trunc(teamId)
    : null
}

const arePlayersTeammates = (
  state: LockstepState,
  playerA: string,
  playerB?: string | null,
): boolean => {
  if (!state.gameConfig?.allowTeamPlay) return false
  if (!playerB || playerB === 'neutral') return false
  const teamA = getPlayerTeam(state, playerA)
  const teamB = getPlayerTeam(state, playerB)
  if (!teamA || !teamB) return false
  return teamA === teamB
}

const isFriendlyTerritory = (
  state: LockstepState,
  playerId: string,
  ownerId?: string | null,
): boolean => {
  if (!ownerId) return false
  if (ownerId === playerId) return true
  if (ownerId === 'neutral') return false
  return arePlayersTeammates(state, playerId, ownerId)
}

const getTerritoryModifier = (
  state: LockstepState,
  territoryId?: string | null,
): GameTerritoryModifier | null => {
  if (!territoryId) return null
  const modifiers = state.territoryModifiers
  if (!modifiers) return null
  if (modifiers instanceof Map) {
    return modifiers.get(territoryId) ?? null
  }
  const entry = (modifiers as Record<string, GameTerritoryModifier | undefined>)[territoryId]
  return entry ?? null
}

const calculateSectorBonuses = (
  playerTerritories: string[],
  allTerritories: Territory[],
  gameConfig?: GameConfiguration,
): number => {
  let bonusArmies = 0
  const configuredBonuses = gameConfig?.sectorBonuses
  if (Array.isArray(configuredBonuses) && configuredBonuses.length > 0) {
    for (const sector of configuredBonuses) {
      if (!sector || typeof sector !== 'object') continue
      const territories = Array.isArray(sector.territories) ? sector.territories : []
      if (territories.length === 0) continue
      const ownsAll = territories.every((territoryId) => playerTerritories.includes(territoryId))
      if (ownsAll) {
        bonusArmies += sector.bonusArmies ?? 0
      }
    }
  } else {
    const classicSectorBonuses: Record<string, number> = {
      'north-america': 5,
      'south-america': 2,
      europe: 5,
      asia: 7,
      africa: 3,
      australia: 2,
    }
    const sectors: Record<string, string[]> = {}
    for (const territory of allTerritories) {
      if (!territory.sector) continue
      if (!sectors[territory.sector]) {
        sectors[territory.sector] = []
      }
      sectors[territory.sector]?.push(territory.id)
    }
    for (const [sectorId, territories] of Object.entries(sectors)) {
      if (territories.every((territoryId) => playerTerritories.includes(territoryId))) {
        bonusArmies += classicSectorBonuses[sectorId] ?? 0
      }
    }
  }
  return bonusArmies
}

const calculateReinforcementArmies = (
  playerTerritories: string[],
  allTerritories: Territory[],
  gameConfig?: GameConfiguration,
): number => {
  const territoryCount = playerTerritories.length
  let armies = Math.max(
    MIN_REINFORCEMENTS,
    Math.floor(territoryCount / TERRITORIES_PER_REINFORCEMENT),
  )
  armies += calculateSectorBonuses(playerTerritories, allTerritories, gameConfig)
  return armies
}

const refreshReinforcementTracking = (state: LockstepState): void => {
  try {
    const baseline: Record<string, number> = {}
    for (const territory of state.board) {
      if (territory.ownerId === state.currentPlayer) {
        baseline[territory.id] = Math.max(0, Math.trunc(territory.armies ?? 0))
      }
    }
    state.reinforcementBaseline = baseline
  } catch {
    state.reinforcementBaseline = {}
  }
  state.reinforcementHistory = []
}

const prepareReinforcementPhase = (state: LockstepState, treasureConfig: TreasureConfig): void => {
  const currentPlayer = (state.players as Player[]).find((p) => p.id === state.currentPlayer)
  if (currentPlayer) {
    currentPlayer.armies = calculateReinforcementArmies(
      currentPlayer.territories,
      state.board,
      state.gameConfig,
    )
  }
  refreshReinforcementTracking(state)
  state.resumePhaseAfterReinforcement = null
  delete state.resumeHasAttackedAfterReinforcement
  if (treasureConfig.enabled) {
    state.treasureState = ensureTreasureState(state.treasureState)
    if (currentPlayer) {
      getPlayerTreasureHand(currentPlayer)
    }
  } else {
    delete state.treasureState
  }
  updateCurrentPlayerCashRequirement(state, treasureConfig)
  state.conqueredDuringTurn = false
}

const resetMovementTracking = (state: LockstepState): void => {
  state.movementTracking = {}
}

const markTerritoryAsMoved = (state: LockstepState, territoryId: string): void => {
  if (!state.movementTracking) {
    state.movementTracking = {}
  }
  state.movementTracking[territoryId] = true
}

const shuffleArray = <T>(items: T[], rng: DeterministicRng): void => {
  rng.shuffleInPlace(items)
}

const ensureHillNeutralDefenders = (state: LockstepState, territoryId: string): void => {
  const koth = state.kingOfTheHillState
  if (!koth) return
  const territory = state.board.find((t) => t.id === territoryId)
  if (!territory) return
  if (!territory.ownerId || territory.ownerId === 'neutral') {
    territory.ownerId = 'neutral'
    if (typeof territory.armies !== 'number' || territory.armies < (koth.neutralArmies ?? 0)) {
      territory.armies = koth.neutralArmies ?? territory.armies ?? 0
    }
  }
}

const refillHillRotationQueue = (state: LockstepState): string[] => {
  const koth = state.kingOfTheHillState
  if (!koth) return []
  const eligible =
    koth.eligibleTerritoryIds && koth.eligibleTerritoryIds.length > 0
      ? koth.eligibleTerritoryIds
      : state.board.map((territory) => territory.id)
  const pool: string[] = []
  const seen = new Set<string>()
  for (const id of eligible) {
    if (id === koth.currentHillTerritoryId || seen.has(id)) continue
    seen.add(id)
    pool.push(id)
  }
  return withRng(state, (rng) => {
    shuffleArray(pool, rng)
    return pool
  })
}

const isKingOfTheHillVictory = (state: LockstepState, player: Player): boolean => {
  const koth = state.kingOfTheHillState
  if (!koth) return false
  const target = Math.max(1, koth.targetPoints ?? 0)
  const points = koth.points?.[player.id] ?? 0
  if (points >= target) {
    return true
  }
  if (!state.gameConfig.allowTeamPlay) {
    return false
  }
  const teamId = getPlayerTeam(state, player.id)
  if (!teamId) {
    return false
  }
  const teammatePoints = Object.entries(koth.points ?? {}).reduce((total, [playerId, value]) => {
    if (getPlayerTeam(state, playerId) === teamId) {
      return total + value
    }
    return total
  }, 0)
  return teammatePoints >= target
}

const progressKingOfTheHillRotation = (state: LockstepState): void => {
  const koth = state.kingOfTheHillState
  if (!koth || !koth.rotationInterval || koth.rotationInterval <= 0) return
  if (typeof koth.lastRotationTurn === 'number' && koth.lastRotationTurn === state.turn) {
    return
  }
  const remaining =
    typeof koth.turnsUntilRotation === 'number'
      ? koth.turnsUntilRotation - 1
      : koth.rotationInterval - 1
  if (remaining <= 0) {
    rotateKingOfTheHill(state)
  } else {
    koth.turnsUntilRotation = remaining
    if (Array.isArray(koth.rotationQueue) && koth.rotationQueue.length > 0) {
      koth.upcomingHillTerritoryId = koth.rotationQueue[0] ?? null
    }
  }
}

const rotateKingOfTheHill = (state: LockstepState): void => {
  const koth = state.kingOfTheHillState
  if (!koth || !koth.rotationInterval || koth.rotationInterval <= 0) return
  const queue = Array.isArray(koth.rotationQueue) ? [...koth.rotationQueue] : []
  if (queue.length === 0) {
    queue.push(...refillHillRotationQueue(state))
  }
  if (queue.length === 0) {
    koth.turnsUntilRotation = koth.rotationInterval
    koth.upcomingHillTerritoryId = null
    return
  }
  const nextHill = queue.shift()
  if (!nextHill) {
    koth.turnsUntilRotation = koth.rotationInterval
    koth.upcomingHillTerritoryId = null
    return
  }
  koth.currentHillTerritoryId = nextHill
  koth.rotationQueue = queue
  ensureHillNeutralDefenders(state, nextHill)
  if (!koth.rotationQueue || koth.rotationQueue.length === 0) {
    koth.rotationQueue = refillHillRotationQueue(state)
  }
  koth.turnsUntilRotation = koth.rotationInterval
  koth.upcomingHillTerritoryId =
    koth.rotationQueue && koth.rotationQueue.length > 0 ? (koth.rotationQueue[0] ?? null) : null
  koth.lastRotationTurn = state.turn
}

const handleKingOfTheHillRoundComplete = (state: LockstepState): void => {
  const koth = state.kingOfTheHillState
  if (!koth) return
  if (koth.lastScoreTurn === state.turn) {
    return
  }
  koth.lastScoreTurn = state.turn
  const hill = state.board.find((territory) => territory.id === koth.currentHillTerritoryId)
  if (hill) {
    const ownerId = hill.ownerId
    if (ownerId && ownerId !== 'neutral') {
      const owner = (state.players as Player[]).find((player) => player.id === ownerId)
      if (owner && !owner.isEliminated) {
        koth.points[owner.id] = (koth.points[owner.id] ?? 0) + 1
        if (isKingOfTheHillVictory(state, owner)) {
          endGame(state, owner)
          return
        }
      }
    }
  }
  if (state.phase !== 'finished') {
    progressKingOfTheHillRotation(state)
  }
}

const updateEliminatedPlayers = (state: LockstepState): string[] => {
  const eliminated: string[] = []
  for (const player of state.players as Player[]) {
    if (!player.isEliminated) {
      const hasTerritory = state.board.some((territory) => territory.ownerId === player.id)
      if (!hasTerritory) {
        player.isEliminated = true
        eliminated.push(player.id)
      }
    }
  }
  return eliminated
}

const resolveAssassinationVictory = (
  state: LockstepState,
  eliminatedPlayers: string[],
): Player | null => {
  if (!state.assassinationTargets || eliminatedPlayers.length === 0) {
    return null
  }
  for (const eliminatedId of eliminatedPlayers) {
    for (const [hunterId, targetId] of Object.entries(state.assassinationTargets)) {
      if (targetId !== eliminatedId) continue
      const hunter = (state.players as Player[]).find((player) => player.id === hunterId)
      if (hunter && !hunter.isEliminated) {
        return hunter
      }
    }
  }
  return null
}

const endGame = (state: LockstepState, winner: Player | null): void => {
  state.phase = 'finished'
  if (winner) {
    state.currentPlayer = winner.id
  }
}

const checkGameEnd = (
  state: LockstepState,
): { gameEnded: boolean; winner: Player | null; eliminatedPlayers: string[] } => {
  const eliminatedPlayers = updateEliminatedPlayers(state)
  if (state.gameConfig.gameMode === 'assassination') {
    const winner = resolveAssassinationVictory(state, eliminatedPlayers)
    if (winner) {
      endGame(state, winner)
      return { gameEnded: true, winner, eliminatedPlayers }
    }
  }
  const activePlayers = (state.players as Player[]).filter((player) => !player.isEliminated)
  if (activePlayers.length <= 1) {
    const winner = activePlayers[0] ?? null
    endGame(state, winner)
    return { gameEnded: true, winner, eliminatedPlayers }
  }
  if (state.gameConfig.allowTeamPlay) {
    const distinct = new Set<string>()
    for (const player of activePlayers) {
      const teamId = getPlayerTeam(state, player.id)
      if (teamId) {
        distinct.add(`team:${teamId}`)
      } else {
        distinct.add(`player:${player.id}`)
      }
    }
    if (distinct.size <= 1) {
      const winner = activePlayers[0] ?? null
      endGame(state, winner)
      return { gameEnded: true, winner, eliminatedPlayers }
    }
  }
  return { gameEnded: false, winner: null, eliminatedPlayers }
}

const cloneState = (state: LockstepState): LockstepState => {
  return structuredClone(state) as LockstepState
}

const ensureArray = <T>(value: T[] | undefined): T[] => {
  return Array.isArray(value) ? [...value] : []
}

const initializeRng = (state: LockstepState): DeterministicRng => {
  const baseSeed = state.rngSeed ?? `${state.roomId ?? 'lockstep'}`
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
      dice.push(rng.nextIntInclusive(MIN_DICE_VALUE, MAX_DICE_VALUE))
    }
    return dice
  })
}

const simulateBattle = (
  state: LockstepState,
  attackerDiceCount: number,
  defenderDiceCount: number,
  attackBonus = 0,
  defenseBonus = 0,
): {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
} => {
  let attackerDice = rollDice(state, attackerDiceCount).sort((a, b) => b - a)
  let defenderDice = rollDice(state, defenderDiceCount).sort((a, b) => b - a)

  if (attackBonus !== 0) {
    attackerDice = attackerDice
      .map((die) => Math.max(MIN_DICE_VALUE, Math.min(MAX_DICE_VALUE, die + attackBonus)))
      .sort((a, b) => b - a)
  }

  if (defenseBonus !== 0) {
    defenderDice = defenderDice
      .map((die) => Math.max(MIN_DICE_VALUE, Math.min(MAX_DICE_VALUE, die + defenseBonus)))
      .sort((a, b) => b - a)
  }

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

  const territory = { ...working.board[territoryIndex] } as Territory
  const player = (working.players as Player[]).find((p) => p.id === playerId)
  if (!player) {
    return { state, supported: false }
  }

  if (!isFriendlyTerritory(working, playerId, territory.ownerId)) {
    return { state, supported: false }
  }

  const armies = Math.trunc(payload.armies)
  if (!Number.isFinite(armies) || armies === 0) {
    return { state, supported: false }
  }

  const history = ensureArray<ReinforcementHistoryEntry>(working.reinforcementHistory)

  if (armies < 0) {
    const baseline = working.reinforcementBaseline?.[payload.territoryId]
    if (typeof baseline !== 'number') {
      return { state, supported: false }
    }
    const allowedUndo = Math.max(0, (territory.armies ?? 0) - baseline)
    const requested = Math.abs(armies)
    if (requested <= 0 || allowedUndo <= 0) {
      return { state, supported: false }
    }
    const actual = Math.min(allowedUndo, requested)
    if (actual <= 0) {
      return { state, supported: false }
    }
    territory.armies = Math.max(baseline, (territory.armies ?? 0) - actual)
    player.armies = Math.max(0, (player.armies ?? 0) + actual)

    history.push({
      playerId,
      territoryId: payload.territoryId,
      armies: -actual,
      ts: Date.now(),
    })
  } else {
    territory.ownerId = territory.ownerId ?? playerId
    territory.armies = Math.max(0, (territory.armies ?? 0) + armies)
    player.armies = Math.max(0, (player.armies ?? 0) - armies)

    history.push({
      playerId,
      territoryId: payload.territoryId,
      armies,
      ts: Date.now(),
    })

    if (player.armies <= 0 && working.phase === 'reinforcement') {
      const resumePhase = working.resumePhaseAfterReinforcement
      if (resumePhase && resumePhase !== 'reinforcement') {
        working.phase = resumePhase
        if (resumePhase === 'attack') {
          working.hasAttackedThisTurn =
            working.resumeHasAttackedAfterReinforcement ?? working.hasAttackedThisTurn ?? false
        }
      } else {
        working.phase = 'attack'
        working.hasAttackedThisTurn = false
      }
      working.resumePhaseAfterReinforcement = null
      delete working.resumeHasAttackedAfterReinforcement
    }
  }

  working.board = [...working.board]
  working.board[territoryIndex] = territory
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
  if (working.phase !== 'fortify') {
    return { state, supported: false }
  }
  const fromIndex = working.board.findIndex((t) => t.id === payload.fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === payload.toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  const armies = Math.trunc(payload.armies)
  if (!Number.isFinite(armies) || armies <= 0) {
    return { state, supported: false }
  }
  const from = { ...working.board[fromIndex] } as Territory
  const to = { ...working.board[toIndex] } as Territory
  if (!isFriendlyTerritory(working, playerId, from.ownerId)) {
    return { state, supported: false }
  }

  if (!isFriendlyTerritory(working, playerId, to.ownerId)) {
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

  markTerritoryAsMoved(working, from.id)

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
  if (working.movementTracking?.[last.fromTerritoryId]) {
    delete working.movementTracking[last.fromTerritoryId]
  }

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
  delete working.capitalElimination

  // Block attacks when there's a pending conquest transfer
  if (working.lastBattleResult?.pendingConquestFor) {
    return { state, supported: false }
  }

  if (working.phase !== 'attack') {
    return { state, supported: false }
  }

  const fromIndex = working.board.findIndex((t) => t.id === fromTerritoryId)
  const toIndex = working.board.findIndex((t) => t.id === toTerritoryId)
  if (fromIndex === -1 || toIndex === -1) {
    return { state, supported: false }
  }

  let from = { ...working.board[fromIndex] } as Territory
  let to = { ...working.board[toIndex] } as Territory
  const attackerInitialArmies = from.armies ?? 0
  const defenderInitialArmies = to.armies ?? 0
  const originalDefenderId = (typeof to.ownerId === 'string' ? to.ownerId : null) ?? null

  if ((from.ownerId ?? playerId) !== playerId || (from.armies ?? 0) <= 1) {
    return { state, supported: false }
  }

  if (isFriendlyTerritory(working, playerId, to.ownerId)) {
    return { state, supported: false }
  }

  const treasureConfig = ensureTreasureConfig(working)
  working.hasAttackedThisTurn = true

  let attackBonus = 0
  let defenseBonus = 0
  if (working.gameConfig?.useTerritoryModifiers) {
    const attackerModifier = getTerritoryModifier(working, from.id)
    const defenderModifier = getTerritoryModifier(working, to.id)
    attackBonus = attackerModifier?.attack_bonus ?? 0
    defenseBonus = defenderModifier?.defense_bonus ?? 0
  }

  const attackerDiceCount = Math.max(
    MIN_DICE_VALUE,
    Math.min(MAX_ATTACKER_DICE, (from.armies ?? 0) - MIN_ARMIES_TO_ATTACK),
  )
  const defenderDiceCount = Math.max(MIN_DICE_VALUE, Math.min(MAX_DEFENDER_DICE, to.armies ?? 0))

  const battle = simulateBattle(
    working,
    attackerDiceCount,
    defenderDiceCount,
    attackBonus,
    defenseBonus,
  )

  from.armies = Math.max(1, (from.armies ?? 0) - battle.attackerLosses)
  to.armies = Math.max(0, (to.armies ?? 0) - battle.defenderLosses)

  const players = working.players as Player[]
  const attacker = players.find((p) => p.id === playerId)
  const defender = players.find((p) => p.id === to.ownerId)
  const defenderId = defender?.id ?? null
  const targetedCapital = defenderId ? isCapitalTerritory(working, defenderId, to.id) : false

  let conquered = false
  let capitalSummary: LockstepState['capitalElimination'] | null = null
  if (to.armies === 0) {
    if (!attacker || !defender || !defenderId) {
      return { state, supported: false }
    }

    // Capture baseline board BEFORE any modifications for capital elimination tracking
    const baselineBoard = targetedCapital
      ? working.board.map((territory) => ({ ...territory }))
      : undefined

    defender.territories = defender.territories.filter((t) => t !== toTerritoryId)
    attacker.territories = [...attacker.territories, toTerritoryId]

    to.ownerId = playerId
    to.armies = 1
    from.armies = Math.max(1, (from.armies ?? 1) - 1)
    working.conqueredDuringTurn = true
    conquered = true

    working.board = working.board.map((territory) => {
      if (territory.id === from.id) return { ...from }
      if (territory.id === to.id) return { ...to }
      return territory
    })

    if (targetedCapital && baselineBoard) {
      const capture = applyCapitalCapture(working, playerId, defenderId, to.id, { baselineBoard })
      const refreshedBoard = working.board as Territory[]
      const refreshedFrom = refreshedBoard.find((territory) => territory.id === from.id)
      const refreshedTo = refreshedBoard.find((territory) => territory.id === to.id)
      if (refreshedFrom) {
        from = { ...refreshedFrom }
      }
      if (refreshedTo) {
        to = { ...refreshedTo }
      }
      capitalSummary = {
        conqueror: playerId,
        eliminated: defenderId,
        capitalTerritory: capture.capitalTerritoryId,
        territoriesGained: capture.transferred.length,
        troopsGained: capture.troopsGained,
      }
    }

    const gameEndCheck = checkGameEnd(working)
    transferEliminatedTreasures(working, playerId, treasureConfig, gameEndCheck.eliminatedPlayers)
    updateCurrentPlayerCashRequirement(working, treasureConfig)

    const battleResultPayload = {
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
      gameEnded: gameEndCheck.gameEnded,
      winner: gameEndCheck.winner ?? null,
      eliminatedPlayers: gameEndCheck.eliminatedPlayers,
      attackerPlayerId: playerId,
      defenderPlayerId: originalDefenderId,
      initialFromArmies: attackerInitialArmies,
      initialToArmies: defenderInitialArmies,
    } as unknown as BattleResult

    if (capitalSummary) {
      ;(battleResultPayload as BattleResult).capitalElimination = capitalSummary
      working.capitalElimination = capitalSummary
    }

    working.lastBattleResult = battleResultPayload

    return { state: working, supported: true }
  }

  working.hasAttackedThisTurn = true

  const gameEndCheck = checkGameEnd(working)

  working.board = working.board.map((territory) => {
    if (territory.id === from.id) return { ...from }
    if (territory.id === to.id) return { ...to }
    return territory
  })

  const battleResultPayload = {
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
    gameEnded: gameEndCheck.gameEnded,
    winner: gameEndCheck.winner ?? null,
    eliminatedPlayers: gameEndCheck.eliminatedPlayers,
    attackerPlayerId: playerId,
    defenderPlayerId: originalDefenderId,
    initialFromArmies: attackerInitialArmies,
    initialToArmies: defenderInitialArmies,
  } as unknown as BattleResult

  // No capital elimination in non-conquest case (already deleted at start)
  working.lastBattleResult = battleResultPayload

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
  } as unknown as BattleResult

  return { state: working, supported: true }
}

const simulateTradeCards = (
  state: LockstepState,
  playerId: string,
  payload: TradeCardsAction['payload'] | undefined,
): { state: LockstepState; supported: boolean } => {
  const working = cloneState(state)
  const treasureConfig = ensureTreasureConfig(working)
  if (!treasureConfig.enabled) {
    return { state, supported: false }
  }
  const player = (working.players as Player[]).find((p) => p.id === playerId)
  if (!player) {
    return { state, supported: false }
  }

  const previousPhase = working.phase
  const selection = payload?.treasureSet
  if (!Array.isArray(selection) || selection.length !== 3) {
    return { state, supported: false }
  }

  const indices = selection.map((value) => Number(value))
  if (indices.some((value) => Number.isNaN(value))) {
    return { state, supported: false }
  }

  const treasureState = ensureTreasureState(working.treasureState)
  const hand = getPlayerTreasureHand(player)
  let redeemResult: TreasureRedeemResult
  try {
    redeemResult = redeemSet(
      hand,
      [indices[0], indices[1], indices[2]] as [number, number, number],
      treasureConfig,
      treasureState,
    )
  } catch {
    return { state, supported: false }
  }

  player.treasures = redeemResult.updatedHand
  player.armies = Math.max(0, (player.armies ?? 0) + redeemResult.troops)

  const remainingMatches = findRedeemableSets(redeemResult.updatedHand)
  player.mustCashInTreasures =
    redeemResult.updatedHand.length >= treasureConfig.handCap && remainingMatches.length > 0
  working.treasureState = redeemResult.updatedState

  if (redeemResult.troops > 0 && previousPhase !== 'reinforcement') {
    working.resumePhaseAfterReinforcement = previousPhase
    working.resumeHasAttackedAfterReinforcement = working.hasAttackedThisTurn ?? false
    working.phase = 'reinforcement'
    refreshReinforcementTracking(working)
  } else if (previousPhase === 'reinforcement') {
    working.resumePhaseAfterReinforcement = null
    delete working.resumeHasAttackedAfterReinforcement
  }

  updateCurrentPlayerCashRequirement(working, treasureConfig)

  return { state: working, supported: true }
}

const simulateEndTurn = (
  state: LockstepState,
  playerId: string,
  _payload: EndTurnAction['payload'] | undefined,
): { state: LockstepState; supported: boolean } => {
  if (playerId !== state.currentPlayer) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  const treasureConfig = ensureTreasureConfig(working)

  switch (working.phase as GamePhase) {
    case 'reinforcement': {
      working.phase = 'attack'
      working.hasAttackedThisTurn = false
      working.reinforcementHistory = []
      delete working.reinforcementBaseline
      working.resumePhaseAfterReinforcement = null
      delete working.resumeHasAttackedAfterReinforcement
      return { state: working, supported: true }
    }
    case 'finished': {
      // Gracefully accept end_turn in finished games; no-op but supported
      return { state: working, supported: true }
    }
    case 'attack': {
      working.phase = 'fortify'
      resetMovementTracking(working)
      working.fortifyHistory = []
      return { state: working, supported: true }
    }
    case 'fortify': {
      const players = working.players as Player[]
      const currentPlayerIndex = players.findIndex((p) => p.id === working.currentPlayer)
      if (currentPlayerIndex === -1) {
        return { state, supported: false }
      }

      const currentPlayer = players[currentPlayerIndex]
      if (!currentPlayer) {
        return { state, supported: false }
      }
      maybeAwardTreasureForConquest(working, currentPlayer, treasureConfig)

      working.conqueredDuringTurn = false

      const gameEndCheck = checkGameEnd(working)
      if (gameEndCheck.gameEnded) {
        return { state: working, supported: true }
      }

      let nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      const safetyLimit = players.length * 2
      let guard = 0
      while (players[nextPlayerIndex]?.isEliminated && guard < safetyLimit) {
        nextPlayerIndex = (nextPlayerIndex + 1) % players.length
        guard += 1
      }

      const nextPlayer = players[nextPlayerIndex]
      if (!nextPlayer || nextPlayer.isEliminated) {
        return { state: working, supported: false }
      }

      working.currentPlayer = nextPlayer.id
      working.hasAttackedThisTurn = false
      delete working.lastBattleResult

      const firstActiveIndex = players.findIndex((p) => !p.isEliminated)
      if (firstActiveIndex !== -1 && nextPlayerIndex === firstActiveIndex) {
        handleKingOfTheHillRoundComplete(working)
        if (working.phase === 'finished') {
          return { state: working, supported: true }
        }
        working.turn += 1
      }

      working.phase = 'reinforcement'
      prepareReinforcementPhase(working, treasureConfig)
      return { state: working, supported: true }
    }
    default:
      return { state, supported: false }
  }
}

const simulateGoBackToReinforcement = (
  state: LockstepState,
  playerId: string,
  _payload: GoBackToReinforcementAction['payload'] | undefined,
): { state: LockstepState; supported: boolean } => {
  const working = cloneState(state)
  if (working.phase !== 'attack' || working.hasAttackedThisTurn) {
    return { state, supported: false }
  }
  const currentPlayer = (working.players as Player[]).find((p) => p.id === playerId)
  if (!currentPlayer) {
    return { state, supported: false }
  }
  working.phase = 'reinforcement'

  const baseReinforcements = calculateReinforcementArmies(
    currentPlayer.territories,
    working.board,
    working.gameConfig,
  )
  const history = (working.reinforcementHistory ?? []).filter(
    (entry) => entry.playerId === playerId,
  )
  const netPlacements = history.reduce((sum, entry) => sum + entry.armies, 0)
  const remaining = Math.max(0, baseReinforcements - netPlacements)
  currentPlayer.armies = remaining

  return { state: working, supported: true }
}

const simulateGoBackToAttack = (
  state: LockstepState,
  playerId: string,
  _payload: GoBackToAttackAction['payload'] | undefined,
): { state: LockstepState; supported: boolean } => {
  if (state.phase !== 'fortify') {
    return { state, supported: false }
  }

  const history = (state.fortifyHistory ?? []).filter((entry) => entry.playerId === playerId)
  const movementUsed = Object.keys(state.movementTracking ?? {}).length > 0
  if (history.length > 0 || movementUsed) {
    return { state, supported: false }
  }

  const working = cloneState(state)
  working.phase = 'attack'
  working.fortifyHistory = []
  working.movementTracking = {}
  return { state: working, supported: true }
}

const neutralizeCapitalAssignment = (state: LockstepState, playerId: string): void => {
  if (!state.capitalAssignments || !(playerId in state.capitalAssignments)) {
    return
  }
  const assignments = { ...state.capitalAssignments }
  delete assignments[playerId]
  state.capitalAssignments = assignments
}

const simulateResign = (
  state: LockstepState,
  playerId: string,
): { state: LockstepState; supported: boolean } => {
  const currentPlayer = (state.players as Player[]).find((player) => player.id === playerId)
  if (!currentPlayer) {
    return { state, supported: false }
  }

  let working = cloneState(state)
  const board = working.board.map((territory) => {
    if (territory.ownerId !== playerId) {
      return territory
    }
    const updated: Territory = { ...territory, ownerId: 'neutral' }
    if (updated.capitalOwnerId === playerId) {
      updated.capitalOwnerId = null
      updated.isCapital = false
    }
    return updated
  })

  working.board = board
  delete working.capitalElimination
  if (working.lastBattleResult) {
    delete (working.lastBattleResult as BattleResult).capitalElimination
  }

  const players = working.players as Player[]
  const target = players.find((player) => player.id === playerId)
  if (!target) {
    return { state, supported: false }
  }

  target.territories = []
  target.armies = 0
  target.treasures = []
  target.mustCashInTreasures = false
  target.isEliminated = true
  delete target.capitalTerritory

  neutralizeCapitalAssignment(working, playerId)

  working.players = players.map((player) => ({ ...player }))

  if (working.currentPlayer === playerId) {
    const result = simulateEndTurn(working, playerId, undefined)
    if (result.supported) {
      working = result.state
      delete working.capitalElimination
      if (working.lastBattleResult) {
        delete (working.lastBattleResult as BattleResult).capitalElimination
      }
    }
  }

  checkGameEnd(working)

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
      case 'trade_cards': {
        const result = simulateTradeCards(
          working,
          frame.playerId,
          command.payload as TradeCardsAction['payload'],
        )
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'end_turn': {
        const result = simulateEndTurn(working, frame.playerId, undefined)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'go_back_to_reinforcement': {
        const result = simulateGoBackToReinforcement(working, frame.playerId, undefined)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'go_back_to_attack': {
        const result = simulateGoBackToAttack(working, frame.playerId, undefined)
        if (result.supported) {
          working = result.state
        } else {
          unsupported.push(command.kind)
        }
        break
      }
      case 'resign': {
        const result = simulateResign(working, frame.playerId)
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
