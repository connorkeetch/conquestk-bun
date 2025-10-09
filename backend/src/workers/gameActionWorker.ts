import type { GameDelta } from '@risk-game/shared/types'
import type Bull from 'bull'
import type { Server } from 'socket.io'
import { query } from '../config/database'
import { aiDecisionService, type DecisionBudget } from '../services/aiDecisionService'
import { gameStateCache } from '../services/cacheService'
import { DeltaEmitter } from '../services/deltaEmitter'
import { GameService } from '../services/gameService'
import { jobIdempotencyService } from '../services/jobIdempotencyService'
import { aiTurnMetrics, socketPayloadMetrics } from '../services/metricsService'
import {
  type BattleSimulationJob,
  type GameActionJob,
  queueService,
} from '../services/queueService'
import { DeltaBuilder } from '../types/deltaUpdates'
import type {
  AttackAction,
  DeployAction,
  FortifyAction,
  GameAction,
  GamePhase,
  GameState,
  SerializedGameState,
} from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'

interface ProcessGameActionResult {
  success: true
  delta: GameDelta | null
  processed: boolean
}

export class GameActionWorker {
  private queue: Bull.Queue<GameActionJob>
  private gameService: GameService
  private deltaEmitter: DeltaEmitter
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService()
    this.deltaEmitter = new DeltaEmitter(io)
    this.io = io
    this.queue = queueService.getGameActionQueue()
  }

  private computePayloadBytes(data: unknown): number {
    try {
      const json = JSON.stringify(data)
      return Buffer.byteLength(json, 'utf8')
    } catch {
      return -1
    }
  }

  private emitGameUpdate(channel: string, payload: SerializedGameState) {
    const bytes = this.computePayloadBytes(payload)
    socketPayloadMetrics.record('game-update', bytes)
    if (socketPayloadMetrics.shouldLog('game-update')) {
      const stats = socketPayloadMetrics.snapshot('game-update')
      if (stats) {
        logger.info('Socket payload stats', {
          event: 'game-update',
          windowCount: stats.count,
          p50Bytes: stats.p50,
          p95Bytes: stats.p95,
          maxBytes: stats.max,
        })
      }
    }
    this.io.to(channel).emit('game-update', payload)
  }

  async initialize(): Promise<void> {
    // Process game action jobs
    this.queue.process('process-game-action', 10, async (job: Bull.Job<GameActionJob>) => {
      return this.processGameAction(job)
    })

    // Orchestrate AI turns (queued as separate job name)
    this.queue.process('execute-ai-turn', 5, async (job: Bull.Job) => {
      return this.processAiTurn(job)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      logger.info('✅ Game action job completed', {
        jobId: job.id,
        result,
      })
    })

    this.queue.on('failed', (job, error) => {
      logger.error('❌ Game action job failed', {
        jobId: job.id,
        error,
      })
    })

    this.queue.on('stalled', (job) => {
      logger.warn('⚠️ Game action job stalled', { jobId: job.id })
    })

    logger.info('✅ GameActionWorker initialized')
  }

  private async processAiTurn(job: Bull.Job): Promise<ProcessGameActionResult> {
    const { gameId, playerId, turnNumber, budgetOverrides } = job.data as {
      gameId: string
      playerId: string
      turnNumber: number
      budgetOverrides?: Partial<import('../services/aiDecisionService').DecisionBudget>
    }

    const idKey = job.id !== undefined ? String(job.id) : `ai:${gameId}:${turnNumber}`

    const cached = await jobIdempotencyService.getProcessedJob<ProcessGameActionResult>(
      this.queue.name,
      idKey,
    )
    if (cached.exists && cached.value) {
      logger.info('♻️ Skipping already processed AI turn job', {
        gameId,
        playerId,
        jobId: job.id,
      })
      return { ...cached.value, processed: false }
    }

    try {
      const state = await this.gameService.getGameState(gameId)
      if (!state) throw new Error('Game not found')

      // Validate this job still applies
      if (state.phase === 'finished') {
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }

      if (state.turn !== turnNumber || state.currentPlayer !== playerId) {
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }

      const current = state.players.find((p) => p.id === playerId)
      if (!current || !current.isAi) {
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }

      const difficulty = current.aiDifficulty ?? 'recruit'
      const baseBudget = this.computeBudgetForDifficulty(difficulty)
      const effectiveBudget: DecisionBudget = {
        ...baseBudget,
        ...(budgetOverrides || {}),
        // Allow override via env for quick tuning
        readableDelayMs:
          typeof process.env.AI_READABLE_DELAY_MS === 'string'
            ? Math.max(0, parseInt(process.env.AI_READABLE_DELAY_MS, 10) || 0)
            : (budgetOverrides?.readableDelayMs ?? baseBudget.readableDelayMs),
      }

      const streamEnabled = (process.env.AI_STREAM_ACTIONS ?? 'true').toLowerCase() !== 'false'

      if (streamEnabled && (effectiveBudget.readableDelayMs ?? 0) > 0) {
        await this.runAiTurnStreaming({ gameId, playerId, difficulty, budget: effectiveBudget })
      } else {
        // Execute the AI turn plan atomically (apply whole plan at once)
        await this.gameService.executeAiTurn(gameId, effectiveBudget)
        // Emit a full snapshot to ensure clients converge
        const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
        if (serialized) {
          this.emitGameUpdate(`game:${gameId}`, serialized)
        }
      }

      // Schedule timeout for the next player and chain AI if next is AI
      try {
        const { GameLifecycleService } = await import('../services/gameLifecycleService')
        const lifecycle = new GameLifecycleService()
        await lifecycle.scheduleTurnTimeout(gameId)
        await lifecycle.scheduleAiTurn(gameId)
      } catch (e) {
        logger.warn('Failed to schedule lifecycle after AI turn', {
          roomId: gameId,
          error: e instanceof Error ? e.message : e,
        })
      }

      const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
      await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
      return result
    } catch (error) {
      logger.error('❌ Failed to process AI turn', {
        gameId,
        playerId,
        error,
      })
      throw error
    }
  }

  private async runAiTurnStreaming(args: {
    gameId: string
    playerId: string
    difficulty: import('../types/game').AIDifficulty
    budget: DecisionBudget
  }): Promise<void> {
    const { gameId, playerId, difficulty, budget } = args
    const start = Date.now()

    // Fetch frozen state for planning
    const state = await this.gameService.getGameState(gameId)
    if (!state) throw new Error('Game not found')
    if (state.currentPlayer !== playerId) return

    const aiPlayer = state.players.find((p) => p.id === playerId)
    if (!aiPlayer) {
      // Current player no longer AI; abort streaming turn gracefully
      return
    }

    const plan = await aiDecisionService.chooseAction({
      gameState: state,
      player: aiPlayer,
      difficulty,
      budget,
    })

    const actions = Array.isArray(plan.actions) ? [...plan.actions] : []
    let applied = 0
    let usedFallback = plan.usedFallback
    let fallbackReason = plan.reason

    // Respect budget across pacing
    const planningElapsed = plan.diagnostics?.durationMs ?? 0
    const totalBudget = Math.max(0, budget.maxThinkTimeMs)
    let remainingBudget = Math.max(0, totalBudget - planningElapsed)

    const chainLimit = Math.max(0, budget.maxAttackChains ?? 0)
    let chainCount = 0

    for (let i = 0; i < actions.length; i++) {
      const now = Date.now()
      const elapsed = now - start
      remainingBudget = Math.max(0, totalBudget - elapsed)
      if (remainingBudget <= 0) {
        usedFallback = true
        fallbackReason = fallbackReason ?? 'timeout'
        break
      }

      // Compute a safe per-step delay
      const stepsLeft = actions.length - i
      const desiredDelay = Math.max(0, budget.readableDelayMs ?? 0)
      const maxDelay = Math.max(0, Math.floor(remainingBudget / (stepsLeft + 1)))
      const stepDelay = Math.min(desiredDelay, maxDelay)
      if (stepDelay > 0) await new Promise((r) => setTimeout(r, stepDelay))

      // Apply action and emit fog-filtered deltas per action
      const action = actions[i]
      try {
        switch (action.type) {
          case 'deploy': {
            await this.processPlaceArmies(gameId, playerId, action as DeployAction)
            break
          }
          case 'fortify': {
            await this.processFortify(gameId, playerId, action as FortifyAction)
            break
          }
          case 'end_turn': {
            await this.processEndTurn(gameId, playerId)
            break
          }
          case 'attack': {
            const updated = await this.gameService.processGameAction(action, playerId)
            const last = updated.lastBattleResult
            if (last) {
              try {
                const battleDelta: import('@risk-game/shared/types').GameDelta =
                  DeltaBuilder.battleResult(
                    gameId,
                    last as unknown as import('@risk-game/shared/types').BattleResultDelta['battleResult'],
                    updated.version,
                  )
                const { emitFogFilteredDelta } = await import('../services/fogService')
                await emitFogFilteredDelta(this.io as unknown as Server, gameId, battleDelta)
              } catch {
                // best-effort; clients will converge on next snapshot
              }
            }

            // Grandmaster attack chaining: replan for another attack within budget and chain limits
            if (difficulty === 'grandmaster' && chainCount < chainLimit) {
              // Update remaining budget and verify we're still in attack phase
              const now2 = Date.now()
              const elapsed2 = now2 - start
              remainingBudget = Math.max(0, totalBudget - elapsed2)
              if (remainingBudget > 0) {
                try {
                  const latest = await this.gameService.getGameState(gameId)
                  if (latest && latest.currentPlayer === playerId && latest.phase === 'attack') {
                    const subBudget: DecisionBudget = {
                      ...budget,
                      maxThinkTimeMs: Math.min(remainingBudget, 500),
                      maxPlannedActions: 3,
                    }
                    const player2 = latest.players.find((p) => p.id === playerId)
                    if (!player2) break
                    const replanned = await aiDecisionService.chooseAction({
                      gameState: latest,
                      player: player2,
                      difficulty,
                      budget: subBudget,
                    })
                    const nextAttack = replanned.actions.find((a) => a.type === 'attack')
                    if (nextAttack) {
                      actions.splice(i + 1, 0, nextAttack)
                      chainCount += 1
                    }
                  }
                } catch {
                  // ignore chaining failure
                }
              }
            }
            break
          }
          case 'trade_cards': {
            // Capture player's pre-trade bank
            const beforeState = await this.gameService.getGameState(gameId)
            const prevBank = beforeState?.players.find((p) => p.id === playerId)?.armies ?? 0
            const prevPhase = beforeState?.phase
            const updated = await this.gameService.processGameAction(
              action as Extract<import('../types/game').GameAction, { type: 'trade_cards' }>,
              playerId,
            )
            // Emit concise deltas
            try {
              const postPlayer = updated.players.find((p) => p.id === playerId)
              const postBank = postPlayer?.armies ?? prevBank
              const mustCash =
                typeof postPlayer?.mustCashInTreasures === 'boolean'
                  ? postPlayer?.mustCashInTreasures
                  : undefined
              const { emitFogFilteredDelta } = await import('../services/fogService')
              const playerDelta = DeltaBuilder.playerUpdate(
                gameId,
                playerId,
                {
                  armies: Number(postBank),
                  ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
                },
                updated.version,
              )
              await emitFogFilteredDelta(this.io as unknown as Server, gameId, playerDelta)
              if (updated.phase !== prevPhase) {
                await this.deltaEmitter.emitPhaseChange(gameId, {
                  phase: updated.phase,
                  currentPlayer: updated.currentPlayer,
                  turn: updated.turn,
                  reinforcementArmies: Number(postBank),
                  version: updated.version,
                })
              }
            } catch {
              // Fallback to snapshot
              try {
                const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
                if (serialized) this.emitGameUpdate(`game:${gameId}`, serialized)
              } catch (_ee) {
                /* snapshot fallback failed; will converge on next action */
              }
            }
            break
          }
          default: {
            await this.gameService.processGameAction(action, playerId)
            // Fallback to snapshot for uncommon actions
            try {
              const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
              if (serialized) {
                this.emitGameUpdate(`game:${gameId}`, serialized)
              }
            } catch {
              // ignore
            }
            break
          }
        }
      } catch (_e) {
        usedFallback = true
        fallbackReason = fallbackReason ?? 'stubbed'
        break
      }

      applied += 1
    }

    // If budget expired or action failed before completing the plan, try a minimal fallback
    if (applied < actions.length) {
      const latest = await this.gameService.getGameState(gameId)
      if (latest && latest.currentPlayer === playerId) {
        const fb = aiDecisionService.buildFallbackPlan(latest, playerId)
        const tail = fb.slice(0, 1)
        for (const a of tail) {
          try {
            switch (a.type) {
              case 'deploy':
                await this.processPlaceArmies(gameId, playerId, a as DeployAction)
                break
              case 'fortify':
                await this.processFortify(gameId, playerId, a as FortifyAction)
                break
              case 'end_turn':
                await this.processEndTurn(gameId, playerId)
                break
              default:
                await this.gameService.processGameAction(a, playerId)
                break
            }
          } catch {
            // ignore; last resort is to stop
          }
        }
      }
    }

    // Record metrics similar to executeAiTurn
    aiTurnMetrics.recordTurn({
      difficulty,
      fallbackUsed: usedFallback,
      fallbackReason,
      thinkTimeMs: Date.now() - start,
      plannedActions: actions.length,
      appliedActions: applied,
    })
  }

  private computeBudgetForDifficulty(
    difficulty: import('../types/game').AIDifficulty,
  ): import('../services/aiDecisionService').DecisionBudget {
    // Defaults per AI readiness decisions (Oct 2025)
    switch (difficulty) {
      case 'recruit':
        return {
          maxThinkTimeMs: 5000,
          maxPlannedActions: 6,
          readableDelayMs: 300,
          maxAttackChains: 3,
          minAttackOddsByTier: { recruit: 0.7 },
          allowOneSpiceAttack: true,
        }
      case 'commander':
        return {
          maxThinkTimeMs: 10_000,
          maxPlannedActions: 10,
          readableDelayMs: 300,
          maxAttackChains: 6,
          minAttackOddsByTier: { commander: 0.68 },
          allowOneSpiceAttack: false,
        }
      default:
        return {
          maxThinkTimeMs: 15_000,
          maxPlannedActions: 16,
          readableDelayMs: 300,
          maxAttackChains: 999,
          minAttackOddsByTier: { grandmaster: 0.6 },
          allowOneSpiceAttack: false,
        }
    }
  }

  private async processGameAction(job: Bull.Job<GameActionJob>): Promise<ProcessGameActionResult> {
    const { gameId, playerId, action, socketId, idempotencyKey } = job.data
    const idKey =
      idempotencyKey ??
      (job.id !== undefined ? String(job.id) : `${gameId}:${playerId}:${action.type}`)

    const cached = await jobIdempotencyService.getProcessedJob<ProcessGameActionResult>(
      this.queue.name,
      idKey,
    )
    if (cached.exists && cached.value) {
      logger.info('♻️ Skipping already processed game action job', {
        gameId,
        playerId,
        actionType: action.type,
        jobId: job.id,
      })
      return { ...cached.value, processed: false }
    }

    try {
      logger.debug('Processing game action', {
        gameId,
        playerId,
        actionType: action.type,
      })

      // Special handling for automatic timeout progression before any validation
      if ((job.data as { turnTimeoutStage?: 'expire' }).turnTimeoutStage === 'expire') {
        try {
          const { GameLifecycleService } = await import('../services/gameLifecycleService')
          const lifecycle = new GameLifecycleService()
          await lifecycle.handleTurnTimeout(gameId)
        } catch (e) {
          logger.warn('Turn timeout handling failed', {
            roomId: gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }

      // Get current game state for normal actions
      const currentState = await this.gameService.getGameState(gameId)
      if (!currentState) {
        throw new Error(`Game ${gameId} not found`)
      }

      // Validate player can perform action (non-AFK)
      if (!this.canPlayerPerformAction(currentState, playerId, action)) {
        throw new Error(`Player ${playerId} cannot perform action ${action.type}`)
      }

      let delta: GameDelta | null = null
      let shouldBroadcast = true

      // Process different action types
      switch (action.type) {
        case 'deploy':
          delta = await this.processPlaceArmies(gameId, playerId, action)
          // Record deployment move
          await this.recordMove(gameId, playerId, currentState.turn, 'deploy', action.payload)
          // Emit actor-only snapshot fallback to guarantee convergence even if a delta was missed
          try {
            await this.deltaEmitter.emitRevealTo(gameId, playerId)
          } catch (_e) {
            // best-effort only
          }
          // Avoid broadcasting the delta again below; DeltaEmitter already emitted deltas
          shouldBroadcast = false
          break

        case 'attack': {
          const attackAction = action as AttackAction
          // For attacks, we queue a battle simulation
          const attackingTerritoryState = currentState.board.find(
            (territory) => territory.id === attackAction.payload?.fromTerritoryId,
          )
          const defendingArmies =
            currentState.board.find(
              (territory) => territory.id === attackAction.payload?.toTerritoryId,
            )?.armies ?? 1
          const attackingArmiesAvailable = Math.max(0, attackingTerritoryState?.armies ?? 0)
          // Respect requested armies from client, capped by available
          const requested = (attackAction.payload as { armies?: number } | undefined)?.armies
          const attackingArmies = Math.max(
            1,
            Math.min(
              attackingArmiesAvailable,
              typeof requested === 'number' ? requested : attackingArmiesAvailable,
            ),
          )

          const battleJob: BattleSimulationJob = {
            gameId,
            attackingTerritory: attackAction.payload?.fromTerritoryId ?? '',
            defendingTerritory: attackAction.payload?.toTerritoryId ?? '',
            // Use current territory armies for dice calculation (max dice derived later)
            attackingArmies,
            defendingArmies,
            playerId,
            idempotencyKey: `${idKey}:battle:${attackAction.payload?.fromTerritoryId ?? 'unknown'}:${attackAction.payload?.toTerritoryId ?? 'unknown'}`,
          }

          const moveId = await this.recordMove(
            gameId,
            playerId,
            currentState.turn,
            'attack',
            action.payload,
          )

          const jobPayload = moveId ? { ...battleJob, moveId } : battleJob
          await queueService.addBattleSimulation(jobPayload)

          // Don't broadcast immediately for attacks - wait for battle result
          shouldBroadcast = false
          break
        }

        case 'fortify':
          delta = await this.processFortify(gameId, playerId, action)
          // Record fortify move
          await this.recordMove(gameId, playerId, currentState.turn, 'fortify', action.payload)
          break

        case 'end_turn': {
          // Manual end-turn: just end immediately
          delta = await this.processEndTurn(gameId, playerId)
          // Record end turn
          await this.recordMove(gameId, playerId, currentState.turn, 'end_turn', {})
          break
        }

        case 'trade_cards': {
          // Log a lightweight move record so profile stats can aggregate trades
          try {
            const payload = (action as { payload?: { cards?: string[]; treasureSet?: unknown } })
              .payload
            const cards = Array.isArray(payload?.cards) ? payload?.cards : undefined
            const count =
              (cards?.length ?? 0) ||
              (Array.isArray(payload?.treasureSet) ? (payload?.treasureSet as unknown[]).length : 0)
            const moveData =
              cards && cards.length > 0
                ? { cards }
                : count > 0
                  ? { cardCount: count, treasureSet: payload?.treasureSet }
                  : { cardCount: 0 }

            await this.recordMove(gameId, playerId, currentState.turn, 'trade_cards', moveData)
          } catch (e) {
            // Non-fatal; trading still progresses even if analytics write fails
            logger.debug('Skipped logging trade_cards move', {
              roomId: gameId,
              playerId,
              error: e instanceof Error ? e.message : e,
            })
          }
          // Capture player's pre-trade reinforcement bank
          const prevBank = currentState.players.find((p) => p.id === playerId)?.armies ?? 0

          await this.gameService.processGameAction(action, playerId)
          const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
          const newPhase = serialized?.phase ?? currentState.phase
          const version = serialized?.version
          // Attempt to backfill a human-readable log entry showing troops gained from cash-in
          try {
            const postPlayer = serialized?.players?.find((p) => p.id === playerId)
            const postBank = postPlayer?.armies ?? prevBank
            const _mustCash =
              typeof postPlayer?.mustCashInTreasures === 'boolean'
                ? postPlayer?.mustCashInTreasures
                : undefined
            const gained = Math.max(0, (postBank as number) - prevBank)
            if (gained > 0) {
              await this.gameService.appendLog(gameId, [
                {
                  type: 'TREASURE_CASH',
                  timestamp: new Date().toISOString(),
                  playerId,
                  troops: gained,
                  // We don't know exact card names; include count when available
                  cardCount: Array.isArray(
                    (action as { payload?: { cards?: unknown[] } }).payload?.cards,
                  )
                    ? ((action as { payload?: { cards?: unknown[] } }).payload?.cards?.length ??
                      undefined)
                    : Array.isArray(
                          (action as { payload?: { treasureSet?: unknown[] } }).payload
                            ?.treasureSet,
                        )
                      ? (
                          (action as { payload?: { treasureSet?: unknown[] } }).payload
                            ?.treasureSet as unknown[]
                        ).length
                      : undefined,
                },
              ])
            }
          } catch (logErr) {
            logger.debug('Skipped appending treasure cash log', {
              roomId: gameId,
              playerId,
              error: logErr instanceof Error ? logErr.message : logErr,
            })
          }
          // Emit concise, fog-filtered deltas: player bank update and optional phase change
          try {
            const postPlayer = serialized?.players?.find((p) => p.id === playerId)
            const postBank = postPlayer?.armies ?? prevBank
            const mustCash =
              typeof postPlayer?.mustCashInTreasures === 'boolean'
                ? postPlayer?.mustCashInTreasures
                : undefined
            const { emitFogFilteredDelta } = await import('../services/fogService')
            const playerDelta = DeltaBuilder.playerUpdate(
              gameId,
              playerId,
              {
                armies: Number(postBank),
                ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
              },
              version,
            )
            await emitFogFilteredDelta(this.io as unknown as Server, gameId, playerDelta)

            // If phase changed (commonly to reinforcement), emit phase change with bank as reinforcementArmies
            if (newPhase !== currentState.phase) {
              await this.deltaEmitter.emitPhaseChange(gameId, {
                phase: newPhase,
                currentPlayer: serialized?.currentPlayer ?? playerId,
                turn: serialized?.turn ?? currentState.turn,
                reinforcementArmies: Number(postBank),
                version,
              })
            }
          } catch (_e) {
            // Fallback: if delta emission fails, send a full snapshot to avoid desync
            if (serialized) {
              this.emitGameUpdate(`game:${gameId}`, serialized)
            }
          }
          shouldBroadcast = false
          delta = null
          break
        }
        case 'go_back_to_reinforcement': {
          const result = await this.gameService.processGoBackToReinforcement(gameId, playerId)
          // Emit phase change delta with version
          await this.deltaEmitter.emitPhaseChange(gameId, result)
          await this.recordMove(gameId, playerId, currentState.turn, 'go_back_to_reinforcement', {})
          // Don't broadcast extra delta below
          shouldBroadcast = false
          break
        }

        case 'undo_fortify': {
          // Process undo fortify by delegating to the generic action path
          await this.gameService.processGameAction(
            { type: 'undo_fortify', roomId: gameId, playerId },
            playerId,
          )
          await this.recordMove(gameId, playerId, currentState.turn, 'undo_fortify', {})
          // Emit full state update since we don't have a lightweight delta
          const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
          if (serialized) {
            this.emitGameUpdate(`game:${gameId}`, serialized)
          }
          // Avoid emitting an extra delta below
          shouldBroadcast = false
          break
        }

        default: {
          const _exhaustive: never = action
          throw new Error('Unknown action type received in game action worker')
        }
      }

      // Broadcast delta update if needed
      if (shouldBroadcast && delta) {
        const { emitFogFilteredDelta } = await import('../services/fogService')
        await emitFogFilteredDelta(this.io as unknown as Server, gameId, delta)
      }

      const result: ProcessGameActionResult = {
        success: true,
        delta: delta || null,
        processed: true,
      }
      await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
      return result
    } catch (error) {
      logger.error('❌ Failed to process game action', {
        gameId,
        playerId,
        actionType: action.type,
        error,
      })

      // Emit error to specific socket if available
      if (socketId) {
        this.io.to(socketId).emit('error', {
          event: 'game:action:error',
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
        })
      }

      throw error
    }
  }

  private canPlayerPerformAction(
    gameState: GameState,
    playerId: string,
    action: GameAction,
  ): boolean {
    // Basic validation - extend as needed
    if (!gameState.players.some((player) => player.id === playerId)) {
      return false
    }

    // Check if it's player's turn for turn-based actions
    const turnBasedActions = ['deploy', 'attack', 'fortify', 'end_turn']
    if (turnBasedActions.includes(action.type)) {
      return gameState.currentPlayer === playerId
    }

    return true
  }

  private async recordMove(
    gameId: string,
    playerId: string,
    turnNumber: number,
    moveType: string,
    payload: unknown,
  ): Promise<string | null> {
    try {
      const result = await query<{ id: string }>(
        `INSERT INTO game_moves (room_id, player_id, turn_number, move_type, move_data)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [gameId, playerId, turnNumber, moveType, JSON.stringify(payload || {})],
      )
      const moveId = result.rows[0]?.id ?? null
      logger.debug('Recorded game move', { gameId, playerId, turnNumber, moveType, moveId })
      return moveId
    } catch (error) {
      // Non-fatal: move recording is for analytics/troubleshooting
      logger.warn('Failed to record game move', {
        gameId,
        playerId,
        turnNumber,
        moveType,
        error: error instanceof Error ? error.message : error,
      })
      return null
    }
  }

  private async processPlaceArmies(
    gameId: string,
    playerId: string,
    action: DeployAction,
  ): Promise<GameDelta> {
    const territoryId = action.payload?.territoryId || ''
    const result = await this.gameService.processPlaceArmies(gameId, {
      territoryId,
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Use unified delta emitter
    await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result)

    return DeltaBuilder.territoryUpdate(gameId, territoryId, {
      armies: result.armies,
    })
  }

  private async processFortify(
    gameId: string,
    playerId: string,
    action: FortifyAction,
  ): Promise<GameDelta> {
    const fromTerritoryId = action.payload?.fromTerritoryId || ''
    const toTerritoryId = action.payload?.toTerritoryId || ''

    // Process fortification
    const result = await this.gameService.processFortify(gameId, {
      fromTerritoryId,
      toTerritoryId,
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Use unified delta emitter
    await this.deltaEmitter.emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result)

    // Emit a consolidated fortify result delta for logging/UX purposes
    try {
      const fortifyDelta: import('@risk-game/shared/types').GameDelta = {
        type: 'FORTIFY_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        fromTerritoryId,
        toTerritoryId,
        movedArmies: action.payload?.armies || 0,
        fromArmies: result.fromArmies,
        toArmies: result.toArmies,
        playerId,
      }
      const { emitFogFilteredDelta } = await import('../services/fogService')
      await emitFogFilteredDelta(this.io as unknown as Server, gameId, fortifyDelta)
    } catch (_e) {
      // Non-fatal: fortify summary is best-effort
    }

    return DeltaBuilder.territoryUpdate(gameId, toTerritoryId, {
      armies: result.toArmies,
    })
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    const nextPlayer = await this.gameService.processEndTurn(gameId, playerId)

    try {
      const { GameLifecycleService } = await import('../services/gameLifecycleService')
      const lifecycle = new GameLifecycleService()
      await lifecycle.scheduleTurnTimeout(gameId)
      // If next player is AI, schedule AI orchestrator
      await lifecycle.scheduleAiTurn(gameId)
    } catch (error) {
      logger.warn('Failed to schedule turn timeout for next player', {
        roomId: gameId,
        error: error instanceof Error ? error.message : error,
      })
    }

    return DeltaBuilder.phaseChange(gameId, 'reinforcement', nextPlayer.id, 0, 0)
  }

  private async processPhaseChange(
    gameId: string,
    playerId: string,
    action: Extract<GameAction, { type: 'trade_cards' | 'go_back_to_reinforcement' }>,
  ): Promise<GameDelta> {
    const phase = ((action as { payload?: { phase?: GamePhase } }).payload?.phase ??
      'reinforcement') as GamePhase
    await this.gameService.processPhaseChange(gameId, playerId, phase)

    return DeltaBuilder.phaseChange(gameId, phase, playerId, 0, 0)
  }
}

// Export factory function
export const createGameActionWorker = (io: Server<ClientToServerEvents, ServerToClientEvents>) =>
  new GameActionWorker(io)
