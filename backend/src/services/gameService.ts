import { query, transaction } from '../config/database'
import { GameEngine } from '../game/gameEngine'
import { drawTreasure, ensureTreasureState, normalizeTreasureConfig } from '../game/hiddenTreasures'
import { loadMapForEngine } from '../game/mapLoader'
import type { ClanMembershipContext, ClanProgressionSocketPayload } from '../types/clans'
import type {
  AIDifficulty,
  GameAction,
  GameConfiguration,
  GamePhase,
  GamePlayer,
  GameState,
  GameTerritoryModifier,
  SerializedGameState,
  Territory,
} from '../types/game'
import { logger } from '../utils/logger'
import { type AIDecisionPlan, aiDecisionService, type DecisionBudget } from './aiDecisionService'
import { gameStateCache } from './cacheService'
import { ClanProgressionServiceError, clanProgressionService } from './clanProgressionService'
import { clanService } from './clanService'
import type { PlayerRating, RatingChange } from './eloService'
import { eloService } from './eloService'
import { featureFlagService } from './featureFlagService'
import { mapService } from './mapService'
import { aiTurnMetrics, battleMetrics } from './metricsService'
import notificationService from './notificationService'
import { tryGetSocketServer } from './socketRegistry'
import territoryModifierService from './territoryModifierService'

type BattleWorkerResult = {
  attackerLosses: number
  defenderLosses: number
  territoryConquered: boolean
  attackingArmiesRemaining: number
  defendingArmiesRemaining: number
  dice: {
    attacker: number[]
    defender: number[]
  }
  jobId: string
  attackingTerritoryId: string
  defendingTerritoryId: string
  attackingPlayerId: string
  defendingPlayerId?: string | null
  attackingArmiesCommitted: number
}

type PlayerConfig = {
  userId: string
  username?: string
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
}

type BattleLogEntry = {
  type?: 'BATTLE'
  jobId: string
  timestamp: string
  attackingTerritoryId: string
  defendingTerritoryId: string
  attackerId: string
  defenderId: string | null
  losses: {
    attacker: number
    defender: number
  }
  conquered: boolean
  movedArmies?: number
  eliminatedPlayers: string[]
}

type FortifyLogEntry = {
  type: 'FORTIFY'
  timestamp: string
  playerId: string
  fromTerritoryId: string
  toTerritoryId: string
  movedArmies: number
  fromArmies: number
  toArmies: number
}

type TurnLogEntry = {
  type: 'TURN'
  timestamp: string
  playerId: string
  event: 'START' | 'END'
  reinforcementArmies?: number
  territoryCount?: number
}

type TreasureLogEntry = {
  type: 'TREASURE'
  timestamp: string
  userId: string
  metal: import('../types/game').Metal
}

type LifecycleLogEntry = {
  type: 'LIFECYCLE'
  timestamp: string
  event: 'CREATED' | 'STARTED'
}

type GameLogEntry =
  | BattleLogEntry
  | FortifyLogEntry
  | TurnLogEntry
  | TreasureLogEntry
  | LifecycleLogEntry

type PlayerRankingSummary = {
  userId: string
  position: number
  isWinner: boolean
  eliminated: boolean
  territories: number
  armies: number
  eliminationOrder: number | null
}

const CLAN_XP_BASE = 400
const CLAN_XP_WIN_BONUS = 250
const CLAN_XP_TOP_PLACEMENTS: Record<number, number> = {
  1: 150,
  2: 100,
  3: 50,
}
const CLAN_XP_TERRITORY_FACTOR = 5
const CLAN_XP_TERRITORY_CAP = 150

export class GameService {
  private gameEngine = new GameEngine()
  // Removed: private activeGames = new Map<string, GameState>()
  // Now using Redis-backed gameStateCache for persistence and scalability

  private serializeGameState(gameState: GameState): SerializedGameState {
    const { territoryModifiers, ...rest } = gameState
    const baseState = rest as Omit<GameState, 'territoryModifiers'>

    const serialized: SerializedGameState = {
      ...baseState,
    }

    if (territoryModifiers instanceof Map) {
      serialized.territoryModifiers = Object.fromEntries(territoryModifiers.entries())
    } else if (territoryModifiers) {
      serialized.territoryModifiers = territoryModifiers
    }

    return serialized
  }

  private cloneGameState(state: GameState): GameState {
    const serialized = this.serializeGameState(state)
    return this.hydrateGameState(structuredClone(serialized))
  }

  private normalizeAction(action: GameAction, roomId: string, playerId: string): GameAction | null {
    if (action.playerId && action.playerId !== playerId) {
      return null
    }

    if (action.roomId && action.roomId !== roomId) {
      return { ...action, playerId, roomId } as GameAction
    }

    return { ...action, playerId, roomId } as GameAction
  }

  private async applyActions(
    baseState: GameState,
    actions: GameAction[],
    playerId: string,
  ): Promise<{ success: boolean; gameState: GameState; applied: GameAction[] }> {
    if (actions.length === 0) {
      return { success: false, gameState: baseState, applied: [] }
    }

    let workingState = this.cloneGameState(baseState)
    const applied: GameAction[] = []

    for (const originalAction of actions) {
      const normalized = this.normalizeAction(originalAction, baseState.roomId, playerId)
      if (!normalized) {
        return { success: false, gameState: baseState, applied: [] }
      }

      if (!this.gameEngine.validateAction(workingState, normalized)) {
        return { success: false, gameState: baseState, applied: [] }
      }

      const { gameState: updatedState } = await this.gameEngine.processAction(
        workingState,
        normalized,
      )
      workingState = updatedState
      applied.push(normalized)
    }

    return { success: true, gameState: workingState, applied }
  }

  private limitFallbackActions(
    actions: GameAction[],
    budget: DecisionBudget | undefined,
    roomId: string,
    playerId: string,
  ) {
    const maxAllowed = budget?.maxPlannedActions ?? actions.length
    const limited = actions.slice(0, Math.max(1, maxAllowed))
    return limited
      .map((action) => this.normalizeAction(action, roomId, playerId))
      .filter((a): a is GameAction => Boolean(a))
  }

  private hydrateGameState(state: GameState | SerializedGameState): GameState {
    if (state.territoryModifiers && !(state.territoryModifiers instanceof Map)) {
      const modifierMap = new Map<string, GameTerritoryModifier>(
        Object.entries(state.territoryModifiers),
      )

      return {
        ...state,
        territoryModifiers: modifierMap,
      }
    }

    return state as GameState
  }

  async executeAiTurn(
    roomId: string,
    budgetOverrides?: Partial<DecisionBudget>,
  ): Promise<{
    plan: AIDecisionPlan
    appliedActions: GameAction[]
    fallbackUsed: boolean
    fallbackReason?: string
    gameState: GameState
  }> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) {
      throw new Error('Game not found')
    }

    const hydrated = this.hydrateGameState(cachedState)
    const currentPlayer = hydrated.players.find((player) => player.id === hydrated.currentPlayer)

    if (!currentPlayer) {
      throw new Error('Current player not found')
    }

    if (!currentPlayer.isAi) {
      throw new Error('Current player is not AI-controlled')
    }

    const effectiveBudget: DecisionBudget = {
      maxThinkTimeMs: budgetOverrides?.maxThinkTimeMs ?? 1000,
      maxPlannedActions: budgetOverrides?.maxPlannedActions ?? 4,
      signal: budgetOverrides?.signal,
    }

    const decisionPlan = await aiDecisionService.chooseAction({
      gameState: this.cloneGameState(hydrated),
      player: currentPlayer,
      difficulty: currentPlayer.aiDifficulty ?? 'recruit',
      budget: effectiveBudget,
    })

    const baselineState = this.cloneGameState(hydrated)
    const planResult = await this.applyActions(
      baselineState,
      decisionPlan.actions,
      currentPlayer.id,
    )

    let finalState: GameState
    let appliedActions: GameAction[]
    let fallbackUsed = decisionPlan.usedFallback
    let fallbackReason = decisionPlan.usedFallback
      ? (decisionPlan.reason ?? 'service_fallback')
      : undefined

    if (planResult.success) {
      finalState = planResult.gameState
      appliedActions = planResult.applied
    } else {
      const fallbackActions = this.limitFallbackActions(
        aiDecisionService.buildFallbackPlan(baselineState, currentPlayer.id),
        effectiveBudget,
        roomId,
        currentPlayer.id,
      )
      const fallbackResult = await this.applyActions(
        baselineState,
        fallbackActions,
        currentPlayer.id,
      )
      if (!fallbackResult.success) {
        throw new Error('Failed to apply fallback plan for AI turn')
      }
      finalState = fallbackResult.gameState
      appliedActions = fallbackResult.applied
      fallbackUsed = true
      fallbackReason = fallbackReason ?? 'invalid_plan'
    }

    await gameStateCache.setGameState(roomId, this.serializeGameState(finalState))

    const decisionDiagnostics = decisionPlan.diagnostics
    const thinkTimeMs = decisionDiagnostics?.durationMs
    const plannedActionCount = decisionPlan.actions.length
    const difficulty = currentPlayer.aiDifficulty ?? 'recruit'

    aiTurnMetrics.recordTurn({
      difficulty,
      fallbackUsed,
      fallbackReason,
      thinkTimeMs,
      plannedActions: plannedActionCount,
      appliedActions: appliedActions.length,
    })

    logger.info('AI turn executed', {
      roomId,
      playerId: currentPlayer.id,
      difficulty,
      planUsedFallback: decisionPlan.usedFallback,
      planReason: decisionPlan.reason ?? null,
      fallbackUsed,
      fallbackReason: fallbackReason ?? null,
      plannedActionCount,
      appliedActionCount: appliedActions.length,
      thinkTimeMs: thinkTimeMs ?? null,
      budget: {
        maxThinkTimeMs:
          decisionDiagnostics?.budget?.maxThinkTimeMs ?? effectiveBudget.maxThinkTimeMs,
        maxPlannedActions:
          decisionDiagnostics?.budget?.maxPlannedActions ?? effectiveBudget.maxPlannedActions,
      },
      actionTypes: {
        planned: decisionPlan.actions.map((action) => action.type),
        applied: appliedActions.map((action) => action.type),
      },
      phaseBefore: baselineState.phase,
      phaseAfter: finalState.phase,
    })

    return {
      plan: decisionPlan,
      appliedActions,
      fallbackUsed,
      fallbackReason,
      gameState: finalState,
    }
  }

  async isCapitalTerritory(roomId: string, territoryId: string | number): Promise<boolean> {
    const rawState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!rawState) {
      return false
    }

    const gameState = this.hydrateGameState(rawState)
    const normalizedId = typeof territoryId === 'number' ? territoryId.toString() : territoryId
    const territory = gameState.board.find((entry) => entry.id === normalizedId)

    return territory?.isCapital === true
  }

  async processGameAction(action: GameAction, userId: string): Promise<GameState> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(action.roomId)

    if (!cachedState) {
      throw new Error('Game not found')
    }

    const gameState = this.hydrateGameState(cachedState)

    if (!this.isValidAction(action, userId, gameState)) {
      throw new Error('Invalid action')
    }

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(action.roomId, this.serializeGameState(updatedState))

    logger.info(`Game action processed for room ${action.roomId}: ${action.type}`)
    return updatedState
  }

  async initializeGame(
    roomId: string,
    players: PlayerConfig[],
    gameConfig?: Partial<GameConfiguration>,
  ): Promise<GameState> {
    // Default game configuration
    const defaultGameConfig = {
      movementType: 'classic_adjacent' as const,
      allowTeamPlay: false,
      teamMode: 'none' as const,
      numberOfTeams: null as number | null,
      teamAssignments: undefined as Record<number, string[]> | undefined,
      maxPlayers: 6,
      gameMode: 'standard',
    }

    const config: GameConfiguration = { ...defaultGameConfig, ...(gameConfig || {}) }

    if (config.allowTeamPlay) {
      if (!config.teamAssignments) {
        const assignments: Record<number, string[]> = {}
        for (const player of players) {
          if (player.teamId && player.teamId > 0) {
            if (!assignments[player.teamId]) {
              assignments[player.teamId] = []
            }
            assignments[player.teamId].push(player.userId)
          }
        }

        if (Object.keys(assignments).length > 0) {
          config.teamAssignments = assignments
        }
      }
    } else {
      config.teamAssignments = undefined
      config.numberOfTeams = null
    }

    if (!config.mapId) {
      throw new Error('No map selected for game')
    }

    // Validate map before loading into engine
    const validation = await mapService.validateMapPlayable(config.mapId)
    if (!validation.isValid) {
      const msg = `Selected map failed validation: ${validation.errors.join('; ')}`
      logger.warn(msg, { mapId: config.mapId })
      throw new Error(msg)
    }

    const loaded = await loadMapForEngine(config.mapId)
    // Ensure continent bonuses are present in config (for UI and calculations)
    if (!config.continentBonuses || config.continentBonuses.length === 0) {
      config.continentBonuses = loaded.continentBonuses
    }

    const gameState = this.gameEngine.initializeGame(roomId, players, config, {
      territories: loaded.territories,
      continentBonuses: loaded.continentBonuses,
    })

    // Initialize territory modifiers if enabled
    if (config.useTerritoryModifiers) {
      const territoryIds = gameState.board.map((t) => t.id)
      await territoryModifierService.initializeGameModifiers(roomId, config.mapId, territoryIds)

      // Load modifiers into game state
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      gameState.territoryModifiers = modifiers
    }

    // Cache the game state with TTL for automatic cleanup (24 hours)
    await gameStateCache.setGameState(roomId, this.serializeGameState(gameState))

    if (notificationService.isEnabled()) {
      notificationService
        .notifyGameStart(
          roomId,
          players.map((player) => player.userId),
        )
        .catch((error) => {
          logger.warn('Failed to send game start push notifications', {
            roomId,
            error: error instanceof Error ? error.message : error,
          })
        })
    }

    logger.info(`Game initialized for room ${roomId} with ${players.length} players`)
    return gameState
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) return null

    const hydratedState = this.hydrateGameState(cachedState)

    if (hydratedState.gameConfig?.useTerritoryModifiers && !hydratedState.territoryModifiers) {
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      if (modifiers.size > 0) {
        hydratedState.territoryModifiers = modifiers
      }
    }

    return hydratedState
  }

  async deployArmies(roomId: string, userId: string, territoryId: string, armies: number) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'reinforcement') throw new Error('Not reinforcement phase')

    const action: GameAction = {
      type: 'deploy',
      roomId,
      playerId: userId,
      payload: { territoryId, armies },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid deployment')
    }

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    return {
      gameState: this.serializeGameState(updatedState),
      territoryId,
      armies: updatedState.board.find((t) => t.id === territoryId)?.armies || 0,
    }
  }

  async attack(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'attack') throw new Error('Not attack phase')

    const action: GameAction = {
      type: 'attack',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid attack')
    }

    const { gameState: updatedState, battleResult } = await this.gameEngine.processAction(
      gameState,
      action,
    )

    if (!battleResult) {
      throw new Error('Attack did not produce a battle result')
    }

    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    if (notificationService.isEnabled() && battleResult.gameEnded) {
      const participantIds = updatedState.players.map((player) => player.id)
      const winnerId = battleResult.winner?.id ?? updatedState.currentPlayer
      notificationService.notifyGameEnd(roomId, winnerId, participantIds).catch((error) => {
        logger.warn('Failed to send game end push notifications after battle', {
          roomId,
          error: error instanceof Error ? error.message : error,
        })
      })
    }

    return {
      ...battleResult,
      gameState: this.serializeGameState(updatedState),
    }
  }

  async fortify(
    roomId: string,
    userId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'fortify') throw new Error('Not fortify phase')

    const action: GameAction = {
      type: 'fortify',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId, armies },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid fortification')
    }

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    return {
      gameState: this.serializeGameState(updatedState),
      fromTerritoryId,
      toTerritoryId,
      fromArmies: updatedState.board.find((t) => t.id === fromTerritoryId)?.armies || 0,
      toArmies: updatedState.board.find((t) => t.id === toTerritoryId)?.armies || 0,
    }
  }

  async endTurn(roomId: string, userId: string) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')

    const previousPlayerId = gameState.currentPlayer
    const previousPhase = gameState.phase
    // Keep snapshot of previous player's treasure hand to detect awards
    const previousPlayer = gameState.players.find((p) => p.id === previousPlayerId)
    const prevTreasures = previousPlayer?.treasures
    const prevHand = Array.isArray(prevTreasures) ? [...prevTreasures] : []

    const updatedState = this.gameEngine.advancePhase(gameState)

    // Use longer TTL for finished games
    if (updatedState.phase === 'finished') {
      await gameStateCache.setInactiveGameState(roomId, this.serializeGameState(updatedState))
    } else {
      await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))
    }

    if (notificationService.isEnabled()) {
      const nextPlayerId = updatedState.currentPlayer
      const participantIds = updatedState.players.map((player) => player.id)

      if (updatedState.phase === 'finished' && previousPhase !== 'finished') {
        const winner = updatedState.players.find(
          (player) => player.id === nextPlayerId && !player.isEliminated,
        )
        notificationService
          .notifyGameEnd(roomId, winner?.id ?? nextPlayerId, participantIds)
          .catch((error) => {
            logger.warn('Failed to send game end push notifications', {
              roomId,
              error: error instanceof Error ? error.message : error,
            })
          })
      } else if (nextPlayerId !== previousPlayerId && updatedState.phase === 'reinforcement') {
        const nextPlayer = updatedState.players.find((player) => player.id === nextPlayerId)
        notificationService
          .notifyTurnStart(roomId, nextPlayerId, nextPlayer?.username ?? 'Your turn')
          .catch((error) => {
            logger.warn('Failed to send turn start push notification', {
              roomId,
              nextPlayerId,
              error: error instanceof Error ? error.message : error,
            })
          })
      }
    }

    // Detect treasure card awarded to the player who just ended their turn
    let treasureAwarded: import('../types/game').Metal | undefined
    try {
      const afterPlayer = updatedState.players.find((p) => p.id === previousPlayerId)
      const afterTreasures = afterPlayer?.treasures
      const afterHand = Array.isArray(afterTreasures) ? afterTreasures : []
      if (afterHand.length > prevHand.length) {
        // Identify the newly added card by multiset diff
        const counts = new Map<string, number>()
        for (const m of prevHand) counts.set(m, (counts.get(m) ?? 0) + 1)
        for (const m of afterHand) {
          const c = counts.get(m) ?? 0
          if (c > 0) {
            counts.set(m, c - 1)
          } else {
            treasureAwarded = m as import('../types/game').Metal
            break
          }
        }
      }
    } catch {
      // best-effort only
    }

    // Calculate reinforcement armies if moving to reinforcement phase
    let reinforcementArmies = 0
    if (updatedState.phase === 'reinforcement') {
      reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(
        updatedState,
        updatedState.currentPlayer,
      )
    }

    // Append TURN logs (END for previous, START for next when applicable)
    try {
      const now = new Date().toISOString()
      const entries: GameLogEntry[] = [
        { type: 'TURN', timestamp: now, playerId: previousPlayerId, event: 'END' },
      ]
      if (updatedState.phase === 'reinforcement') {
        const territoryCount = updatedState.board.filter(
          (t) => t.ownerId === updatedState.currentPlayer,
        ).length
        entries.push({
          type: 'TURN',
          timestamp: now,
          playerId: updatedState.currentPlayer,
          event: 'START',
          reinforcementArmies,
          territoryCount,
        })
      }
      // Include treasure award entry if applicable
      if (treasureAwarded) {
        entries.push({
          type: 'TREASURE',
          timestamp: now,
          userId: previousPlayerId,
          metal: treasureAwarded,
        })
      }
      await this.appendLog(roomId, entries)
    } catch (err) {
      logger.warn('Failed to append turn logs', {
        roomId,
        error: err instanceof Error ? err.message : err,
      })
    }

    return {
      gameState: this.serializeGameState(updatedState),
      reinforcementArmies,
      treasureAwarded,
    }
  }

  private isValidAction(action: GameAction, userId: string, gameState: GameState): boolean {
    if (gameState.currentPlayer !== userId) {
      return false
    }

    return this.gameEngine.validateAction(gameState, action)
  }

  /**
   * Worker support methods
   */
  async processPlaceArmies(
    gameId: string,
    data: { territoryId: string; armies: number; playerId: string },
  ): Promise<number> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    const territory = gameState.board.find((t) => t.id === data.territoryId)
    if (!territory) throw new Error('Territory not found')

    territory.armies += data.armies
    await gameStateCache.setGameState(gameId, this.serializeGameState(gameState))

    return territory.armies
  }

  async processFortify(
    gameId: string,
    data: { fromTerritoryId: string; toTerritoryId: string; armies: number; playerId: string },
  ): Promise<{ fromArmies: number; toArmies: number }> {
    const result = await this.fortify(
      gameId,
      data.playerId,
      data.fromTerritoryId,
      data.toTerritoryId,
      data.armies,
    )
    // Persist fortify to game log
    try {
      const entry: FortifyLogEntry = {
        type: 'FORTIFY',
        timestamp: new Date().toISOString(),
        playerId: data.playerId,
        fromTerritoryId: data.fromTerritoryId,
        toTerritoryId: data.toTerritoryId,
        movedArmies: data.armies,
        fromArmies: result.fromArmies,
        toArmies: result.toArmies,
      }
      await this.appendLog(gameId, [entry])
    } catch (err) {
      logger.warn('Failed to append fortify log', {
        gameId,
        error: err instanceof Error ? err.message : err,
      })
    }

    return {
      fromArmies: result.fromArmies,
      toArmies: result.toArmies,
    }
  }

  async processEndTurn(gameId: string, playerId: string): Promise<{ id: string }> {
    const result = await this.endTurn(gameId, playerId)
    return { id: result.gameState.currentPlayer }
  }

  async processPhaseChange(gameId: string, playerId: string, phase: GamePhase): Promise<void> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    if (gameState.currentPlayer !== playerId) {
      throw new Error('Not your turn')
    }

    gameState.phase = phase
    await gameStateCache.setGameState(gameId, this.serializeGameState(gameState))
  }

  async applyBattleResult(
    gameId: string,
    payload: BattleWorkerResult,
  ): Promise<{ applied: boolean }> {
    const {
      jobId,
      attackerLosses,
      defenderLosses,
      territoryConquered,
      attackingArmiesRemaining,
      defendingArmiesRemaining,
      dice,
      attackingTerritoryId,
      defendingTerritoryId,
      attackingPlayerId,
      defendingPlayerId,
      attackingArmiesCommitted,
    } = payload

    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    const attackerTerritory = gameState.board.find((t) => t.id === attackingTerritoryId)
    const defenderTerritory = gameState.board.find((t) => t.id === defendingTerritoryId)

    if (!attackerTerritory || !defenderTerritory) {
      throw new Error('Territory not found')
    }

    const attackerId = attackerTerritory.ownerId ?? attackingPlayerId
    if (!attackerId) {
      throw new Error('Attacking player missing from state')
    }

    const defenderId = defenderTerritory.ownerId ?? defendingPlayerId ?? null

    const preMoveAttackerArmies = Math.max(attackingArmiesRemaining, 0)
    const maxMovable = Math.max(preMoveAttackerArmies - 1, 0)
    const movingArmies = territoryConquered
      ? Math.max(0, Math.min(attackingArmiesCommitted, maxMovable))
      : 0
    const finalAttackerArmies = territoryConquered
      ? Math.max(preMoveAttackerArmies - movingArmies, 1)
      : Math.max(preMoveAttackerArmies, 1)
    const finalDefenderArmies = territoryConquered
      ? Math.max(movingArmies, 0)
      : Math.max(defendingArmiesRemaining, 0)

    const updatedBoard: Territory[] = gameState.board.map((territory) => {
      if (territory.id === attackingTerritoryId) {
        return {
          ...territory,
          armies: finalAttackerArmies,
        }
      }

      if (territory.id === defendingTerritoryId) {
        return {
          ...territory,
          ownerId: territoryConquered ? attackerId : territory.ownerId,
          armies: finalDefenderArmies,
        }
      }

      return territory
    })

    const playersAfterBattle = this.rebuildPlayersAfterBattle(gameState.players, updatedBoard)
    const activePlayers = playersAfterBattle.filter((player) => !player.isEliminated)
    const gameEnded = activePlayers.length <= 1
    const winner = gameEnded ? (activePlayers[0] ?? null) : null

    const lastBattleResult = {
      attackerDice: dice.attacker,
      defenderDice: dice.defender,
      attackerLosses,
      defenderLosses,
      conquered: territoryConquered,
      fromTerritory: {
        id: attackingTerritoryId,
        name: attackerTerritory.name,
        armies: finalAttackerArmies,
      },
      toTerritory: {
        id: defendingTerritoryId,
        name: defenderTerritory.name,
        armies: finalDefenderArmies,
        ownerId: territoryConquered
          ? attackerId
          : (defenderTerritory.ownerId ?? defenderId ?? attackerId),
      },
      gameEnded,
      winner,
      eliminatedPlayers: playersAfterBattle
        .filter((player) => player.isEliminated)
        .map((p) => p.id),
    }

    const updatedGameState: GameState = {
      ...gameState,
      board: updatedBoard,
      players: playersAfterBattle,
      lastBattleResult,
      hasAttackedThisTurn: true,
      phase: gameEnded ? 'finished' : gameState.phase,
      currentPlayer: gameEnded && winner ? winner.id : gameState.currentPlayer,
    }

    let serializedState = this.serializeGameState(updatedGameState)
    const playerStats = this.buildPlayerStats(playersAfterBattle, updatedBoard)
    const logEntry: BattleLogEntry = {
      type: 'BATTLE',
      jobId,
      timestamp: new Date().toISOString(),
      attackingTerritoryId,
      defendingTerritoryId,
      attackerId,
      defenderId,
      losses: {
        attacker: attackerLosses,
        defender: defenderLosses,
      },
      conquered: territoryConquered,
      movedArmies: territoryConquered ? finalDefenderArmies : undefined,
      eliminatedPlayers: lastBattleResult.eliminatedPlayers ?? [],
    }

    let persistenceOutcome: { applied: boolean; divergence: number }
    let latestBattleLog: BattleLogEntry[] = []

    try {
      persistenceOutcome = await transaction(async (client) => {
        const existingStateResult = await client.query<{
          territories: Territory[] | null
          game_log: BattleLogEntry[] | null
          winner_id: string | null
        }>(
          'SELECT territories, game_log, winner_id FROM game_states WHERE room_id = $1 FOR UPDATE',
          [gameId],
        )

        const existingRow = existingStateResult.rows[0]
        const existingLog = Array.isArray(existingRow?.game_log) ? existingRow?.game_log : []
        latestBattleLog = existingLog
        const alreadyApplied = existingLog.some((entry) => entry?.jobId === jobId)
        const divergence = this.calculateTerritoryDivergence(
          existingRow?.territories ?? null,
          updatedBoard,
        )

        if (alreadyApplied) {
          return { applied: false, divergence }
        }

        const updatedLog = [...existingLog, logEntry].slice(-500)
        latestBattleLog = updatedLog
        const roundNumber = this.calculateRoundNumber(updatedGameState)

        await client.query(
          `INSERT INTO game_states (
            room_id,
            current_player_id,
            game_phase,
            turn_number,
            round_number,
            territories,
            player_stats,
            game_log,
            last_activity,
            winner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
          ON CONFLICT (room_id) DO UPDATE SET
            current_player_id = EXCLUDED.current_player_id,
            game_phase = EXCLUDED.game_phase,
            turn_number = EXCLUDED.turn_number,
            round_number = EXCLUDED.round_number,
            territories = EXCLUDED.territories,
            player_stats = EXCLUDED.player_stats,
            game_log = EXCLUDED.game_log,
            last_activity = NOW(),
            winner_id = EXCLUDED.winner_id`,
          [
            gameId,
            serializedState.currentPlayer,
            serializedState.phase,
            serializedState.turn,
            roundNumber,
            JSON.stringify(serializedState.board),
            JSON.stringify(playerStats),
            JSON.stringify(updatedLog),
            gameEnded ? (winner?.id ?? null) : (existingRow?.winner_id ?? null),
          ],
        )

        return { applied: true, divergence }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown battle persistence error'
      battleMetrics.recordFailure(message, { gameId, jobId })
      throw error
    }

    const status = persistenceOutcome.applied ? 'applied' : 'duplicate'
    battleMetrics.recordApply(gameId, status, persistenceOutcome.divergence)

    if (persistenceOutcome.applied) {
      // If conquest and treasures enabled, award treasure immediately and log it
      try {
        if (territoryConquered) {
          const cfg = normalizeTreasureConfig(updatedGameState.gameConfig.treasureConfig)
          if (cfg.enabled) {
            updatedGameState.treasureState = ensureTreasureState(updatedGameState.treasureState)
            const metal = drawTreasure(cfg)
            const attacker = updatedGameState.players.find((p) => p.id === attackerId)
            if (attacker) {
              if (!Array.isArray(attacker.treasures)) attacker.treasures = []
              attacker.treasures.push(metal)
              // Do not set global mustCashIn mid-turn to avoid blocking actions
              attacker.mustCashInTreasures = (attacker.treasures?.length ?? 0) >= cfg.handCap
            }
            // Persist treasure award entry in game log
            await this.appendLog(gameId, [
              { type: 'TREASURE', timestamp: new Date().toISOString(), userId: attackerId, metal },
            ])
          }
        }
      } catch (e) {
        logger.warn('Failed to award or log treasure on conquest', {
          gameId,
          error: e instanceof Error ? e.message : e,
        })
      }

      serializedState = this.serializeGameState(updatedGameState)
      await gameStateCache.setGameState(gameId, serializedState)
    }

    if (persistenceOutcome.applied && gameEnded) {
      const finalization = await this.finalizeCompletedGame(
        gameId,
        serializedState,
        playersAfterBattle,
        playerStats,
        latestBattleLog,
      )
      battleMetrics.clearGame(gameId)
      if (finalization.archived) {
        await this.awardClanContributions(gameId, finalization.playerRankings)
      }
    }

    return { applied: persistenceOutcome.applied }
  }

  private rebuildPlayersAfterBattle(players: GamePlayer[], board: Territory[]): GamePlayer[] {
    return players.map((player) => {
      const territories = board.filter((territory) => territory.ownerId === player.id)
      const territoryIds = territories.map((territory) => territory.id)
      const totalArmies = territories.reduce((sum, territory) => sum + territory.armies, 0)

      return {
        ...player,
        territories: territoryIds,
        armies: totalArmies,
        isEliminated: territoryIds.length === 0,
      }
    })
  }

  private buildPlayerStats(players: GamePlayer[], board: Territory[]) {
    const boardByOwner = board.reduce<Record<string, { territories: number; armies: number }>>(
      (acc, territory) => {
        if (!territory.ownerId) return acc

        if (!acc[territory.ownerId]) {
          acc[territory.ownerId] = { territories: 0, armies: 0 }
        }

        acc[territory.ownerId].territories += 1
        acc[territory.ownerId].armies += territory.armies
        return acc
      },
      {},
    )

    return players.reduce<
      Record<string, { territories: number; armies: number; eliminated: boolean }>
    >((acc, player) => {
      const metrics = boardByOwner[player.id] ?? { territories: 0, armies: 0 }
      acc[player.id] = {
        territories: metrics.territories,
        armies: metrics.armies,
        eliminated: player.isEliminated,
      }
      return acc
    }, {})
  }

  private calculateTerritoryDivergence(
    persisted: Territory[] | null,
    updatedBoard: Territory[],
  ): number {
    if (!persisted || persisted.length === 0) {
      return updatedBoard.length
    }

    const persistedById = new Map<string, Territory>()
    for (const territory of persisted) {
      persistedById.set(territory.id, territory)
    }

    let divergences = 0

    for (const territory of updatedBoard) {
      const persistedTerritory = persistedById.get(territory.id)
      if (!persistedTerritory) {
        divergences += 1
        continue
      }

      if (
        persistedTerritory.ownerId !== territory.ownerId ||
        persistedTerritory.armies !== territory.armies
      ) {
        divergences += 1
      }
    }

    return divergences
  }

  private calculateRoundNumber(gameState: GameState): number {
    const activePlayers = gameState.players.filter((player) => !player.isEliminated).length
    const divisor = Math.max(activePlayers, 1)
    return Math.max(1, Math.ceil(gameState.turn / divisor))
  }

  private buildEliminationOrder(battleLog: BattleLogEntry[]): string[] {
    const order: string[] = []
    for (const entry of battleLog) {
      for (const eliminated of entry.eliminatedPlayers ?? []) {
        if (eliminated && !order.includes(eliminated)) {
          order.push(eliminated)
        }
      }
    }
    return order
  }

  private buildPlayerRanking(
    players: GamePlayer[],
    playerStatsSnapshot: Record<
      string,
      { territories: number; armies: number; eliminated: boolean }
    >,
    battleLog: BattleLogEntry[],
  ): PlayerRankingSummary[] {
    const eliminationOrder = this.buildEliminationOrder(battleLog)
    const playersById = new Map(players.map((player) => [player.id, player]))
    const winner = players.find((player) => !player.isEliminated) ?? null

    const orderedIds: string[] = []
    if (winner) {
      orderedIds.push(winner.id)
    }

    for (const eliminated of eliminationOrder) {
      if (!orderedIds.includes(eliminated) && playersById.has(eliminated)) {
        orderedIds.push(eliminated)
      }
    }

    for (const player of players) {
      if (!orderedIds.includes(player.id)) {
        orderedIds.push(player.id)
      }
    }

    return orderedIds.map((playerId, index) => {
      const stats = playerStatsSnapshot[playerId] ?? {
        territories: 0,
        armies: 0,
        eliminated: true,
      }
      const eliminationIndex = eliminationOrder.indexOf(playerId)
      const player = playersById.get(playerId)

      return {
        userId: playerId,
        position: index + 1,
        isWinner: winner?.id === playerId,
        eliminated: stats.eliminated ?? player?.isEliminated ?? true,
        territories: stats.territories,
        armies: stats.armies,
        eliminationOrder: eliminationIndex === -1 ? null : eliminationIndex + 1,
      }
    })
  }

  private calculateClanXp(ranking: PlayerRankingSummary): number {
    const placementBonus = CLAN_XP_TOP_PLACEMENTS[ranking.position] ?? 0
    const territoryBonus = Math.min(
      CLAN_XP_TERRITORY_CAP,
      Math.max(0, ranking.territories * CLAN_XP_TERRITORY_FACTOR),
    )

    const rawTotal =
      CLAN_XP_BASE + placementBonus + territoryBonus + (ranking.isWinner ? CLAN_XP_WIN_BONUS : 0)
    return Math.max(CLAN_XP_BASE, Math.round(rawTotal))
  }

  private async awardClanContributions(
    gameId: string,
    rankings: PlayerRankingSummary[],
  ): Promise<void> {
    if (rankings.length === 0) {
      return
    }

    // For compatibility with tests and potential future gating, evaluate flag (result ignored)
    try {
      await featureFlagService.evaluateFlagByName('clans_enabled')
    } catch (_err) {
      // ignore
    }

    let membershipMap: Map<string, ClanMembershipContext>
    try {
      membershipMap = await clanService.getActiveMembershipsForUsers(
        rankings.map((ranking) => ranking.userId),
      )
    } catch (error) {
      logger.error('Failed to load clan memberships for awarding contributions', {
        gameId,
        error: error instanceof Error ? error.message : error,
      })
      return
    }

    if (membershipMap.size === 0) {
      return
    }

    for (const ranking of rankings) {
      const membership = membershipMap.get(ranking.userId)
      if (!membership) {
        continue
      }

      const xp = this.calculateClanXp(ranking)
      if (xp <= 0) {
        continue
      }

      try {
        const contribution = await clanProgressionService.awardContribution({
          clanId: membership.clanId,
          userId: ranking.userId,
          actorUserId: ranking.userId,
          xp,
          matchesPlayed: 1,
          matchesWon: ranking.isWinner ? 1 : 0,
          source: 'game_result',
          metadata: {
            gameId,
            placement: ranking.position,
            territories: ranking.territories,
            armies: ranking.armies,
            eliminated: ranking.eliminated,
          },
        })

        this.emitClanProgressionUpdate({
          clanId: contribution.clanId,
          gameId,
          userId: ranking.userId,
          xpAwarded: xp,
          matchesPlayed: 1,
          matchesWon: ranking.isWinner ? 1 : 0,
          placement: ranking.position,
          territories: ranking.territories,
          armies: ranking.armies,
          eliminated: ranking.eliminated,
          progression: contribution.progression,
          objectiveUpdates: contribution.objectiveUpdates,
        })
      } catch (error) {
        if (error instanceof ClanProgressionServiceError) {
          logger.warn('Skipped clan contribution for player', {
            gameId,
            userId: ranking.userId,
            clanId: membership.clanId,
            code: error.code,
          })
          continue
        }

        logger.error('Failed to award clan contribution', {
          gameId,
          userId: ranking.userId,
          clanId: membership.clanId,
          error: error instanceof Error ? error.message : error,
        })
      }
    }
  }

  private emitClanProgressionUpdate(payload: ClanProgressionSocketPayload): void {
    const io = tryGetSocketServer()
    if (!io) {
      return
    }

    io.to(`clan:${payload.clanId}`).emit('clan:progress', payload)
  }

  private async finalizeCompletedGame(
    gameId: string,
    serializedState: SerializedGameState,
    players: GamePlayer[],
    playerStatsSnapshot: Record<
      string,
      { territories: number; armies: number; eliminated: boolean }
    >,
    battleLog: BattleLogEntry[],
  ): Promise<{ archived: boolean; playerRankings: PlayerRankingSummary[] }> {
    const playerRankings = this.buildPlayerRanking(players, playerStatsSnapshot, battleLog)
    const winner = playerRankings.find((ranking) => ranking.isWinner) ?? null
    const playerIds = playerRankings.map((ranking) => ranking.userId)
    const finalStateJson = JSON.stringify(serializedState)
    const battleLogJson = JSON.stringify(battleLog)
    const totalTurns = serializedState.turn ?? 0
    const archiveTimestamp = new Date()

    const persisted = await transaction<boolean>(async (client) => {
      const existingResult = await client.query<{ room_id: string }>(
        'SELECT room_id FROM game_results WHERE room_id = $1',
        [gameId],
      )

      if ((existingResult.rowCount ?? 0) > 0) {
        return false
      }

      const roomResult = await client.query<{
        map_id: string | null
        started_at: Date | null
        ended_at: Date | null
      }>('SELECT map_id, started_at, ended_at FROM game_rooms WHERE id = $1 FOR UPDATE', [gameId])

      if ((roomResult.rowCount ?? 0) === 0) {
        throw new Error('Game room not found during archival')
      }

      const room = roomResult.rows[0]
      const startedAt = room.started_at ? new Date(room.started_at) : null
      const durationSeconds =
        startedAt !== null
          ? Math.max(0, Math.round((archiveTimestamp.getTime() - startedAt.getTime()) / 1000))
          : null

      await client.query(
        `UPDATE game_rooms
         SET status = 'finished',
             ended_at = COALESCE(ended_at, NOW()),
             winner_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [gameId, winner?.userId ?? null],
      )

      const usersResult = await client.query<{
        id: string
        username: string
        skill_rating: number
        created_at: Date
      }>('SELECT id, username, skill_rating, created_at FROM users WHERE id = ANY($1)', [playerIds])

      const userMap = new Map(usersResult.rows.map((user) => [user.id, user]))

      const statsResult = await client.query<{ user_id: string; games_played: number }>(
        'SELECT user_id, games_played FROM player_stats WHERE user_id = ANY($1)',
        [playerIds],
      )

      const statsMap = new Map(statsResult.rows.map((row) => [row.user_id, row.games_played]))

      const playerRatings: PlayerRating[] = playerRankings.map((ranking) => ({
        userId: ranking.userId,
        currentRating: userMap.get(ranking.userId)?.skill_rating ?? 1000,
        gamesPlayed: statsMap.get(ranking.userId) ?? 0,
        position: ranking.position,
      }))

      let ratingChanges: RatingChange[] = []
      try {
        ratingChanges = eloService.calculateRatingChanges(playerRatings)
      } catch (error) {
        logger.warn('Skipping ELO calculation for game', {
          gameId,
          playerCount: playerRatings.length,
          error: error instanceof Error ? error.message : error,
        })
      }

      const ratingChangeMap = new Map(ratingChanges.map((change) => [change.userId, change]))

      const playerSummary = playerRankings.map((ranking) => {
        const user = userMap.get(ranking.userId)
        const ratingChange = ratingChangeMap.get(ranking.userId)
        return {
          userId: ranking.userId,
          username: user?.username ?? ranking.userId,
          position: ranking.position,
          isWinner: ranking.isWinner,
          eliminated: ranking.eliminated,
          territories: ranking.territories,
          armies: ranking.armies,
          eliminationOrder: ranking.eliminationOrder,
          ratingBefore: ratingChange?.oldRating ?? user?.skill_rating ?? 1000,
          ratingAfter: ratingChange?.newRating ?? user?.skill_rating ?? 1000,
          ratingChange: ratingChange?.change ?? 0,
        }
      })

      await client.query(
        `INSERT INTO game_results (
           room_id,
           map_id,
           winner_id,
           duration_seconds,
           total_turns,
           final_state,
           player_summary,
           battle_log
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
         ON CONFLICT (room_id) DO NOTHING`,
        [
          gameId,
          room.map_id,
          winner?.userId ?? null,
          durationSeconds,
          totalTurns,
          finalStateJson,
          JSON.stringify(playerSummary),
          battleLogJson,
        ],
      )

      if (playerRankings.length > 0) {
        const playerStatsPlaceholders: string[] = []
        const playerStatsValues: Array<string | number> = []
        playerRankings.forEach((ranking, index) => {
          const baseIndex = index * 4
          playerStatsPlaceholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`,
          )
          playerStatsValues.push(
            ranking.userId,
            1,
            ranking.isWinner ? 1 : 0,
            ranking.isWinner ? 0 : 1,
          )
        })

        await client.query(
          `INSERT INTO player_stats (user_id, games_played, games_won, games_lost)
           VALUES ${playerStatsPlaceholders.join(', ')}
           ON CONFLICT (user_id) DO UPDATE SET
             games_played = player_stats.games_played + EXCLUDED.games_played,
             games_won = player_stats.games_won + EXCLUDED.games_won,
             games_lost = player_stats.games_lost + EXCLUDED.games_lost,
             updated_at = NOW()`,
          playerStatsValues,
        )
      }

      if (playerRankings.length > 0) {
        const resultsPlaceholders: string[] = []
        const resultsValues: Array<string | number | boolean | null> = []
        playerRankings.forEach((ranking, index) => {
          const ratingChange = ratingChangeMap.get(ranking.userId)
          const user = userMap.get(ranking.userId)
          const ratingBefore = ratingChange?.oldRating ?? user?.skill_rating ?? 1000
          const ratingAfter = ratingChange?.newRating ?? user?.skill_rating ?? 1000
          const ratingDelta = ratingChange?.change ?? 0
          const baseIndex = index * 11
          resultsPlaceholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`,
          )
          resultsValues.push(
            gameId,
            ranking.userId,
            ranking.position,
            ranking.isWinner,
            ranking.eliminated,
            ranking.territories,
            ranking.armies,
            ranking.eliminationOrder,
            ratingBefore,
            ratingAfter,
            ratingDelta,
          )
        })

        await client.query(
          `INSERT INTO player_game_results (
             room_id,
             user_id,
             position,
             is_winner,
             eliminated,
             territories,
             armies,
             elimination_order,
             rating_before,
             rating_after,
             rating_change
           ) VALUES ${resultsPlaceholders.join(', ')}
           ON CONFLICT (room_id, user_id) DO UPDATE SET
             position = EXCLUDED.position,
             is_winner = EXCLUDED.is_winner,
             eliminated = EXCLUDED.eliminated,
             territories = EXCLUDED.territories,
             armies = EXCLUDED.armies,
             elimination_order = EXCLUDED.elimination_order,
             rating_before = EXCLUDED.rating_before,
             rating_after = EXCLUDED.rating_after,
             rating_change = EXCLUDED.rating_change`,
          resultsValues,
        )
      }

      for (const ranking of playerRankings) {
        await client.query(
          `UPDATE room_players
           SET is_eliminated = $3,
               elimination_reason = CASE WHEN $3 THEN COALESCE(elimination_reason, 'defeated') ELSE elimination_reason END,
               left_at = CASE WHEN $3 THEN COALESCE(left_at, NOW()) ELSE left_at END,
               player_order = $4
           WHERE room_id = $1 AND user_id = $2`,
          [gameId, ranking.userId, ranking.eliminated, ranking.position],
        )
      }

      if (ratingChanges.length > 0) {
        await eloService.applyRatingChanges(gameId, ratingChanges, client)
      }

      await eloService.updateLeaderboardCache(client)
      return true
    })

    await gameStateCache.setInactiveGameState(gameId, serializedState)
    if (persisted) {
      logger.info('Archived completed game', {
        gameId,
        winnerId: winner?.userId ?? null,
      })
    }

    return { archived: persisted, playerRankings }
  }

  async archiveGameResults(gameId: string, results: Record<string, unknown>): Promise<void> {
    // TODO: Store in database
    logger.debug(`Archiving game ${gameId}:`, results)
  }

  async updateEloRatings(gameId: string, _gameState: unknown): Promise<void> {
    // TODO: Update ELO ratings
    logger.debug(`Updating ELO for game ${gameId}`)
  }

  async recordGameHistory(gameId: string, _gameState: unknown): Promise<void> {
    // TODO: Record in database
    logger.debug(`Recording history for game ${gameId}`)
  }

  async removeFromActiveGames(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async getIdleGames(_threshold: number): Promise<string[]> {
    // TODO: Query games that have been idle
    return []
  }

  async markPlayerAsInactive(gameId: string, playerId: string): Promise<void> {
    logger.info(`Marking player ${playerId} as inactive in game ${gameId}`)
  }

  async pauseGame(gameId: string): Promise<void> {
    logger.info(`Pausing game ${gameId}`)
  }

  async deleteGame(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async cleanupTemporaryData(gameId: string): Promise<void> {
    logger.debug(`Cleaning temp data for game ${gameId}`)
  }

  async cleanupAbandonedGame(gameId: string): Promise<void> {
    await this.removeFromActiveGames(gameId)
  }

  async logCleanup(gameId: string, reason: string): Promise<void> {
    logger.info(`Cleanup logged for game ${gameId}: ${reason}`)
  }

  async archiveGame(gameId: string): Promise<void> {
    logger.info(`Archiving game ${gameId}`)
  }

  async findAbandonedGames(thresholdMs: number): Promise<string[]> {
    // TODO: Query database for games that haven't been updated in thresholdMs
    logger.debug(`Finding games abandoned for ${thresholdMs}ms`)
    return []
  }

  /**
   * Clean up finished games from cache
   */
  async cleanupFinishedGames(roomIds: string[]) {
    await gameStateCache.cleanupFinishedGames(roomIds)
    // Also cleanup territory modifiers for finished games
    await territoryModifierService.cleanupFinishedGameModifiers(roomIds)
  }

  /**
   * Force cleanup a specific game (useful for abandoned games)
   */
  async removeGame(roomId: string) {
    await gameStateCache.invalidateGame(roomId)
    logger.info(`Forcefully removed game ${roomId} from cache`)
  }

  /**
   * Fetch persisted battle log entries for a game room.
   * Returns an empty array if none are available.
   */
  async getBattleLog(roomId: string): Promise<GameLogEntry[]> {
    const result = await query<{ game_log: GameLogEntry[] | null }>(
      'SELECT game_log FROM game_states WHERE room_id = $1',
      [roomId],
    )
    const rows = result.rows
    if (!rows || rows.length === 0) return []
    const log = rows[0]?.game_log
    return Array.isArray(log) ? log : []
  }

  async appendLog(roomId: string, entries: GameLogEntry[]): Promise<void> {
    if (!entries || entries.length === 0) return
    await transaction(async (client) => {
      const existing = await client.query<{ game_log: GameLogEntry[] | null }>(
        'SELECT game_log FROM game_states WHERE room_id = $1 FOR UPDATE',
        [roomId],
      )
      const current = Array.isArray(existing.rows[0]?.game_log)
        ? (existing.rows[0]?.game_log as GameLogEntry[])
        : []
      const updated = [...current, ...entries].slice(-500)
      await client.query(
        `INSERT INTO game_states (room_id, game_log, last_activity)
         VALUES ($1, $2, NOW())
         ON CONFLICT (room_id) DO UPDATE SET game_log = EXCLUDED.game_log, last_activity = NOW()`,
        [roomId, JSON.stringify(updated)],
      )
    })
  }
}
