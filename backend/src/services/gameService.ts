import type { GameDelta } from '@conquestk/shared/types/delta'
import type { PoolClient } from 'pg'
import { query, transaction, withClient } from '../config/database.js'
import { GameEngine } from '../game/gameEngine.js'
import { findRedeemableSets, normalizeTreasureConfig } from '../game/hiddenTreasures.js'
import { loadMapForEngine } from '../game/mapLoader.js'
import { assertInvariants } from '../game/stateMachine.js'
import type { ClanMembershipContext, ClanProgressionSocketPayload } from '../types/clans.js'
import { DeltaBuilder } from '../types/deltaUpdates.js'
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
} from '../types/game.js'
import { getPlayerTeam as utilGetPlayerTeam } from '../utils/gameTeams.js'
import { logger } from '../utils/logger.js'
import { type AIDecisionPlan, aiDecisionService, type DecisionBudget } from './aiDecisionService.js'
import { gameStateCache } from './cacheService.js'
import { ClanProgressionServiceError, clanProgressionService } from './clanProgressionService.js'
import { clanService } from './clanService.js'
import type { PlayerRating, RatingChange } from './eloService.js'
import { eloService } from './eloService.js'
// Pairwise Elo is now built into eloService; no separate service import
import { featureFlagService } from './featureFlagService.js'
import { mapService } from './mapService.js'
import { aiTurnMetrics, assassinationMetrics, battleMetrics } from './metricsService.js'
import notificationService from './notificationService.js'
import { queueService } from './queueService.js'
import { tryGetSocketServer } from './socketRegistry.js'
import territoryModifierService from './territoryModifierService.js'

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
  // Added: initial stacks at the start of this roll (pre-losses)
  attackerArmiesBeforeRoll?: number
  defenderArmiesBeforeRoll?: number
}

type PlayerConfig = {
  userId: string
  username?: string
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
  color?: string | null
}

type BattleLogEntry = {
  type?: 'BATTLE'
  jobId: string
  timestamp: string
  engagementId?: string
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
  // New optional metadata: initial stacks at engagement/roll start (pre-losses)
  initialFromArmies?: number
  initialToArmies?: number
}

type EngagementSummaryLogEntry = {
  type: 'ENGAGEMENT_SUMMARY'
  timestamp: string
  engagementId: string
  attackingTerritoryId: string
  defendingTerritoryId: string
  attackerId: string
  defenderId: string | null
  initialFromArmies: number
  initialToArmies: number
  totalLosses: { attacker: number; defender: number }
  conquered: boolean
}

type GameEndLogEntry = {
  type: 'GAME_END'
  timestamp: string
  winner: string
  eliminatedPlayers: string[]
}

type SectorBonusLogEntry = {
  type: 'SECTOR_BONUS'
  timestamp: string
  playerId: string
  sectorId: string
  sectorName: string
  bonus: number
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
  event: 'START' | 'END' | 'MISSED'
  reinforcementArmies?: number
  territoryCount?: number
  turnNumber?: number
  reason?: 'timeout'
}

type TreasureLogEntry = {
  type: 'TREASURE'
  timestamp: string
  userId: string
  metal: import('../types/game.js').Metal
}

type LifecycleLogEntry = {
  type: 'LIFECYCLE'
  timestamp: string
  event: 'CREATED' | 'STARTED'
}

type RngLogEntry = {
  type: 'RNG'
  timestamp: string
  scope: 'combat'
  algorithm: 'sfc32'
  seed: string
}

type ReinforceLogEntry = {
  type: 'REINFORCE'
  timestamp: string
  playerId: string
  territoryId: string
  armies: number
  remainingArmies: number
}

type RatingLogEntry = {
  type: 'RATING'
  timestamp: string
  userId: string
  change: number
  oldRating: number
  newRating: number
}

type TreasureCashLogEntry = {
  type: 'TREASURE_CASH'
  timestamp: string
  playerId: string
  troops: number
  cardCount?: number
  cards?: string[]
}

type ResignLogEntry = {
  type: 'RESIGN'
  timestamp: string
  playerId: string
}

type GameLogEntry =
  | BattleLogEntry
  | FortifyLogEntry
  | TurnLogEntry
  | TreasureLogEntry
  | ReinforceLogEntry
  | LifecycleLogEntry
  | ReinforceLogEntry
  | RatingLogEntry
  | TreasureCashLogEntry
  | EngagementSummaryLogEntry
  | RngLogEntry
  | GameEndLogEntry
  | SectorBonusLogEntry
  | ResignLogEntry

type PlayerRankingSummary = {
  userId: string
  position: number
  isWinner: boolean
  eliminated: boolean
  territories: number
  armies: number
  eliminationOrder: number | null
}

type PersistedBattleLogRow = {
  entry_type: 'BATTLE' | 'ENGAGEMENT_SUMMARY'
  job_id: string | null
  engagement_id: string | null
  entry_timestamp: Date | string
  turn_number: number
  attacking_territory_id: string | null
  defending_territory_id: string | null
  attacker_id: string | null
  defender_id: string | null
  attacker_losses: number | null
  defender_losses: number | null
  conquered: boolean | null
  moved_armies: number | null
  eliminated_players: unknown
  initial_from_armies: number | null
  initial_to_armies: number | null
  total_attacker_losses: number | null
  total_defender_losses: number | null
  metadata: Record<string, unknown> | null
}

type BattleInsertRow = {
  game_id: string
  entry_type: 'BATTLE' | 'ENGAGEMENT_SUMMARY'
  job_id: string | null
  engagement_id: string | null
  entry_timestamp: Date
  turn_number: number
  attacking_territory_id: string | null
  defending_territory_id: string | null
  attacker_id: string | null
  defender_id: string | null
  attacker_losses: number | null
  defender_losses: number | null
  conquered: boolean | null
  moved_armies: number | null
  eliminated_players: string[]
  initial_from_armies: number | null
  initial_to_armies: number | null
  total_attacker_losses: number | null
  total_defender_losses: number | null
  metadata: Record<string, unknown>
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

  private async persistGameStateSnapshot(
    roomId: string,
    state: SerializedGameState,
  ): Promise<void> {
    try {
      await query(
        `
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `,
        [
          roomId,
          JSON.stringify(state),
          state.turn ?? 1,
          state.currentPlayer ?? null,
          state.phase ?? 'deployment',
        ],
      )
    } catch (error) {
      logger.error('Failed to persist game state snapshot to database', {
        roomId,
        phase: state.phase,
        turn: state.turn,
        error: error instanceof Error ? error.message : error,
      })
    }

    try {
      await gameStateCache.setGameState(roomId, state)
    } catch (error) {
      logger.warn('Failed to cache game state snapshot', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Persist snapshot using an existing database client (to be used inside a transaction).
   * Mirrors the upsert logic used elsewhere, but avoids opening a nested transaction.
   */
  private async persistGameStateSnapshotWithClient(
    run: (text: string, values?: unknown[]) => Promise<unknown>,
    roomId: string,
    state: SerializedGameState,
  ): Promise<void> {
    await run(
      `
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
      `,
      [
        roomId,
        JSON.stringify(state),
        Math.max(1, Number(state.turn ?? 1)),
        state.currentPlayer ?? null,
        state.phase ?? 'reinforcement',
      ],
    )
  }

  /**
   * Persist the serialized game state and room turn indicators in a single transaction.
   * This reduces round-trips and keeps row-level updates consistent.
   */
  private async persistTurnStateTransactional(
    roomId: string,
    serialized: SerializedGameState,
  ): Promise<void> {
    await transaction(async (client) => {
      // Upsert latest state view
      await client.query(
        `
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `,
        [
          roomId,
          JSON.stringify(serialized),
          Math.max(1, Number(serialized.turn ?? 1)),
          serialized.currentPlayer ?? null,
          serialized.phase ?? 'reinforcement',
        ],
      )

      // Persist DB view of turn + actor for room-level queries/UI
      await client.query(
        `UPDATE game_rooms SET current_turn_user_id = $2, turn_number = $3 WHERE id = $1`,
        [roomId, serialized.currentPlayer, serialized.turn],
      )

      // Immutable per-turn snapshot (best-effort; keep inside tx to avoid duplicate phase markers)
      const turn = Math.max(1, Number(serialized.turn ?? 1))
      const phase = String(serialized.phase ?? 'reinforcement')
      await client.query(
        `INSERT INTO game_state_snapshots (room_id, turn_number, phase, snapshot)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (room_id, turn_number, phase) DO NOTHING`,
        [roomId, turn, phase, JSON.stringify(serialized)],
      )
    })
  }

  // Expose safe wrapper for other services to persist a full snapshot
  async saveSnapshot(roomId: string, state: SerializedGameState): Promise<void> {
    await this.persistGameStateSnapshot(roomId, state)
  }

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
    return this.hydrateGameState(structuredClone(serialized), state.roomId)
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

  private recordAssassinationAssignments(roomId: string, gameState: GameState) {
    if (gameState.gameConfig?.gameMode !== 'assassination') {
      return
    }

    const assignments = gameState.assassinationTargets
    if (!assignments || Object.keys(assignments).length === 0) {
      return
    }

    assassinationMetrics.recordAssignments(roomId, assignments, 0)
  }

  private recordAssassinationElimination(
    roomId: string,
    gameState: GameState,
    elimination: { gameEnded: boolean; winner: GamePlayer | null; eliminatedPlayers: string[] },
    eliminatorId: string | null,
    cause: 'battle' | 'neutralize',
  ) {
    if (
      gameState.gameConfig?.gameMode !== 'assassination' ||
      !elimination.gameEnded ||
      !elimination.winner ||
      !gameState.assassinationTargets
    ) {
      return
    }

    const hunterId = elimination.winner.id
    const targetId = gameState.assassinationTargets[hunterId]

    if (!targetId || !elimination.eliminatedPlayers.includes(targetId)) {
      return
    }

    const resolvedEliminator = eliminatorId ?? 'system'
    let resolution: 'direct' | 'collateral' | 'resignation' | 'self_eliminated' | 'system'

    if (cause === 'neutralize') {
      resolution = 'resignation'
    } else if (resolvedEliminator === hunterId) {
      resolution = 'direct'
    } else if (resolvedEliminator === targetId) {
      resolution = 'self_eliminated'
    } else if (resolvedEliminator === 'system') {
      resolution = 'system'
    } else {
      resolution = 'collateral'
    }

    assassinationMetrics.recordElimination({
      gameId: roomId,
      hunterId,
      targetId,
      eliminatorId: resolvedEliminator,
      turnNumber: gameState.turn ?? 0,
      resolution,
    })
  }

  private async emitTurnStartEvent(
    roomId: string,
    state: GameState,
    reinforcementHint?: number | null,
  ): Promise<void> {
    if (!state || state.phase === 'finished') return
    const nextPlayerId = state.currentPlayer
    if (!nextPlayerId) return

    try {
      const io = tryGetSocketServer()
      if (!io) return

      const nextPlayer = state.players.find((player) => player.id === nextPlayerId)
      const turnNumber = Math.max(1, Math.trunc(state.turn ?? 1))

      let reinforcementArmies: number | null = null
      if (state.phase === 'reinforcement') {
        try {
          const computed =
            typeof reinforcementHint === 'number'
              ? reinforcementHint
              : this.gameEngine.calculateBaseReinforcementArmies(state, nextPlayerId)
          reinforcementArmies = Math.max(0, Math.trunc(computed ?? 0))
        } catch (error) {
          logger.warn('Failed to compute reinforcement armies for turn:start event', {
            roomId,
            playerId: nextPlayerId,
            error: error instanceof Error ? error.message : error,
          })
          reinforcementArmies = null
        }
      }

      io.to(`game:${roomId}`).emit('turn:start', {
        roomId,
        playerId: nextPlayerId,
        username: nextPlayer?.username ?? null,
        phase: state.phase,
        turn: turnNumber,
        reinforcementArmies,
      })
    } catch (error) {
      logger.warn('Failed to emit turn:start event', {
        roomId,
        playerId: state.currentPlayer,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private hydrateGameState(state: GameState | SerializedGameState, roomId?: string): GameState {
    const normalizedState =
      roomId && (!state.roomId || typeof state.roomId !== 'string') ? { ...state, roomId } : state

    if (
      normalizedState.territoryModifiers &&
      !(normalizedState.territoryModifiers instanceof Map)
    ) {
      const modifierMap = new Map<string, GameTerritoryModifier>(
        Object.entries(normalizedState.territoryModifiers),
      )

      return {
        ...normalizedState,
        territoryModifiers: modifierMap,
      }
    }

    return normalizedState as GameState
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

    const hydrated = this.hydrateGameState(cachedState, roomId)
    const currentPlayer = hydrated.players.find((player) => player.id === hydrated.currentPlayer)

    if (!currentPlayer) {
      throw new Error('Current player not found')
    }

    logger.info('Executing AI turn', {
      roomId,
      playerId: currentPlayer.id,
      difficulty: currentPlayer.aiDifficulty ?? 'recruit',
    })

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

    logger.info('AI decision plan', {
      roomId,
      playerId: currentPlayer.id,
      plan: {
        actions: decisionPlan.actions.map((a) => a.type),
        usedFallback: decisionPlan.usedFallback,
        reason: decisionPlan.reason,
        diagnostics: decisionPlan.diagnostics,
      },
    })

    const baselineState = this.cloneGameState(hydrated)
    const planResult = await this.applyActions(
      baselineState,
      decisionPlan.actions,
      currentPlayer.id,
    )

    logger.info('AI plan application result', {
      roomId,
      playerId: currentPlayer.id,
      success: planResult.success,
    })

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
      logger.warn('AI plan application failed, using fallback', {
        roomId,
        playerId: currentPlayer.id,
      })
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
        logger.error('Failed to apply fallback plan for AI turn', {
          roomId,
          playerId: currentPlayer.id,
        })
        throw new Error('Failed to apply fallback plan for AI turn')
      }
      finalState = fallbackResult.gameState
      appliedActions = fallbackResult.applied
      fallbackUsed = true
      fallbackReason = fallbackReason ?? 'invalid_plan'
    }

    await this.persistGameStateSnapshot(roomId, this.serializeGameState(finalState))

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

    if (
      finalState.phase !== 'finished' &&
      finalState.phase === 'reinforcement' &&
      finalState.currentPlayer !== hydrated.currentPlayer
    ) {
      await this.emitTurnStartEvent(roomId, finalState)
    }

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

    const gameState = this.hydrateGameState(rawState, roomId)
    const normalizedId = typeof territoryId === 'number' ? territoryId.toString() : territoryId
    const territory = gameState.board.find((entry) => entry.id === normalizedId)

    return territory?.isCapital === true
  }

  async processGameAction(action: GameAction, userId: string): Promise<GameState> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(action.roomId)

    if (!cachedState) {
      throw new Error('Game not found')
    }

    const gameState = this.hydrateGameState(cachedState, action.roomId)
    const previousPlayerId = gameState.currentPlayer

    if (!this.isValidAction(action, userId, gameState)) {
      throw new Error('Invalid action')
    }

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await this.persistGameStateSnapshot(action.roomId, this.serializeGameState(updatedState))

    if (
      updatedState.phase !== 'finished' &&
      updatedState.phase === 'reinforcement' &&
      updatedState.currentPlayer !== previousPlayerId
    ) {
      await this.emitTurnStartEvent(action.roomId, updatedState)
    }

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
    // Ensure sector bonuses are present in config (for UI and calculations)
    if (!config.sectorBonuses || config.sectorBonuses.length === 0) {
      config.sectorBonuses = loaded.sectorBonuses
    }

    const gameState = this.gameEngine.initializeGame(roomId, players, config, {
      territories: loaded.territories,
      sectorBonuses: loaded.sectorBonuses,
    })

    try {
      const crypto = await import('node:crypto')
      const seed = crypto.randomBytes(16).toString('hex')
      const seedStr = `sfc32:${seed}`
      gameState.combatRngSeed = seedStr
      try {
        const entry: RngLogEntry = {
          type: 'RNG',
          timestamp: new Date().toISOString(),
          scope: 'combat',
          algorithm: 'sfc32',
          seed: seedStr,
        }
        await this.appendLog(roomId, [entry])
      } catch (logErr) {
        logger.debug('Skipped RNG seed appendLog', {
          roomId,
          error: logErr instanceof Error ? logErr.message : logErr,
        })
      }
    } catch (e) {
      logger.warn('Failed to initialize or log combat RNG seed', {
        roomId,
        error: e instanceof Error ? e.message : e,
      })
    }

    // Initialize territory modifiers if enabled
    if (config.useTerritoryModifiers) {
      const territoryIds = gameState.board.map((t) => t.id)
      await territoryModifierService.initializeGameModifiers(roomId, config.mapId, territoryIds)

      // Load modifiers into game state
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      gameState.territoryModifiers = modifiers
    }

    // Cache the game state with TTL for automatic cleanup (24 hours)
    await this.persistGameStateSnapshot(roomId, this.serializeGameState(gameState))

    this.recordAssassinationAssignments(roomId, gameState)

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

  async neutralizePlayerAndResolve(
    roomId: string,
    userId: string,
  ): Promise<{
    state: SerializedGameState
    elimination: { gameEnded: boolean; winner: GamePlayer | null; eliminatedPlayers: string[] }
  } | null> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) {
      return null
    }

    let gameState = this.hydrateGameState(cachedState, roomId)
    const previousCurrentPlayer = gameState.currentPlayer
    const targetPlayer = gameState.players.find((player) => player.id === userId)

    if (targetPlayer) {
      for (const territory of gameState.board) {
        if (territory.ownerId === userId) {
          territory.ownerId = 'neutral'
        }
      }

      targetPlayer.territories = []
      targetPlayer.armies = 0
      targetPlayer.treasures = []
      targetPlayer.mustCashInTreasures = false
    }

    let elimination = this.gameEngine.checkGameEnd(gameState)

    if (!elimination.gameEnded && gameState.currentPlayer === userId) {
      const action: GameAction = {
        type: 'end_turn',
        roomId,
        playerId: userId,
      }

      const { gameState: advancedState } = await this.gameEngine.processAction(gameState, action)
      gameState = advancedState
      elimination = this.gameEngine.checkGameEnd(gameState)

      if (
        !elimination.gameEnded &&
        gameState.phase === 'reinforcement' &&
        gameState.currentPlayer !== previousCurrentPlayer
      ) {
        await this.emitTurnStartEvent(roomId, gameState)
      }
    }

    if (gameState.gameConfig?.gameMode === 'assassination') {
      this.recordAssassinationElimination(roomId, gameState, elimination, userId, 'neutralize')
    }

    const serializedState = this.serializeGameState(gameState)

    if (gameState.phase === 'finished' || elimination.gameEnded) {
      await gameStateCache.setInactiveGameState(roomId, serializedState)
      this.gameEngine.clearModifiersCache(roomId)
      // Also finalize archives/results and ratings when neutralize ends the game
      try {
        const playerStats = this.buildPlayerStats(gameState.players, gameState.board)
        // Load battle log for elimination order if present
        let battleLog: BattleLogEntry[] = []
        try {
          const entries = await this.fetchBattleLogEntries(roomId)
          battleLog = entries.filter((entry): entry is BattleLogEntry =>
            this.isBattleLogEntry(entry),
          )
        } catch (e) {
          logger.warn('Failed to load battle log before neutralize finalization', {
            roomId,
            error: e instanceof Error ? e.message : e,
          })
        }

        const finalization = await this.finalizeCompletedGame(
          roomId,
          serializedState,
          gameState.players,
          playerStats,
          battleLog,
        )

        if (finalization.archived) {
          // Emit a canonical GAME_END delta to the room
          try {
            const io = tryGetSocketServer()
            if (io) {
              const winnerId =
                finalization.playerRankings.find((r) => r.isWinner)?.userId ||
                (serializedState.currentPlayer ?? '')
              const eliminated = finalization.playerRankings
                .filter((r) => r.eliminated)
                .map((r) => r.userId)
              const delta = DeltaBuilder.gameEnd(
                roomId,
                winnerId,
                eliminated,
                (serializedState as { version?: number }).version,
              )
              io.to(`game:${roomId}`).emit('game-delta', delta)
              try {
                const { deltaBufferService } = await import('./deltaBufferService.js')
                const deltas: GameDelta[] = [delta]
                await deltaBufferService.append(roomId, deltas)
              } catch {
                // best-effort
              }
            }
          } catch (e) {
            logger.warn('Failed to emit GAME_END delta after neutralize', {
              roomId,
              error: e instanceof Error ? e.message : e,
            })
          }
          await this.awardClanContributions(roomId, finalization.playerRankings)
          try {
            const { achievementService } = await import('./achievementService.js')
            const minimal = finalization.playerRankings.map((r) => ({
              userId: r.userId,
              isWinner: r.isWinner,
              eliminated: r.eliminated,
            }))
            await achievementService.handleGameCompleted(roomId, minimal)
          } catch (e) {
            logger.warn('Failed to process achievements after neutralize completion', {
              roomId,
              error: e instanceof Error ? e.message : e,
            })
          }
        }
      } catch (e) {
        logger.error('Failed to finalize game after neutralize', {
          roomId,
          error: e instanceof Error ? e.message : e,
        })
      }
    } else {
      await this.persistGameStateSnapshot(roomId, serializedState)
    }

    return { state: serializedState, elimination }
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    // Try Redis cache first
    let cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)

    // If not in cache, try to load from database
    if (!cachedState) {
      try {
        const dbResult = await query<{ game_data: unknown | null }>(
          'SELECT game_data FROM game_states WHERE room_id = $1',
          [roomId],
        )

        if (dbResult.rows.length > 0 && dbResult.rows[0].game_data != null) {
          const raw = dbResult.rows[0].game_data
          if (typeof raw === 'string') {
            cachedState = JSON.parse(raw) as SerializedGameState
          } else if (typeof raw === 'object') {
            // pg returns JSON/JSONB as objects by default
            cachedState = raw as SerializedGameState
          } else {
            throw new Error('game_data has unexpected type')
          }

          // Repopulate cache for next time
          await this.persistGameStateSnapshot(roomId, cachedState)
          logger.info('Loaded game state from database and repopulated cache', { roomId })
        } else {
          // No game state found - this is expected for rooms that haven't started yet
          return null
        }
      } catch (error) {
        // Only log as error if it's a real database/parsing error, not just missing data
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.warn('Error loading game state from database', { roomId, error: errorMessage })
        return null
      }
    }

    const hydratedState = this.hydrateGameState(cachedState, roomId)

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
    const gameState = this.hydrateGameState(cachedState, roomId)
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
    const serialized = this.serializeGameState(updatedState)
    await this.persistTurnStateTransactional(roomId, serialized)
    await gameStateCache.setGameState(roomId, serialized)

    return {
      gameState: serialized,
      territoryId,
      armies: updatedState.board.find((t) => t.id === territoryId)?.armies || 0,
    }
  }

  /**
   * Test-friendly, synchronous attack helper.
   * Production traffic uses Socket.io + applyBattleResult; this method exists
   * primarily for unit/integration tests that spy on dice rolls and assert
   * assassination telemetry.
   */
  async attack(
    roomId: string,
    userId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
  ): Promise<{
    gameEnded: boolean
    winner: GamePlayer | null
    eliminatedPlayers: string[]
  }> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')

    const gameState = this.hydrateGameState(cachedState, roomId)

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

    // Persist snapshot for consistency with other paths
    await this.persistGameStateSnapshot(roomId, this.serializeGameState(updatedState))

    // Record assassination telemetry when applicable (mirrors neutralize flow)
    if (updatedState.gameConfig?.gameMode === 'assassination') {
      const elimination = {
        gameEnded: Boolean(battleResult?.gameEnded),
        winner: (battleResult?.winner as GamePlayer | null) ?? null,
        eliminatedPlayers: (battleResult?.eliminatedPlayers as string[] | undefined) ?? [],
      }
      if (elimination.gameEnded) {
        this.recordAssassinationElimination(roomId, updatedState, elimination, userId, 'battle')
      }
    }

    return {
      gameEnded: Boolean(battleResult?.gameEnded),
      winner: (battleResult?.winner as GamePlayer | null) ?? null,
      eliminatedPlayers: (battleResult?.eliminatedPlayers as string[] | undefined) ?? [],
    }
  }

  // Note: direct HTTP attack entry is intentionally not exposed.
  // Attacks are handled via Socket.io (see socketService.ts), which routes
  // through queued or inline processing and applies results via applyBattleResult.

  async transferConquestArmies(
    roomId: string,
    userId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ): Promise<{
    gameState: SerializedGameState
    fromArmies: number
    toArmies: number
  }> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')

    const gameState = this.hydrateGameState(cachedState, roomId)

    if (gameState.currentPlayer !== userId) {
      throw new Error('Not your turn')
    }

    if (gameState.phase !== 'attack') {
      throw new Error('Can only transfer conquest armies during attack phase')
    }

    const updatedState = this.gameEngine.transferConquestArmies(
      gameState,
      userId,
      fromTerritoryId,
      toTerritoryId,
      armies,
    )

    const serialized = this.serializeGameState(updatedState)
    await this.persistTurnStateTransactional(roomId, serialized)
    await gameStateCache.setGameState(roomId, serialized)

    const fromTerritory = updatedState.board.find((territory) => territory.id === fromTerritoryId)
    const toTerritory = updatedState.board.find((territory) => territory.id === toTerritoryId)

    return {
      gameState: serialized,
      fromArmies: fromTerritory?.armies ?? 0,
      toArmies: toTerritory?.armies ?? 0,
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
    const gameState = this.hydrateGameState(cachedState, roomId)
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
    const serialized = this.serializeGameState(updatedState)
    await this.persistTurnStateTransactional(roomId, serialized)
    await gameStateCache.setGameState(roomId, serialized)

    return {
      gameState: serialized,
      fromTerritoryId,
      toTerritoryId,
      fromArmies: updatedState.board.find((t) => t.id === fromTerritoryId)?.armies || 0,
      toArmies: updatedState.board.find((t) => t.id === toTerritoryId)?.armies || 0,
    }
  }

  async endTurn(
    roomId: string,
    userId: string,
    options?: { allowEarlyEnd?: boolean; endedByTimeout?: boolean },
  ) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')

    // Prevent advancing out of reinforcement phase while reinforcements remain (manual only)
    if (gameState.phase === 'reinforcement' && !(options?.allowEarlyEnd === true)) {
      const current = gameState.players.find((p) => p.id === userId)
      const remaining = Math.max(0, Math.trunc(current?.armies ?? 0))
      if (remaining > 0) {
        throw new Error(`You still have ${remaining} reinforcements to place`)
      }
    }

    const previousPlayerId = gameState.currentPlayer
    const previousTurnNumber = Math.max(1, Math.trunc(gameState.turn ?? 1))
    const previousPhase = gameState.phase
    // Keep snapshot of previous player's treasure hand to detect awards
    const previousPlayer = gameState.players.find((p) => p.id === previousPlayerId)
    const prevTreasures = previousPlayer?.treasures
    const prevHand = Array.isArray(prevTreasures) ? [...prevTreasures] : []

    const updatedState = this.gameEngine.advancePhase(gameState)
    // Enforce invariants post-mutation
    try {
      assertInvariants(updatedState)
    } catch (e) {
      logger.warn('Invariant violation after endTurn; proceeding to persist for visibility', {
        roomId,
        error: e instanceof Error ? e.message : e,
      })
    }

    // Use longer TTL for finished games
    if (updatedState.phase === 'finished') {
      const finalSerialized = this.serializeGameState(updatedState)
      // Cache inactive state first for fast reads
      await gameStateCache.setInactiveGameState(roomId, finalSerialized)
      // Persist state + room indicators + immutable snapshot atomically
      await this.persistTurnStateTransactional(roomId, finalSerialized)
    } else {
      const serialized = this.serializeGameState(updatedState)
      // Persist state + room indicators + immutable snapshot atomically
      await this.persistTurnStateTransactional(roomId, serialized)
      // Also populate cache for subsequent reads
      await gameStateCache.setGameState(roomId, serialized)
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
    let treasureAwarded: import('../types/game.js').Metal | undefined
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
            treasureAwarded = m as import('../types/game.js').Metal
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

    const turnAdvanced =
      updatedState.phase === 'finished' || updatedState.currentPlayer !== previousPlayerId

    if (turnAdvanced && updatedState.phase !== 'finished') {
      await this.emitTurnStartEvent(roomId, updatedState, reinforcementArmies)
    }

    // Append TURN logs + per-turn stats snapshot for analytics
    if (turnAdvanced) {
      const now = new Date().toISOString()
      const entries: GameLogEntry[] = []
      const endEvent: TurnLogEntry = {
        type: 'TURN',
        timestamp: now,
        playerId: previousPlayerId,
        event: options?.endedByTimeout ? 'MISSED' : 'END',
        turnNumber: previousTurnNumber,
        ...(options?.endedByTimeout ? { reason: 'timeout' as const } : {}),
      }
      entries.push(endEvent)
      if (treasureAwarded) {
        entries.push({
          type: 'TREASURE',
          timestamp: now,
          userId: previousPlayerId,
          metal: treasureAwarded,
        })
      }

      const stats = this.buildTurnStatsSnapshot(updatedState)

      try {
        const bulkJobs: Array<{ event: string; gameId: string; data: unknown }> = [
          { event: 'append_log', gameId: roomId, data: entries },
          { event: 'append_turn_stats', gameId: roomId, data: stats },
        ]
        const added = await queueService.addAnalyticsEventsBulk?.(bulkJobs)
        if (!added) {
          // Queue unavailable: best-effort async write
          setImmediate(() => {
            this.appendLog(roomId, entries).catch(() => {
              /* no-op */
            })
          })
          setImmediate(() => {
            this.appendTurnStats(roomId, stats).catch(() => {
              /* no-op */
            })
          })
        }
      } catch {
        // Fallback to direct writes on any error
        setImmediate(() => {
          this.appendLog(roomId, entries).catch(() => {
            /* no-op */
          })
        })
        setImmediate(() => {
          this.appendTurnStats(roomId, stats).catch(() => {
            /* no-op */
          })
        })
      }
    }

    // Finalize game if this transition ended it outside of battle flow
    try {
      if (updatedState.phase === 'finished' && previousPhase !== 'finished') {
        const finalSerialized = this.serializeGameState(updatedState)
        const playerStats = this.buildPlayerStats(updatedState.players, updatedState.board)
        // Load latest battle log; filter to battle entries for elimination order
        let battleLog: BattleLogEntry[] = []
        try {
          const entries = await this.fetchBattleLogEntries(roomId)
          battleLog = entries.filter((entry): entry is BattleLogEntry =>
            this.isBattleLogEntry(entry),
          )
        } catch (e) {
          logger.warn('Failed to load battle log before finalization', {
            roomId,
            error: e instanceof Error ? e.message : e,
          })
        }

        const finalization = await this.finalizeCompletedGame(
          roomId,
          finalSerialized,
          updatedState.players,
          playerStats,
          battleLog,
        )

        // Post-archive follow-ups (achievements, clan XP) mirror battle path
        if (finalization.archived) {
          // Emit a canonical GAME_END delta + fog-aware text in a single sweep
          try {
            const io = tryGetSocketServer()
            if (io) {
              const winnerId =
                finalization.playerRankings.find((r) => r.isWinner)?.userId ||
                (updatedState.currentPlayer ?? '')
              const eliminated = finalization.playerRankings
                .filter((r) => r.eliminated)
                .map((r) => r.userId)
              const delta = DeltaBuilder.gameEnd(
                roomId,
                winnerId,
                eliminated,
                (finalSerialized as { version?: number }).version,
              )
              const { emitCombined } = await import('./realtimeEmitter.js')
              const { createGameEndMoves } = await import('./logEmitter.js')
              const moves = createGameEndMoves(roomId, updatedState, winnerId, eliminated)
              await emitCombined(io, roomId, { deltas: [delta], moves }, updatedState)
            }
          } catch (e) {
            logger.warn('Failed to emit GAME_END delta on endTurn', {
              roomId,
              error: e instanceof Error ? e.message : e,
            })
          }
          await this.awardClanContributions(roomId, finalization.playerRankings)
          try {
            const { achievementService } = await import('./achievementService.js')
            const minimal = finalization.playerRankings.map((r) => ({
              userId: r.userId,
              isWinner: r.isWinner,
              eliminated: r.eliminated,
            }))
            await achievementService.handleGameCompleted(roomId, minimal)
          } catch (e) {
            logger.warn('Failed to process achievements after game completion', {
              roomId,
              error: e instanceof Error ? e.message : e,
            })
          }
        }
      }
    } catch (e) {
      logger.error('Failed to finalize game on endTurn', {
        roomId,
        error: e instanceof Error ? e.message : e,
      })
    }

    return {
      gameState: this.serializeGameState(updatedState),
      reinforcementArmies,
      treasureAwarded,
      turnAdvanced,
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
  ): Promise<{
    armies: number
    playerArmies?: number
    phaseChanged?: {
      phase: GamePhase
      currentPlayer: string
      turn: number
      reinforcementArmies?: number
    }
  }> {
    // Wrap entire operation in database transaction for atomicity
    let emitted: GameLogEntry[] = []
    const result = await transaction(async (client) => {
      const gameState = await this.getGameState(gameId)
      if (!gameState) throw new Error('Game not found')

      if (gameState.currentPlayer !== data.playerId || gameState.phase !== 'reinforcement') {
        throw new Error('Invalid placement phase or player')
      }

      const territoryBefore = gameState.board.find((t) => t.id === data.territoryId)
      if (!territoryBefore) throw new Error('Territory not found')

      const action: GameAction = {
        type: 'deploy',
        roomId: gameId,
        playerId: data.playerId,
        payload: { territoryId: data.territoryId, armies: data.armies },
      }

      if (!this.gameEngine.validateAction(gameState, action)) {
        throw new Error('Invalid deployment')
      }

      const previousPhase = gameState.phase
      const previousPlayerArmies =
        gameState.players.find((p) => p.id === data.playerId)?.armies ?? 0

      const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)

      const updatedTerritory = updatedState.board.find((t) => t.id === data.territoryId)
      const playerAfter = updatedState.players.find((p) => p.id === data.playerId)

      const serializedState = this.serializeGameState(updatedState)

      // Persist state within transaction (DRY helper)
      await this.persistGameStateSnapshotWithClient(
        client.query.bind(client),
        gameId,
        serializedState,
      )

      // Update cache (outside critical path, best-effort)
      try {
        await gameStateCache.setGameState(gameId, serializedState)
      } catch (error) {
        logger.warn('Failed to cache game state during deployment', {
          gameId,
          error: error instanceof Error ? error.message : error,
        })
      }

      const beforeArmies = territoryBefore.armies
      const afterArmies = updatedTerritory?.armies ?? beforeArmies
      const delta = afterArmies - beforeArmies

      // Append log (structured entry for transformation → textual moves)
      if (delta !== 0) {
        const entry: ReinforceLogEntry = {
          type: 'REINFORCE',
          timestamp: new Date().toISOString(),
          playerId: data.playerId,
          territoryId: data.territoryId,
          armies: delta,
          remainingArmies: Math.max(0, playerAfter?.armies ?? 0),
        }
        emitted = [entry]
      }

      let phaseChanged:
        | { phase: GamePhase; currentPlayer: string; turn: number; reinforcementArmies?: number }
        | undefined
      if (previousPhase !== updatedState.phase) {
        phaseChanged = {
          phase: updatedState.phase,
          currentPlayer: updatedState.currentPlayer,
          turn: updatedState.turn,
          reinforcementArmies: undefined,
        }
      }

      return {
        armies: afterArmies,
        playerArmies: playerAfter?.armies ?? previousPlayerArmies,
        phaseChanged,
        version: updatedState.version,
      }
    })
    // Persist + emit appended reinforce log if any
    try {
      if (emitted.length > 0) {
        const io = tryGetSocketServer()
        if (io) {
          try {
            const { emitFogAwareForEntries, persistFogAwareForEntries } = await import(
              './logEmitter.js'
            )
            const fogEntries: Array<Record<string, unknown>> = emitted.map((entry) => ({
              ...entry,
            }))
            await persistFogAwareForEntries(gameId, fogEntries)
            await emitFogAwareForEntries(io, gameId, fogEntries)
          } catch {
            /* ignore fog-aware emission errors */
          }
        }
      }
    } catch {
      /* ignore emit errors */
    }
    return result
  }

  async processFortify(
    gameId: string,
    data: { fromTerritoryId: string; toTerritoryId: string; armies: number; playerId: string },
  ): Promise<{ fromArmies: number; toArmies: number }> {
    // Wrap entire operation in database transaction for atomicity
    let emitted: GameLogEntry[] = []
    const result = await transaction(async (client) => {
      const cachedState = await gameStateCache.getGameState<SerializedGameState>(gameId)
      if (!cachedState) throw new Error('Game not found')
      const gameState = this.hydrateGameState(cachedState, gameId)
      if (gameState.currentPlayer !== data.playerId) throw new Error('Not your turn')
      if (gameState.phase !== 'fortify') throw new Error('Not fortify phase')

      const action: GameAction = {
        type: 'fortify',
        roomId: gameId,
        playerId: data.playerId,
        payload: {
          fromTerritoryId: data.fromTerritoryId,
          toTerritoryId: data.toTerritoryId,
          armies: data.armies,
        },
      }

      if (!this.gameEngine.validateAction(gameState, action)) {
        throw new Error('Invalid fortification')
      }

      const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)

      const serializedState = this.serializeGameState(updatedState)

      // Persist state within transaction (DRY helper)
      await this.persistGameStateSnapshotWithClient(
        client.query.bind(client),
        gameId,
        serializedState,
      )

      // Update cache (outside critical path, best-effort)
      try {
        await gameStateCache.setGameState(gameId, serializedState)
      } catch (error) {
        logger.warn('Failed to cache game state during fortify', {
          gameId,
          error: error instanceof Error ? error.message : error,
        })
      }

      const fromArmies = updatedState.board.find((t) => t.id === data.fromTerritoryId)?.armies || 0
      const toArmies = updatedState.board.find((t) => t.id === data.toTerritoryId)?.armies || 0

      // Append log (structured entry for transformation → textual moves)
      const entry: FortifyLogEntry = {
        type: 'FORTIFY',
        timestamp: new Date().toISOString(),
        playerId: data.playerId,
        fromTerritoryId: data.fromTerritoryId,
        toTerritoryId: data.toTerritoryId,
        movedArmies: data.armies,
        fromArmies,
        toArmies,
      }
      emitted = [entry]
      return {
        fromArmies,
        toArmies,
        version: updatedState.version,
      }
    })
    try {
      if (emitted.length > 0) {
        const io = tryGetSocketServer()
        if (io) {
          try {
            const { emitFogAwareForEntries, persistFogAwareForEntries } = await import(
              './logEmitter.js'
            )
            const fogEntries: Array<Record<string, unknown>> = emitted.map((entry) => ({
              ...entry,
            }))
            await persistFogAwareForEntries(gameId, fogEntries)
            await emitFogAwareForEntries(io, gameId, fogEntries)
          } catch {
            /* ignore fog-aware emission errors */
          }
        }
      }
    } catch {
      /* ignore emit errors */
    }
    return result
  }

  async processEndTurn(gameId: string, playerId: string): Promise<{ id: string }> {
    const result = await this.endTurn(gameId, playerId)
    return { id: result.gameState.currentPlayer }
  }

  async acknowledgeTurnStart(
    roomId: string,
    userId: string,
  ): Promise<{ logged: boolean; reinforcementArmies: number; turnNumber: number }> {
    const state = await this.getGameState(roomId)
    if (!state) throw new Error('Game not found')
    if (state.currentPlayer !== userId) throw new Error('Not your turn')
    if (state.phase === 'finished') {
      return {
        logged: false,
        reinforcementArmies: 0,
        turnNumber: Math.max(1, Math.trunc(state.turn ?? 1)),
      }
    }

    const turnNumber = Math.max(1, Math.trunc(state.turn ?? 1))
    const reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(state, userId)
    const territoryCount = state.board.filter((t) => t.ownerId === userId).length
    let logged = false
    let appended: GameLogEntry[] = []
    // Build entries without touching legacy storage; battle log persistence handled separately
    {
      const entry: TurnLogEntry = {
        type: 'TURN',
        timestamp: new Date().toISOString(),
        playerId: userId,
        event: 'START',
        reinforcementArmies,
        territoryCount,
        turnNumber,
      }

      // Compute sector bonuses for detailed logging (non-fog breakdown aid)
      const sectorEntries: SectorBonusLogEntry[] = (() => {
        try {
          const cfg = state.gameConfig
          const bonuses = cfg.sectorBonuses || []
          if (Array.isArray(bonuses) && bonuses.length > 0) {
            const owned = new Set(state.board.filter((t) => t.ownerId === userId).map((t) => t.id))
            const list: SectorBonusLogEntry[] = []
            for (const b of bonuses) {
              const ownsAll = (b.territories || []).every((tid) => owned.has(tid))
              if (ownsAll && typeof b.bonusArmies === 'number' && b.bonusArmies > 0) {
                list.push({
                  type: 'SECTOR_BONUS',
                  timestamp: entry.timestamp,
                  playerId: userId,
                  sectorId: String(b.id || ''),
                  sectorName: String(b.name || b.id || 'sector'),
                  bonus: Math.trunc(b.bonusArmies),
                })
              }
            }
            return list
          }
        } catch {
          /* ignore bonus calc errors */
        }
        return []
      })()

      logged = true
      appended = [entry, ...sectorEntries]
    }
    // Emit appended TURN/SECTOR logs if any
    if (logged && appended.length > 0) {
      try {
        const io = tryGetSocketServer()
        if (io) {
          try {
            const { emitFogAwareForEntries, persistFogAwareForEntries, emitAndPersistRoundStart } =
              await import('./logEmitter.js')
            const fogEntries: Array<Record<string, unknown>> = appended.map((entry) => ({
              ...entry,
            }))
            await emitFogAwareForEntries(io, roomId, fogEntries)
            await persistFogAwareForEntries(roomId, fogEntries)
            // Round start banner when new round begins; de-duplicate if already emitted
            try {
              const activePlayers = Math.max(
                1,
                (state.players || []).filter((p) => !p.isEliminated).length ||
                  state.players.length ||
                  1,
              )
              const isRoundStart = ((turnNumber ?? 1) - 1) % activePlayers === 0
              if (isRoundStart) {
                const round = Math.max(1, Math.ceil((turnNumber ?? 1) / activePlayers))
                try {
                  const { query } = await import('../config/database.js')
                  const check = await query<{ n: string }>(
                    `SELECT COUNT(*)::text as n FROM game_logs WHERE game_id = $1 AND move_type = 'round_start' AND (payload->>'round')::int = $2`,
                    [roomId, round],
                  )
                  const seen = Number(check.rows[0]?.n || '0') > 0
                  if (!seen) {
                    await emitAndPersistRoundStart(io, roomId, round)
                  }
                } catch {
                  // if DB check fails, skip banner to avoid spam
                }
              }
            } catch {
              /* ignore round banner */
            }
          } catch {
            /* ignore fog-aware emission errors */
          }
        }
      } catch {
        /* ignore */
      }
    }

    return { logged, reinforcementArmies, turnNumber }
  }

  async processGoBackToReinforcement(
    gameId: string,
    playerId: string,
  ): Promise<{
    phase: GamePhase
    currentPlayer: string
    turn: number
    reinforcementArmies: number
    version?: number
  }> {
    const action: GameAction = {
      type: 'go_back_to_reinforcement',
      roomId: gameId,
      playerId,
    }

    const updatedState = await this.processGameAction(action, playerId)
    const currentPlayer = updatedState.players.find((p) => p.id === playerId)
    const reinforcementArmies = Math.max(0, currentPlayer?.armies ?? 0)

    return {
      phase: updatedState.phase,
      currentPlayer: updatedState.currentPlayer,
      turn: updatedState.turn,
      reinforcementArmies,
      version: updatedState.version,
    }
  }

  async processPhaseChange(gameId: string, playerId: string, phase: GamePhase): Promise<void> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    if (gameState.currentPlayer !== playerId) {
      throw new Error('Not your turn')
    }

    // Before switching away from attack phase, flush any open engagement summary (non-conquest)
    try {
      if (gameState.phase === 'attack' && phase !== 'attack') {
        const log = await this.fetchBattleLogEntries(gameId, { limit: 500 })
        const lastBattle = [...log].reverse().find((e) => (e?.type ?? 'BATTLE') === 'BATTLE') as
          | BattleLogEntry
          | undefined
        if (lastBattle && !lastBattle.conquered) {
          const engagementId: string = lastBattle.engagementId || lastBattle.jobId
          const engagementEntries = log.filter((e): e is BattleLogEntry => {
            if ((e?.type ?? 'BATTLE') !== 'BATTLE') return false
            const be = e as BattleLogEntry
            return (be.engagementId || be.jobId) === engagementId
          })
          const hasSummary = log.some(
            (e) =>
              e.type === 'ENGAGEMENT_SUMMARY' &&
              (e as EngagementSummaryLogEntry).engagementId === engagementId,
          )
          if (!hasSummary && engagementEntries.length > 0) {
            const first = engagementEntries[0]
            const totals = engagementEntries.reduce(
              (acc, cur) => {
                acc.attacker += cur.losses.attacker
                acc.defender += cur.losses.defender
                return acc
              },
              { attacker: 0, defender: 0 },
            )
            const summary: EngagementSummaryLogEntry = {
              type: 'ENGAGEMENT_SUMMARY',
              timestamp: new Date().toISOString(),
              engagementId,
              attackingTerritoryId: first.attackingTerritoryId,
              defendingTerritoryId: first.defendingTerritoryId,
              attackerId: first.attackerId,
              defenderId: first.defenderId,
              initialFromArmies: Math.max(0, first.initialFromArmies ?? 0),
              initialToArmies: Math.max(0, first.initialToArmies ?? 0),
              totalLosses: totals,
              conquered: false,
            }
            await this.appendLog(gameId, [summary])
            try {
              await withClient(async (client) => {
                await this.persistBattleLogEntries(
                  client,
                  gameId,
                  [summary],
                  Math.max(1, gameState.turn ?? 1),
                )
              })
            } catch (persistError) {
              logger.warn('Failed to persist engagement summary log on phase change', {
                gameId,
                phase,
                error: persistError instanceof Error ? persistError.message : persistError,
              })
            }
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to flush engagement summary on phase change', {
        gameId,
        phase,
        error: e instanceof Error ? e.message : e,
      })
    }

    gameState.phase = phase
    await this.persistGameStateSnapshot(gameId, this.serializeGameState(gameState))
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
      attackerArmiesBeforeRoll,
      defenderArmiesBeforeRoll,
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
    // Team-aware terminal detection: one side (team or solo) remaining ends the game
    let gameEnded = false
    let winner: GamePlayer | null = null
    if (activePlayers.length === 0) {
      gameEnded = true
      winner = null
    } else {
      const distinct = new Set<string>()
      for (const p of activePlayers) {
        const teamId = utilGetPlayerTeam(
          { ...gameState, players: playersAfterBattle } as GameState,
          p.id,
        )
        distinct.add(teamId ? `team:${teamId}` : `player:${p.id}`)
      }
      gameEnded = distinct.size <= 1
      winner = gameEnded ? (activePlayers[0] ?? null) : null
    }

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
      pendingConquestFor: territoryConquered ? attackerId : null,
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
      // Mark that at least one conquest occurred this turn so engine
      // can award exactly one treasure at end-of-turn.
      conqueredDuringTurn: (gameState.conqueredDuringTurn ?? false) || territoryConquered,
      phase: gameEnded ? 'finished' : gameState.phase,
      currentPlayer: gameEnded && winner ? winner.id : gameState.currentPlayer,
    }

    // Invariant guard after battle application
    try {
      assertInvariants(updatedGameState)
    } catch (e) {
      logger.warn('Invariant violation after applyBattleResult', {
        roomId: gameId,
        error: e instanceof Error ? e.message : e,
      })
    }

    let serializedState = this.serializeGameState(updatedGameState)
    const playerStats = this.buildPlayerStats(playersAfterBattle, updatedBoard)
    // Derive pre-roll initial stacks if caller didn't provide them
    const initialFrom =
      typeof attackerArmiesBeforeRoll === 'number'
        ? Math.max(0, attackerArmiesBeforeRoll)
        : Math.max(0, attackingArmiesRemaining + attackerLosses)
    const initialTo =
      typeof defenderArmiesBeforeRoll === 'number'
        ? Math.max(0, defenderArmiesBeforeRoll)
        : Math.max(0, defendingArmiesRemaining + defenderLosses)

    const logTimestamp = new Date().toISOString()

    let persistenceOutcome: { applied: boolean; divergence: number }
    let latestBattleLog: GameLogEntry[] = []
    let appended: GameLogEntry[] = []

    try {
      persistenceOutcome = await transaction(async (client) => {
        const existingStateResult = await client.query<{
          territories: Territory[] | null
          winner_id: string | null
        }>('SELECT territories, winner_id FROM game_states WHERE room_id = $1 FOR UPDATE', [gameId])

        const existingRow = existingStateResult.rows[0]
        const existingLog = await this.fetchBattleLogEntries(gameId, { client, limit: 500 })
        const divergence = this.calculateTerritoryDivergence(
          existingRow?.territories ?? null,
          updatedBoard,
        )

        const lastBattle = [...existingLog].reverse().find(this.isBattleLogEntry) as
          | BattleLogEntry
          | undefined

        const engagementId =
          lastBattle &&
          lastBattle.attackingTerritoryId === attackingTerritoryId &&
          lastBattle.defendingTerritoryId === defendingTerritoryId &&
          lastBattle.attackerId === attackerId &&
          (lastBattle.defenderId || null) === (defenderId || null) &&
          !lastBattle.conquered
            ? lastBattle.engagementId || lastBattle.jobId
            : this.createEngagementId(attackingTerritoryId, defendingTerritoryId)

        const logEntry: BattleLogEntry = {
          type: 'BATTLE',
          jobId,
          timestamp: logTimestamp,
          engagementId,
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
          initialFromArmies: initialFrom,
          initialToArmies: initialTo,
        }

        const alreadyApplied = existingLog.some(
          (entry) => this.isBattleLogEntry(entry) && entry.jobId === jobId,
        )
        if (alreadyApplied) {
          latestBattleLog = existingLog
          appended = []
          return { applied: false, divergence }
        }

        const lastEngagementId = lastBattle
          ? lastBattle.engagementId || lastBattle.jobId
          : undefined
        const startsNewEngagement =
          !lastBattle ||
          lastBattle.attackingTerritoryId !== attackingTerritoryId ||
          lastBattle.defendingTerritoryId !== defendingTerritoryId ||
          lastBattle.attackerId !== attackerId ||
          (lastBattle.defenderId || null) !== (defenderId || null)

        let preExtra: EngagementSummaryLogEntry[] = []
        if (startsNewEngagement && lastBattle && !lastBattle.conquered && lastEngagementId) {
          const engagementEntries = existingLog.filter(
            (entry): entry is BattleLogEntry =>
              this.isBattleLogEntry(entry) &&
              (entry.engagementId || entry.jobId) === lastEngagementId,
          )
          if (engagementEntries.length > 0) {
            const first = engagementEntries[0]
            const totals = engagementEntries.reduce(
              (acc, cur) => {
                acc.attacker += cur.losses.attacker
                acc.defender += cur.losses.defender
                return acc
              },
              { attacker: 0, defender: 0 },
            )
            preExtra = [
              {
                type: 'ENGAGEMENT_SUMMARY',
                timestamp: logTimestamp,
                engagementId: lastEngagementId,
                attackingTerritoryId: first.attackingTerritoryId,
                defendingTerritoryId: first.defendingTerritoryId,
                attackerId: first.attackerId,
                defenderId: first.defenderId,
                initialFromArmies: Math.max(0, first.initialFromArmies ?? 0),
                initialToArmies: Math.max(0, first.initialToArmies ?? 0),
                totalLosses: totals,
                conquered: false,
              },
            ]
          }
        }

        let extra: EngagementSummaryLogEntry[] = []
        if (logEntry.conquered) {
          const engagementEntries = [...existingLog, ...preExtra, logEntry].filter(
            (entry): entry is BattleLogEntry =>
              this.isBattleLogEntry(entry) && (entry.engagementId || entry.jobId) === engagementId,
          )
          const first = engagementEntries[0]
          const totals = engagementEntries.reduce(
            (acc, cur) => {
              acc.attacker += cur.losses.attacker
              acc.defender += cur.losses.defender
              return acc
            },
            { attacker: 0, defender: 0 },
          )
          if (first) {
            const summary: EngagementSummaryLogEntry = {
              type: 'ENGAGEMENT_SUMMARY',
              timestamp: logTimestamp,
              engagementId,
              attackingTerritoryId,
              defendingTerritoryId,
              attackerId,
              defenderId,
              initialFromArmies: Math.max(0, first.initialFromArmies ?? initialFrom),
              initialToArmies: Math.max(0, first.initialToArmies ?? initialTo),
              totalLosses: totals,
              conquered: true,
            }
            extra = [summary]
          }
        }

        const appendedEntries: GameLogEntry[] = [...preExtra, logEntry, ...extra]
        appended = appendedEntries
        latestBattleLog = [...existingLog, ...appendedEntries].slice(-500)
        const roundNumber = this.calculateRoundNumber(updatedGameState)

        await this.persistBattleLogEntries(
          client,
          gameId,
          appendedEntries,
          Math.max(1, serializedState.turn ?? updatedGameState.turn ?? 1),
        )

        await client.query(
          `INSERT INTO game_states (
            room_id,
            current_player_id,
            game_phase,
            turn_number,
            round_number,
            territories,
            player_stats,
            last_activity,
            winner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
          ON CONFLICT (room_id) DO UPDATE SET
            current_player_id = EXCLUDED.current_player_id,
            game_phase = EXCLUDED.game_phase,
            turn_number = EXCLUDED.turn_number,
            round_number = EXCLUDED.round_number,
            territories = EXCLUDED.territories,
            player_stats = EXCLUDED.player_stats,
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
      // Persist + emit appended battle log entries to subscribers
      try {
        if (appended.length > 0) {
          const io = tryGetSocketServer()
          if (io) {
            try {
              const { emitFogAwareForEntries, persistFogAwareForEntries } = await import(
                './logEmitter.js'
              )
              const fogEntries: Array<Record<string, unknown>> = appended.map((entry) => ({
                ...entry,
              }))
              // Persist textual equivalents in game_logs for backfill
              try {
                await persistFogAwareForEntries(gameId, fogEntries)
              } catch {
                /* persistence best-effort */
              }
              await emitFogAwareForEntries(io, gameId, fogEntries)
            } catch {
              /* ignore fog-aware emission errors */
            }
          }
        }
      } catch {
        /* ignore emit errors */
      }
      // If players were eliminated, transfer their treasures to the attacker now
      try {
        if (lastBattleResult.eliminatedPlayers && lastBattleResult.eliminatedPlayers.length > 0) {
          const cfg = normalizeTreasureConfig(updatedGameState.gameConfig.treasureConfig)
          if (cfg.enabled) {
            const eliminator = updatedGameState.players.find((p) => p.id === attackerId)
            if (eliminator) {
              let eliminatorHand: import('../types/game.js').Metal[]
              if (Array.isArray(eliminator.treasures)) {
                eliminatorHand = eliminator.treasures as import('../types/game.js').Metal[]
              } else {
                eliminator.treasures = []
                eliminatorHand = eliminator.treasures as import('../types/game.js').Metal[]
              }
              let transferred = 0
              for (const elimId of lastBattleResult.eliminatedPlayers) {
                const eliminated = updatedGameState.players.find((p) => p.id === elimId)
                const has =
                  Array.isArray(eliminated?.treasures) && (eliminated?.treasures?.length ?? 0) > 0
                if (!eliminated || !has) continue
                eliminatorHand.push(...(eliminated.treasures as import('../types/game.js').Metal[]))
                transferred += (eliminated.treasures as import('../types/game.js').Metal[]).length
                eliminated.treasures = []
                eliminated.mustCashInTreasures = false
              }
              if (transferred > 0 && eliminatorHand.length >= cfg.handCap) {
                const hasValidSet = findRedeemableSets(eliminatorHand).length > 0
                eliminator.mustCashInTreasures = hasValidSet
                if (hasValidSet && eliminator.id === updatedGameState.currentPlayer) {
                  updatedGameState.mustCashInTreasures = true
                }
              }
            }
          }
        }
      } catch (e) {
        logger.warn('Failed to transfer eliminated treasures in applyBattleResult', {
          gameId,
          error: e instanceof Error ? e.message : e,
        })
      }

      // Do not award treasures here. The GameEngine awards exactly one treasure
      // at end-of-turn if any conquest occurred. This avoids mid-turn multiple awards.
      serializedState = this.serializeGameState(updatedGameState)
      // Persist lean snapshot + room indicators + immutable snapshot atomically,
      // and refresh cache for the hot read path.
      await this.persistTurnStateTransactional(gameId, serializedState)
      try {
        await gameStateCache.setGameState(gameId, serializedState)
      } catch {
        // best-effort cache refresh
      }
    }

    if (persistenceOutcome.applied && gameEnded) {
      const finalization = await this.finalizeCompletedGame(
        gameId,
        serializedState,
        playersAfterBattle,
        playerStats,
        latestBattleLog.filter((entry): entry is BattleLogEntry => this.isBattleLogEntry(entry)),
      )
      battleMetrics.clearGame(gameId)
      if (finalization.archived) {
        // Emit a canonical GAME_END delta + fog-aware text in a single sweep
        try {
          const io = tryGetSocketServer()
          if (io) {
            const winnerId =
              finalization.playerRankings.find((r) => r.isWinner)?.userId ||
              (serializedState.currentPlayer ?? '')
            const eliminated = finalization.playerRankings
              .filter((r) => r.eliminated)
              .map((r) => r.userId)
            const delta = DeltaBuilder.gameEnd(
              gameId,
              winnerId,
              eliminated,
              (serializedState as { version?: number }).version,
            )
            const { emitCombined } = await import('./realtimeEmitter.js')
            const { createGameEndMoves } = await import('./logEmitter.js')
            const moves = createGameEndMoves(gameId, updatedGameState, winnerId, eliminated)
            await emitCombined(io, gameId, { deltas: [delta], moves }, updatedGameState)
          }
        } catch (e) {
          logger.warn('Failed to emit GAME_END delta after battle', {
            gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
        await this.awardClanContributions(gameId, finalization.playerRankings)
        try {
          const { achievementService } = await import('./achievementService.js')
          // Map to minimal structure to avoid type coupling
          const minimal = finalization.playerRankings.map((r) => ({
            userId: r.userId,
            isWinner: r.isWinner,
            eliminated: r.eliminated,
          }))
          await achievementService.handleGameCompleted(gameId, minimal)
        } catch (e) {
          logger.warn('Failed to process achievements after game completion', {
            gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
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
    // Normalize legacy or malformed persisted payloads defensively
    const normalized = this.normalizeTerritoriesInput(persisted as unknown)

    if (!normalized || normalized.length === 0) {
      return updatedBoard.length
    }

    const persistedById = new Map<string, Territory>()
    for (const territory of normalized) {
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

  /**
   * Coerce a value into a Territory[] if possible. Handles legacy JSON strings
   * or objects that contain a `board` field, otherwise returns null.
   */
  private normalizeTerritoriesInput(input: unknown): Territory[] | null {
    if (Array.isArray(input)) {
      return input as Territory[]
    }
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input)
        if (Array.isArray(parsed)) return parsed as Territory[]
        if (parsed && Array.isArray((parsed as { board?: unknown }).board)) {
          return (parsed as { board: Territory[] }).board
        }
      } catch {
        return null
      }
    }
    if (input && typeof input === 'object') {
      const maybe = input as { board?: unknown }
      if (Array.isArray(maybe.board)) return maybe.board as Territory[]
    }
    return null
  }

  /**
   * Append a per-turn stats snapshot for analytics/visualization.
   */
  async appendTurnStats(
    roomId: string,
    snapshot: {
      turn: number
      phase: string
      currentPlayerId: string
      timestamp: string
      players: Array<{ id: string; territories: number; armies: number; eliminated: boolean }>
    },
  ): Promise<void> {
    await transaction(async (client) => {
      const res = await client.query<{ turn_stats: unknown[] | null }>(
        'SELECT turn_stats FROM game_states WHERE room_id = $1 FOR UPDATE',
        [roomId],
      )
      const current = (
        Array.isArray(res.rows[0]?.turn_stats) ? (res.rows[0]?.turn_stats as unknown[]) : []
      ) as (typeof snapshot)[]
      const updated = [...current, snapshot].slice(-500)
      await client.query(
        `INSERT INTO game_states (room_id, turn_stats, last_activity, game_phase, turn_number)
         VALUES ($1, $2, NOW(), 'lobby', 1)
         ON CONFLICT (room_id) DO UPDATE SET turn_stats = EXCLUDED.turn_stats, last_activity = NOW()`,
        [roomId, JSON.stringify(updated)],
      )
    })
  }

  /**
   * Convenience to compute snapshot from a GameState.
   */
  buildTurnStatsSnapshot(state: GameState, at?: Date) {
    const when = (at ?? new Date()).toISOString()
    const players = state.players.map((p) => ({
      id: p.id,
      territories: state.board.filter((t) => t.ownerId === p.id).length,
      armies: state.board.reduce((sum, t) => (t.ownerId === p.id ? sum + t.armies : sum), 0),
      eliminated: p.isEliminated,
    }))
    return {
      turn: state.turn,
      phase: state.phase,
      currentPlayerId: state.currentPlayer,
      timestamp: when,
      players,
    }
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
    // Determine winning side: in team play, all players on the last remaining side
    // are winners (even if eliminated earlier). In FFA, winner is the last active player.
    const active = players.filter((p) => !p.isEliminated)
    let winningSideKey: string | null = null
    if (active.length > 0) {
      if ((playersById.values().next().value as GamePlayer | undefined)?.teamId !== undefined) {
        // Team-aware: choose the first active player's side as canonical winning side
        const first = active[0]
        const teamId = (first as { teamId?: number | null }).teamId
        winningSideKey = teamId ? `team:${teamId}` : `player:${first.id}`
      } else {
        winningSideKey = `player:${active[0].id}`
      }
    }

    const isOnWinningSide = (p: GamePlayer): boolean => {
      if (!winningSideKey) return false
      const teamId = (p as { teamId?: number | null }).teamId
      const key = teamId ? `team:${teamId}` : `player:${p.id}`
      return key === winningSideKey
    }

    // Winners first (preserve original players order), then elimination order, then remaining
    const winnersFirst = players.filter(isOnWinningSide).map((p) => p.id)
    const orderedIds: string[] = [...winnersFirst]

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
        isWinner: player ? isOnWinningSide(player) : false,
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

    let finalRatingChanges: RatingChange[] = []
    let isRankedGame = false
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
        is_ranked: boolean
        is_private: boolean
        team_mode: boolean
        game_mode: string
      }>(
        'SELECT map_id, started_at, ended_at, is_ranked, is_private, team_mode, game_mode FROM game_rooms WHERE id = $1 FOR UPDATE',
        [gameId],
      )

      if ((roomResult.rowCount ?? 0) === 0) {
        throw new Error('Game room not found during archival')
      }

      const room = roomResult.rows[0]
      isRankedGame = Boolean(room.is_ranked)
      const startedAt = room.started_at ? new Date(room.started_at) : null
      const durationSeconds =
        startedAt !== null
          ? Math.max(0, Math.round((archiveTimestamp.getTime() - startedAt.getTime()) / 1000))
          : null

      await client.query(
        `UPDATE game_rooms
         SET status = 'completed',
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
        currentRating: userMap.get(ranking.userId)?.skill_rating ?? 800,
        gamesPlayed: statsMap.get(ranking.userId) ?? 0,
        position: ranking.position,
      }))

      const eloMode = room.game_mode === 'capital' ? 'ranked.capitals' : 'ranked.classic'

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

      if (ratingChanges.length > 0) {
        const ratingInputMap = new Map(playerRatings.map((player) => [player.userId, player]))
        logger.info('Calculated rating changes for completed ranked game', {
          gameId,
          players: ratingChanges.length,
          breakdown: ratingChanges.map((change) => {
            const input = ratingInputMap.get(change.userId)
            return {
              userId: change.userId,
              position: input?.position ?? null,
              gamesPlayed: input?.gamesPlayed ?? null,
              oldRating: change.oldRating,
              newRating: change.newRating,
              delta: change.change,
              expectedScore: Number(change.expectedScore.toFixed(3)),
              actualScore: Number(change.actualScore.toFixed(3)),
              kFactor: Number(change.kFactor.toFixed(2)),
            }
          }),
        })

        // Structured per-player logs for observability (one line per player)
        for (const change of ratingChanges) {
          const input = ratingInputMap.get(change.userId)
          logger.info('elo_update', {
            gameId,
            userId: change.userId,
            placement: input?.position ?? null,
            oldRating: change.oldRating,
            delta: change.change,
            newRating: change.newRating,
            expectedScore: Number(change.expectedScore.toFixed(4)),
            actualScore: Number(change.actualScore.toFixed(4)),
            kFactor: Number(change.kFactor.toFixed(2)),
            nPlayers: playerRatings.length,
            provisional: (input?.gamesPlayed ?? 0) < 20,
            ranked: isRankedGame,
            mode: eloMode,
          })
        }
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
          ratingBefore: ratingChange?.oldRating ?? user?.skill_rating ?? 800,
          ratingAfter: ratingChange?.newRating ?? user?.skill_rating ?? 800,
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
          const ratingBefore = ratingChange?.oldRating ?? user?.skill_rating ?? 800
          const ratingAfter = ratingChange?.newRating ?? user?.skill_rating ?? 800
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

      // Increment ranked wins/losses for participants in ranked games.
      if (isRankedGame && playerRankings.length > 0) {
        const participantIds = playerRankings.map((p) => p.userId)
        const winnerIds = playerRankings.filter((p) => p.isWinner).map((p) => p.userId)
        const loserIds = playerRankings.filter((p) => !p.isWinner).map((p) => p.userId)

        if (winnerIds.length > 0) {
          await client.query(
            `UPDATE users SET ranked_wins = ranked_wins + 1, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
            [winnerIds],
          )
        }

        if (loserIds.length > 0) {
          await client.query(
            `UPDATE users SET ranked_losses = ranked_losses + 1, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
            [loserIds],
          )
        }

        // Update last_ranked_game_at for all participants to reflect recent game
        if (participantIds.length > 0) {
          await client.query(
            `UPDATE users SET last_ranked_game_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[])`,
            [participantIds],
          )
        }
      }

      await eloService.updateLeaderboardCache(client)
      // Expose rating changes for post-transaction logging
      finalRatingChanges = ratingChanges
      return true
    })

    await gameStateCache.setInactiveGameState(gameId, serializedState)
    if (persisted) {
      logger.info('Archived completed game', {
        gameId,
        winnerId: winner?.userId ?? null,
      })
    }

    // Emit rating updates to room subscribers for ranked games
    try {
      if (isRankedGame && finalRatingChanges && finalRatingChanges.length > 0) {
        const io = tryGetSocketServer()
        if (io) {
          io.to(`game:${gameId}`).emit('ratingUpdate', {
            changes: finalRatingChanges.map((c) => ({
              userId: c.userId,
              oldRating: c.oldRating,
              newRating: c.newRating,
              change: c.change,
            })),
          })
        }
      }
    } catch (e) {
      logger.warn('Failed to emit ratingUpdate socket event', {
        gameId,
        error: e instanceof Error ? e.message : e,
      })
    }

    // Append rating change logs for ranked games where rating changes exist
    try {
      if (finalRatingChanges && finalRatingChanges.length > 0) {
        const ts = new Date().toISOString()
        const ratingEntries: RatingLogEntry[] = finalRatingChanges.map((rc) => ({
          type: 'RATING',
          timestamp: ts,
          userId: rc.userId,
          change: rc.change,
          oldRating: rc.oldRating,
          newRating: rc.newRating,
        }))
        await this.appendLog(gameId, ratingEntries)
      }
      // Always append a canonical GAME_END log entry for backfill
      try {
        const tsEnd = new Date().toISOString()
        const eliminated = playerRankings.filter((r) => r.eliminated).map((r) => r.userId)
        const winnerId = (winner?.userId ?? serializedState.currentPlayer ?? '') as string
        const endEntry: GameEndLogEntry = {
          type: 'GAME_END',
          timestamp: tsEnd,
          winner: winnerId,
          eliminatedPlayers: eliminated,
        }
        await this.appendLog(gameId, [endEntry])
      } catch (logErr) {
        logger.warn('Failed to append GAME_END log', {
          gameId,
          error: logErr instanceof Error ? logErr.message : logErr,
        })
      }
    } catch (e) {
      logger.warn('Failed to append rating change logs', {
        gameId,
        error: e instanceof Error ? e.message : e,
      })
    }

    return { archived: persisted, playerRankings }
  }

  async archiveGameResults(gameId: string, results: Record<string, unknown>): Promise<void> {
    const { endReason: rawEndReason, winner } = results as {
      endReason?: unknown
      winner?: unknown
    }
    const endReason = typeof rawEndReason === 'string' ? rawEndReason : undefined
    logger.debug('Cleanup archive request handled upstream', {
      gameId,
      endReason,
      winner,
    })
  }

  async archiveGameMoves(gameId: string): Promise<{ archived: number }> {
    if (!gameId) {
      return { archived: 0 }
    }

    const archived = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `
          WITH moved AS (
            DELETE FROM game_moves
            WHERE room_id = $1
            RETURNING id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
          )
          INSERT INTO game_move_archive (
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            archived_at
          )
          SELECT
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            NOW()
          FROM moved
          RETURNING id
        `,
        [gameId],
      )

      return result.rowCount ?? 0
    })

    if (archived > 0) {
      logger.debug('Archived game moves', { gameId, archived })
    }

    return { archived }
  }

  async updateEloRatings(gameId: string, _gameState: unknown): Promise<void> {
    logger.debug('Cleanup requested ELO update; rankings already finalized', { gameId })
  }

  async recordGameHistory(gameId: string, _gameState: unknown): Promise<void> {
    logger.debug('Cleanup requested history archive; already persisted during finalization', {
      gameId,
    })
  }

  async removeFromActiveGames(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
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
    const threshold = Number.isFinite(thresholdMs) ? Math.trunc(Math.max(0, thresholdMs)) : 0
    if (threshold <= 0) {
      return []
    }

    const result = await query<{ id: string }>(
      `
        SELECT id
        FROM game_rooms
        WHERE status IN ('active', 'initializing')
          AND updated_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
        ORDER BY updated_at ASC
        LIMIT 128
      `,
      [threshold],
    )

    const games = result.rows.map((row) => row.id)
    if (games.length > 0) {
      logger.info('Identified abandoned games for cleanup', {
        thresholdMs,
        count: games.length,
      })
    }
    return games
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

  private createEngagementId(attackingTerritoryId: string, defendingTerritoryId: string): string {
    return `${attackingTerritoryId}->${defendingTerritoryId}:${Date.now()}`
  }

  private isBattleLogEntry(entry: GameLogEntry): entry is BattleLogEntry {
    return (entry as { type?: string }).type === 'BATTLE'
  }

  private isEngagementSummaryEntry(entry: GameLogEntry): entry is EngagementSummaryLogEntry {
    return (entry as { type?: string }).type === 'ENGAGEMENT_SUMMARY'
  }

  private normalizeEliminatedPlayers(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string')
    }
    if (typeof value === 'string') {
      return [value]
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string',
      )
    }
    return []
  }

  private mapBattleLogRowToEntry(row: PersistedBattleLogRow): GameLogEntry {
    const rawTimestamp =
      row.entry_timestamp instanceof Date
        ? row.entry_timestamp
        : new Date(String(row.entry_timestamp))
    const timestamp =
      rawTimestamp instanceof Date && !Number.isNaN(rawTimestamp.getTime())
        ? rawTimestamp
        : new Date()
    const isoTimestamp = timestamp.toISOString()

    if (row.entry_type === 'BATTLE') {
      return {
        type: 'BATTLE',
        jobId: row.job_id ?? '',
        timestamp: isoTimestamp,
        engagementId: row.engagement_id ?? undefined,
        attackingTerritoryId: row.attacking_territory_id ?? '',
        defendingTerritoryId: row.defending_territory_id ?? '',
        attackerId: row.attacker_id ?? '',
        defenderId: row.defender_id ?? null,
        losses: {
          attacker: row.attacker_losses ?? 0,
          defender: row.defender_losses ?? 0,
        },
        conquered: Boolean(row.conquered),
        movedArmies: typeof row.moved_armies === 'number' ? row.moved_armies : undefined,
        eliminatedPlayers: this.normalizeEliminatedPlayers(row.eliminated_players),
        initialFromArmies: row.initial_from_armies ?? undefined,
        initialToArmies: row.initial_to_armies ?? undefined,
      }
    }

    return {
      type: 'ENGAGEMENT_SUMMARY',
      timestamp: isoTimestamp,
      engagementId: row.engagement_id ?? '',
      attackingTerritoryId: row.attacking_territory_id ?? '',
      defendingTerritoryId: row.defending_territory_id ?? '',
      attackerId: row.attacker_id ?? '',
      defenderId: row.defender_id ?? null,
      initialFromArmies: Math.max(0, row.initial_from_armies ?? 0),
      initialToArmies: Math.max(0, row.initial_to_armies ?? 0),
      totalLosses: {
        attacker: Math.max(0, row.total_attacker_losses ?? 0),
        defender: Math.max(0, row.total_defender_losses ?? 0),
      },
      conquered: Boolean(row.conquered),
    }
  }

  private prepareBattleInsertRow(
    roomId: string,
    turnNumber: number,
    entry: BattleLogEntry | EngagementSummaryLogEntry,
  ): BattleInsertRow {
    const rawTimestamp = new Date(entry.timestamp)
    const timestamp = Number.isNaN(rawTimestamp.getTime()) ? new Date() : rawTimestamp

    if (this.isBattleLogEntry(entry)) {
      return {
        game_id: roomId,
        entry_type: 'BATTLE',
        job_id: entry.jobId,
        engagement_id: entry.engagementId ?? entry.jobId,
        entry_timestamp: timestamp,
        turn_number: turnNumber,
        attacking_territory_id: entry.attackingTerritoryId,
        defending_territory_id: entry.defendingTerritoryId,
        attacker_id: entry.attackerId,
        defender_id: entry.defenderId ?? null,
        attacker_losses: entry.losses.attacker,
        defender_losses: entry.losses.defender,
        conquered: entry.conquered,
        moved_armies: entry.movedArmies ?? null,
        eliminated_players: entry.eliminatedPlayers ?? [],
        initial_from_armies: entry.initialFromArmies ?? null,
        initial_to_armies: entry.initialToArmies ?? null,
        total_attacker_losses: null,
        total_defender_losses: null,
        metadata: {},
      }
    }

    return {
      game_id: roomId,
      entry_type: 'ENGAGEMENT_SUMMARY',
      job_id: null,
      engagement_id: entry.engagementId,
      entry_timestamp: timestamp,
      turn_number: turnNumber,
      attacking_territory_id: entry.attackingTerritoryId,
      defending_territory_id: entry.defendingTerritoryId,
      attacker_id: entry.attackerId,
      defender_id: entry.defenderId ?? null,
      attacker_losses: null,
      defender_losses: null,
      conquered: entry.conquered,
      moved_armies: null,
      eliminated_players: [],
      initial_from_armies: entry.initialFromArmies ?? null,
      initial_to_armies: entry.initialToArmies ?? null,
      total_attacker_losses: entry.totalLosses.attacker,
      total_defender_losses: entry.totalLosses.defender,
      metadata: {},
    }
  }

  private async fetchBattleLogEntries(
    roomId: string,
    options: { client?: PoolClient; limit?: number } = {},
  ): Promise<GameLogEntry[]> {
    const { client, limit } = options
    const params: unknown[] = [roomId]
    let sql = `
      SELECT entry_type,
             job_id,
             engagement_id,
             entry_timestamp,
             turn_number,
             attacking_territory_id,
             defending_territory_id,
             attacker_id,
             defender_id,
             attacker_losses,
             defender_losses,
             conquered,
             moved_armies,
             eliminated_players,
             initial_from_armies,
             initial_to_armies,
             total_attacker_losses,
             total_defender_losses,
             metadata
        FROM game_battle_logs
       WHERE game_id = $1
    `
    if (limit) {
      sql += ' ORDER BY entry_timestamp DESC, id DESC LIMIT $2'
      params.push(limit)
    } else {
      sql += ' ORDER BY entry_timestamp ASC, id ASC'
    }

    const result = client
      ? await client.query<PersistedBattleLogRow>(sql, params)
      : await query<PersistedBattleLogRow>(sql, params)

    const rows = limit ? [...result.rows].reverse() : result.rows
    return rows.map((row) => this.mapBattleLogRowToEntry(row))
  }

  private async persistBattleLogEntries(
    client: PoolClient,
    roomId: string,
    entries: GameLogEntry[],
    turnNumber: number,
  ): Promise<void> {
    const persistable = entries.filter(
      (entry): entry is BattleLogEntry | EngagementSummaryLogEntry =>
        this.isBattleLogEntry(entry) || this.isEngagementSummaryEntry(entry),
    )
    if (persistable.length === 0) {
      return
    }

    const rows = persistable.map((entry) => this.prepareBattleInsertRow(roomId, turnNumber, entry))

    const columns = [
      'game_id',
      'entry_type',
      'job_id',
      'engagement_id',
      'entry_timestamp',
      'turn_number',
      'attacking_territory_id',
      'defending_territory_id',
      'attacker_id',
      'defender_id',
      'attacker_losses',
      'defender_losses',
      'conquered',
      'moved_armies',
      'eliminated_players',
      'initial_from_armies',
      'initial_to_armies',
      'total_attacker_losses',
      'total_defender_losses',
      'metadata',
    ] as const

    const values: unknown[] = []
    const placeholders: string[] = []
    rows.forEach((row, index) => {
      const base = index * columns.length
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${
          base + 7
        }, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20})`,
      )
      values.push(
        row.game_id,
        row.entry_type,
        row.job_id,
        row.engagement_id,
        row.entry_timestamp,
        row.turn_number,
        row.attacking_territory_id,
        row.defending_territory_id,
        row.attacker_id,
        row.defender_id,
        row.attacker_losses,
        row.defender_losses,
        row.conquered,
        row.moved_armies,
        row.eliminated_players,
        row.initial_from_armies,
        row.initial_to_armies,
        row.total_attacker_losses,
        row.total_defender_losses,
        row.metadata,
      )
    })

    await client.query(
      `INSERT INTO game_battle_logs (
         game_id,
         entry_type,
         job_id,
         engagement_id,
         entry_timestamp,
         turn_number,
         attacking_territory_id,
         defending_territory_id,
         attacker_id,
         defender_id,
         attacker_losses,
         defender_losses,
         conquered,
         moved_armies,
         eliminated_players,
         initial_from_armies,
         initial_to_armies,
         total_attacker_losses,
         total_defender_losses,
         metadata
       ) VALUES ${placeholders.join(', ')}
       ON CONFLICT (game_id, job_id) WHERE job_id IS NOT NULL DO NOTHING`,
      values,
    )
  }

  // Legacy getBattleLog removed: structured entries now persist in game_battle_logs;
  // game_logs remains the fog-aware/textual stream.

  async appendLog(roomId: string, entries: GameLogEntry[]): Promise<void> {
    if (!entries || entries.length === 0) return
    // No longer write to game_states.game_log (removed). Persist and emit textual moves only.
    try {
      const io = tryGetSocketServer()
      if (io) {
        const { emitFogAwareForEntries, persistFogAwareForEntries } = await import(
          './logEmitter.js'
        )
        const fogEntries: Array<Record<string, unknown>> = entries.map((entry) => ({ ...entry }))
        await persistFogAwareForEntries(roomId, fogEntries)
        await emitFogAwareForEntries(io, roomId, fogEntries)
        const hasGameEnd = entries.some((e) => (e as { type?: string }).type === 'GAME_END')
        if (hasGameEnd) {
          io.to(`game:${roomId}`).emit('game-log:reveal')
          io.to(roomId).emit('game-log:reveal')
        }
      }
    } catch {
      // best-effort only
    }
  }
}
