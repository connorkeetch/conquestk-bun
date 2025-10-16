import type { GameDelta } from '@conquestk/shared/types/delta'
import { type Job, Worker } from 'bullmq'
import type { Server } from 'socket.io'
import { query } from '../config/database.js'
import { acquireLock, releaseLock } from '../config/redis.js'
import { aiDecisionService, type DecisionBudget } from '../services/aiDecisionService.js'
import { gameStateCache } from '../services/cacheService.js'
import { DeltaEmitter } from '../services/deltaEmitter.js'
import { GameService } from '../services/gameService.js'
import { jobIdempotencyService } from '../services/jobIdempotencyService.js'
import { aiTurnMetrics, socketPayloadMetrics } from '../services/metricsService.js'
import { type GameActionJob, queueService } from '../services/queueService.js'
import { startWorkerHeartbeat } from '../services/workerHeartbeat.js'
import { DeltaBuilder } from '../types/deltaUpdates.js'
import type {
  DeployAction,
  FortifyAction,
  GameAction,
  GamePhase,
  GameState,
  SerializedGameState,
} from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'

interface ProcessGameActionResult {
  success: true
  delta: GameDelta | null
  processed: boolean
}

export class GameActionWorker {
  private worker: Worker | null = null
  private queueName: string
  private gameService: GameService
  private deltaEmitter: DeltaEmitter
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, unknown>,
    { userId?: string }
  >

  constructor(
    io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, unknown>,
      { userId?: string }
    >,
  ) {
    this.gameService = new GameService()
    this.deltaEmitter = new DeltaEmitter(io)
    this.io = io
    this.queueName = queueService.getGameActionQueue().name
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

  private toBattleResultPayload(
    last: unknown,
  ): import('@conquestk/shared/types/delta').BattleResultDelta['battleResult'] | null {
    if (!last || typeof last !== 'object') return null
    const obj = last as Record<string, unknown>
    const from = obj.fromTerritory
    const to = obj.toTerritory
    const attackerLosses = obj.attackerLosses
    const defenderLosses = obj.defenderLosses
    const attackerDice = obj.attackerDice
    const defenderDice = obj.defenderDice
    const conquered = obj.conquered

    const fromOk =
      typeof from === 'object' &&
      from !== null &&
      typeof (from as Record<string, unknown>).id === 'string' &&
      typeof (from as Record<string, unknown>).armies === 'number'
    const toOk =
      typeof to === 'object' &&
      to !== null &&
      typeof (to as Record<string, unknown>).id === 'string' &&
      typeof (to as Record<string, unknown>).armies === 'number'
    const diceOk =
      Array.isArray(attackerDice) &&
      attackerDice.every((n) => typeof n === 'number') &&
      Array.isArray(defenderDice) &&
      defenderDice.every((n) => typeof n === 'number')
    if (
      !fromOk ||
      !toOk ||
      typeof attackerLosses !== 'number' ||
      typeof defenderLosses !== 'number' ||
      !diceOk ||
      typeof conquered !== 'boolean'
    ) {
      return null
    }
    const toRec = to as Record<string, unknown>
    const pending = obj.pendingConquestFor
    const gameEnded = obj.gameEnded
    const winner = obj.winner
    const eliminated = obj.eliminatedPlayers

    return {
      fromTerritory: {
        id: String((from as Record<string, unknown>).id),
        armies: Number((from as Record<string, unknown>).armies),
      },
      toTerritory: {
        id: String(toRec.id as string),
        armies: Number(toRec.armies as number),
        ...(typeof toRec.ownerId === 'string' || toRec.ownerId === null
          ? { ownerId: toRec.ownerId as string | null }
          : {}),
      },
      attackerLosses: Number(attackerLosses),
      defenderLosses: Number(defenderLosses),
      attackerDice: attackerDice as number[],
      defenderDice: defenderDice as number[],
      conquered: Boolean(conquered),
      ...(typeof pending === 'string' || pending === null
        ? { pendingConquestFor: pending as string | null }
        : {}),
      ...(typeof gameEnded === 'boolean' ? { gameEnded } : {}),
      ...(typeof winner === 'string' ? { winner } : {}),
      ...(Array.isArray(eliminated) && eliminated.every((v) => typeof v === 'string')
        ? { eliminatedPlayers: eliminated as string[] }
        : {}),
    }
  }

  async initialize(): Promise<void> {
    const processJob = async (job: Job): Promise<unknown> => {
      const started = Date.now()
      if (job.name === 'process-game-action') {
        const res = await this.processGameAction(job as Job<GameActionJob>)
        try {
          const { realtimeMetrics } = await import('../services/metricsService.js')
          const actionType = (job.data as GameActionJob).action?.type || 'unknown'
          realtimeMetrics.recordProcess(actionType, Date.now() - started)
        } catch {
          /* ignore */
        }
        return res
      }
      if (job.name === 'execute-ai-turn') {
        const res = await this.processAiTurn(job)
        try {
          const { realtimeMetrics } = await import('../services/metricsService.js')
          realtimeMetrics.recordProcess('ai_turn', Date.now() - started)
        } catch {
          /* ignore */
        }
        return res
      }
      logger.warn('Received unknown job for game-actions queue', { name: job.name, id: job.id })
      return null
    }

    {
      const Redis = (await import('ioredis')).default
      const redis = (await import('../config/redis.js')).getRedisClient()
      const baseOpts = (redis?.options ?? {}) as import('ioredis').RedisOptions
      const { commandTimeout: _omitCommandTimeout, ...withoutCommandTimeout } = baseOpts
      const connection = new Redis({
        ...withoutCommandTimeout,
        enableReadyCheck: false,
        lazyConnect: false,
        maxRetriesPerRequest: null,
      })
      this.worker = new Worker(this.queueName, processJob, {
        concurrency: 10,
        connection,
      })
    }

    this.worker.on('completed', (job, result) => {
      logger.info('✅ Game action job completed', {
        jobId: job.id,
        result,
      })
    })

    this.worker.on('failed', (job, error) => {
      logger.error('❌ Game action job failed', {
        jobId: job?.id,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : String(error),
      })
    })

    this.worker.on('error', (error) => {
      logger.error('❌ GameActionWorker encountered an error', {
        error: error instanceof Error ? error.message : error,
      })
    })

    // Start worker heartbeat for precise health
    startWorkerHeartbeat(this.queueName)

    logger.info('✅ GameActionWorker initialized')
  }

  private async processAiTurn(job: Job): Promise<ProcessGameActionResult> {
    const { gameId, playerId, turnNumber, budgetOverrides } = job.data as {
      gameId: string
      playerId: string
      turnNumber: number
      budgetOverrides?: Partial<import('../services/aiDecisionService.js').DecisionBudget>
    }

    const idKey = job.id !== undefined ? String(job.id) : `ai:${gameId}:${turnNumber}`

    const cached = await jobIdempotencyService.getProcessedJob<ProcessGameActionResult>(
      this.queueName,
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
        await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
        return result
      }

      if (state.turn !== turnNumber || state.currentPlayer !== playerId) {
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
        return result
      }

      const current = state.players.find((p) => p.id === playerId)
      if (!current || !current.isAi) {
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
        return result
      }

      const difficulty = current.aiDifficulty ?? 'recruit'
      const baseBudget = this.computeBudgetForDifficulty(difficulty)
      const computedReadableDelay =
        typeof process.env.AI_READABLE_DELAY_MS === 'string'
          ? Math.max(0, parseInt(process.env.AI_READABLE_DELAY_MS, 10) || 0)
          : (budgetOverrides?.readableDelayMs ?? baseBudget.readableDelayMs)
      const effectiveBudget: DecisionBudget = {
        ...baseBudget,
        ...(budgetOverrides || {}),
        ...(computedReadableDelay !== undefined ? { readableDelayMs: computedReadableDelay } : {}),
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
        const { GameLifecycleService } = await import('../services/gameLifecycleService.js')
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
      await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
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
    difficulty: import('../types/game.js').AIDifficulty
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
                const payload = this.toBattleResultPayload(last)
                if (payload) {
                  const battleDelta = DeltaBuilder.battleResult(gameId, payload, updated.version)
                  const withChanges: import('@conquestk/shared/types/delta').BattleResultDelta & {
                    changes?: import('@conquestk/shared/types/delta').GameDelta[]
                  } = {
                    ...battleDelta,
                    changes: [
                      DeltaBuilder.territoryUpdate(
                        gameId,
                        payload.fromTerritory.id,
                        { armies: payload.fromTerritory.armies },
                        updated.version,
                      ),
                      DeltaBuilder.territoryUpdate(
                        gameId,
                        payload.toTerritory.id,
                        {
                          armies: payload.toTerritory.armies,
                          ...(payload.toTerritory.ownerId !== undefined
                            ? { ownerId: payload.toTerritory.ownerId ?? undefined }
                            : {}),
                        },
                        updated.version,
                      ),
                    ],
                  }
                  // Build fog-aware textual moves for this battle
                  const moves: Array<import('../services/logEmitter.js').DbMove> = []
                  const now = new Date()
                  const attacker = updated.players.find((p) => p.id === playerId)
                  const actorName = attacker?.username || playerId
                  const fromId = payload.fromTerritory.id
                  const toId = payload.toTerritory.id
                  const fromT = updated.board.find((t) => t.id === fromId)
                  const toT = updated.board.find((t) => t.id === toId)
                  const fromOwnerName = attacker?.username || playerId
                  const toOwnerName = undefined
                  moves.push({
                    id: `${now.getTime()}-atk`,
                    game_id: gameId,
                    turn_number: updated.turn,
                    phase: updated.phase,
                    move_type: 'attack',
                    actor_id: playerId,
                    created_at: now,
                    payload: {
                      actorName,
                      fromId,
                      toId,
                      fromName: fromT?.name,
                      toName: toT?.name,
                      fromOwnerName,
                      toOwnerName,
                      kills: payload.defenderLosses,
                      losses: payload.attackerLosses,
                    },
                  })
                  if (payload.conquered) {
                    moves.push({
                      id: `${now.getTime()}-conq`,
                      game_id: gameId,
                      turn_number: updated.turn,
                      phase: updated.phase,
                      move_type: 'conquer',
                      actor_id: playerId,
                      created_at: now,
                      payload: {
                        actorName,
                        fromId,
                        toId,
                        fromName: fromT?.name,
                        toName: toT?.name,
                        fromOwnerName,
                        toOwnerName,
                      },
                    })
                  }
                  if (Array.isArray(payload.eliminatedPlayers)) {
                    for (const pid of payload.eliminatedPlayers) {
                      const defeatedName =
                        updated.players.find((p) => p.id === pid)?.username || pid
                      moves.push({
                        id: `${now.getTime()}-elim-${pid}`,
                        game_id: gameId,
                        turn_number: updated.turn,
                        phase: updated.phase,
                        move_type: 'player_eliminated',
                        actor_id: pid,
                        created_at: now,
                        payload: { playerName: defeatedName, byName: actorName },
                      })
                    }
                  }
                  const { emitCombined } = await import('../services/realtimeEmitter.js')
                  try {
                    const { persistMoves } = await import('../services/logEmitter.js')
                    await persistMoves(gameId, moves)
                  } catch {
                    // best-effort persistence of textual moves
                  }
                  await emitCombined(
                    this.io as unknown as any,
                    gameId,
                    { deltas: [withChanges], moves },
                    updated,
                  )
                }
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
              action as Extract<import('../types/game.js').GameAction, { type: 'trade_cards' }>,
              playerId,
            )
            // Co-emit concise deltas + textual move in one sweep
            try {
              const postPlayer = updated.players.find((p) => p.id === playerId)
              const postBank = postPlayer?.armies ?? prevBank
              const gained = Math.max(0, Number(postBank) - Number(prevBank))
              const mustCash =
                typeof postPlayer?.mustCashInTreasures === 'boolean'
                  ? postPlayer?.mustCashInTreasures
                  : undefined
              const playerDelta = DeltaBuilder.playerUpdate(
                gameId,
                playerId,
                {
                  armies: Number(postBank),
                  ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
                },
                updated.version,
              )
              const deltas: GameDelta[] = [playerDelta]
              if (updated.phase !== prevPhase) {
                deltas.push(
                  DeltaBuilder.phaseChange(
                    gameId,
                    updated.phase as 'reinforcement' | 'attack' | 'fortify' | 'finished',
                    updated.currentPlayer,
                    updated.turn,
                    Number(postBank),
                    updated.version,
                  ),
                )
              }
              const username = postPlayer?.username || playerId
              const move: import('../services/logEmitter.js').DbMove = {
                id: `${Date.now()}-trade`,
                game_id: gameId,
                turn_number: updated.turn,
                phase: updated.phase,
                move_type: 'trade_cards',
                actor_id: playerId,
                created_at: new Date(),
                payload: { actorName: username, bonus: gained },
              }
              const { emitCombined } = await import('../services/realtimeEmitter.js')
              await emitCombined(
                this.io as unknown as any,
                gameId,
                { deltas, moves: [move] },
                updated,
              )
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
      ...(fallbackReason ? { fallbackReason } : {}),
      thinkTimeMs: Date.now() - start,
      plannedActions: actions.length,
      appliedActions: applied,
    })
  }

  private computeBudgetForDifficulty(
    difficulty: import('../types/game.js').AIDifficulty,
  ): import('../services/aiDecisionService.js').DecisionBudget {
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

  private async processGameAction(job: Job<GameActionJob>): Promise<ProcessGameActionResult> {
    const { gameId, playerId, action, socketId, idempotencyKey } = job.data
    const idKey =
      idempotencyKey ??
      (job.id !== undefined ? String(job.id) : `${gameId}:${playerId}:${action.type}`)

    const cached = await jobIdempotencyService.getProcessedJob<ProcessGameActionResult>(
      this.queueName,
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

    let lockToken: string | null = null
    const lockKey = `lock:game-actions:${gameId}`

    try {
      // Serialize actions per game to avoid race conditions on rapid clicks
      // Attempt to acquire quickly, with a short spin-wait window
      const startWait = Date.now()
      lockToken = await acquireLock(lockKey, 5000)
      while (!lockToken) {
        if (Date.now() - startWait > 1500) break
        await new Promise((r) => setTimeout(r, 25))
        lockToken = await acquireLock(lockKey, 5000)
      }

      logger.debug('Processing game action', {
        gameId,
        playerId,
        actionType: action.type,
      })

      // Special handling for automatic timeout progression before any validation
      if ((job.data as { turnTimeoutStage?: 'expire' }).turnTimeoutStage === 'expire') {
        try {
          const { GameLifecycleService } = await import('../services/gameLifecycleService.js')
          const lifecycle = new GameLifecycleService()
          await lifecycle.handleTurnTimeout(gameId)
        } catch (e) {
          logger.warn('Turn timeout handling failed', {
            roomId: gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
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
          await this.recordMove(gameId, playerId, currentState.turn, 'attack', action.payload)
          const updated = await this.gameService.processGameAction(action, playerId)
          const last = updated.lastBattleResult
          if (last) {
            try {
              const payload = this.toBattleResultPayload(last)
              if (payload) {
                const battleDelta = DeltaBuilder.battleResult(gameId, payload, updated.version)
                const withChanges: import('@conquestk/shared/types/delta').BattleResultDelta & {
                  changes?: import('@conquestk/shared/types/delta').GameDelta[]
                } = {
                  ...battleDelta,
                  changes: [
                    DeltaBuilder.territoryUpdate(
                      gameId,
                      payload.fromTerritory.id,
                      { armies: payload.fromTerritory.armies },
                      updated.version,
                    ),
                    DeltaBuilder.territoryUpdate(
                      gameId,
                      payload.toTerritory.id,
                      {
                        armies: payload.toTerritory.armies,
                        ...(payload.toTerritory.ownerId !== undefined
                          ? { ownerId: payload.toTerritory.ownerId ?? undefined }
                          : {}),
                      },
                      updated.version,
                    ),
                  ],
                }
                // Build textual moves for unified emission
                const moves: Array<import('../services/logEmitter.js').DbMove> = []
                const now = new Date()
                const attacker = updated.players.find((p) => p.id === playerId)
                const actorName = attacker?.username || playerId
                const fromId = payload.fromTerritory.id
                const toId = payload.toTerritory.id
                const fromT = updated.board.find((t) => t.id === fromId)
                const toT = updated.board.find((t) => t.id === toId)
                const fromOwnerName = attacker?.username || playerId
                const toOwnerName = undefined
                moves.push({
                  id: `${now.getTime()}-atk`,
                  game_id: gameId,
                  turn_number: updated.turn,
                  phase: updated.phase,
                  move_type: 'attack',
                  actor_id: playerId,
                  created_at: now,
                  payload: {
                    actorName,
                    fromId,
                    toId,
                    fromName: fromT?.name,
                    toName: toT?.name,
                    fromOwnerName,
                    toOwnerName,
                    kills: payload.defenderLosses,
                    losses: payload.attackerLosses,
                  },
                })
                if (payload.conquered) {
                  moves.push({
                    id: `${now.getTime()}-conq`,
                    game_id: gameId,
                    turn_number: updated.turn,
                    phase: updated.phase,
                    move_type: 'conquer',
                    actor_id: playerId,
                    created_at: now,
                    payload: {
                      actorName,
                      fromId,
                      toId,
                      fromName: fromT?.name,
                      toName: toT?.name,
                      fromOwnerName,
                      toOwnerName,
                    },
                  })
                }
                if (Array.isArray(payload.eliminatedPlayers)) {
                  for (const pid of payload.eliminatedPlayers) {
                    const defeatedName = updated.players.find((p) => p.id === pid)?.username || pid
                    moves.push({
                      id: `${now.getTime()}-elim-${pid}`,
                      game_id: gameId,
                      turn_number: updated.turn,
                      phase: updated.phase,
                      move_type: 'player_eliminated',
                      actor_id: pid,
                      created_at: now,
                      payload: { playerName: defeatedName, byName: actorName },
                    })
                  }
                }
                const { emitCombined } = await import('../services/realtimeEmitter.js')
                await emitCombined(
                  this.io as unknown as any,
                  gameId,
                  { deltas: [withChanges], moves },
                  updated,
                )
              }
            } catch (e) {
              logger.debug('Failed to emit fog-filtered battle delta in worker attack', {
                roomId: gameId,
                error: e instanceof Error ? e.message : e,
              })
            }
          }
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

        case 'transfer_conquest': {
          // Post-conquest transfer: emit concise territory deltas
          const payload = (
            action as Extract<import('../types/game.js').GameAction, { type: 'transfer_conquest' }>
          ).payload as { fromTerritoryId: string; toTerritoryId: string; armies: number }
          const transfer = await this.gameService.transferConquestArmies(
            gameId,
            playerId,
            payload.fromTerritoryId,
            payload.toTerritoryId,
            payload.armies,
          )
          try {
            const updates: import('@conquestk/shared/types/delta').GameDelta[] = [
              DeltaBuilder.territoryUpdate(gameId, payload.fromTerritoryId, {
                armies: transfer.fromArmies,
              }),
              DeltaBuilder.territoryUpdate(gameId, payload.toTerritoryId, {
                armies: transfer.toArmies,
              }),
            ]
            const { emitFogFilteredDelta } = await import('../services/fogService.js')
            for (const d of updates) {
              await emitFogFilteredDelta(this.io, gameId, d)
            }
          } catch {
            // best-effort
          }
          // Record move
          await this.recordMove(gameId, playerId, currentState.turn, 'transfer_conquest', payload)
          // Do not broadcast extra delta below
          shouldBroadcast = false
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
            const gainedLocal = Math.max(0, (postBank as number) - prevBank)
            const _mustCash =
              typeof postPlayer?.mustCashInTreasures === 'boolean'
                ? postPlayer?.mustCashInTreasures
                : undefined
            if (gainedLocal > 0) {
              // Try to derive card names from the pre-trade hand and the submitted indices
              let cardNames: string[] | undefined
              try {
                const before = currentState.players.find((p) => p.id === playerId)
                const sel = (action as { payload?: { treasureSet?: number[] } }).payload
                  ?.treasureSet
                if (before && Array.isArray(before.treasures) && Array.isArray(sel)) {
                  const hand = before.treasures
                  cardNames = sel
                    .map((idx) => Number(idx))
                    .filter((idx) => Number.isFinite(idx))
                    .map((idx) => hand[idx])
                    .map((m) => String(m))
                }
              } catch {
                /* ignore */
              }
              const baseLog: Record<string, unknown> = {
                type: 'TREASURE_CASH',
                timestamp: new Date().toISOString(),
                playerId,
                troops: gainedLocal,
              }
              const maybeCards = cardNames && cardNames.length === 3 ? cardNames : undefined
              const a = action as Extract<
                import('../types/game.js').GameAction,
                { type: 'trade_cards' }
              >
              const cardsLen = Array.isArray(a.payload?.cards)
                ? a.payload?.cards.length
                : Array.isArray(a.payload?.treasureSet)
                  ? a.payload?.treasureSet.length
                  : undefined
              const fullLog = {
                ...baseLog,
                ...(maybeCards ? { cards: maybeCards } : {}),
                ...(typeof cardsLen === 'number' ? { cardCount: cardsLen } : {}),
              }
              type GameLogEntryType = Parameters<GameService['appendLog']>[1][number]
              const entry: GameLogEntryType = fullLog as GameLogEntryType
              await this.gameService.appendLog(gameId, [entry])
            }
          } catch (logErr) {
            logger.debug('Skipped appending treasure cash log', {
              roomId: gameId,
              playerId,
              error: logErr instanceof Error ? logErr.message : logErr,
            })
          }
          // Co-emit concise deltas + textual move in one sweep
          try {
            const postPlayer = serialized?.players?.find((p) => p.id === playerId)
            const postBank = postPlayer?.armies ?? prevBank
            const mustCash =
              typeof postPlayer?.mustCashInTreasures === 'boolean'
                ? postPlayer?.mustCashInTreasures
                : undefined
            const playerDelta = DeltaBuilder.playerUpdate(
              gameId,
              playerId,
              {
                armies: Number(postBank),
                ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
              },
              version,
            )
            const deltas: GameDelta[] = [playerDelta]
            if (newPhase !== currentState.phase) {
              deltas.push(
                DeltaBuilder.phaseChange(
                  gameId,
                  newPhase as 'reinforcement' | 'attack' | 'fortify' | 'finished',
                  (serialized?.currentPlayer ?? playerId) as string,
                  (serialized?.turn ?? currentState.turn) as number,
                  Number(postBank),
                  version,
                ),
              )
            }
            // If we computed a positive gain, emit a textual trade summary
            if (Number(postBank) - Number(prevBank) > 0) {
              const username = postPlayer?.username || playerId
              const move: import('../services/logEmitter.js').DbMove = {
                id: `${Date.now()}-trade`,
                game_id: gameId,
                turn_number: (serialized?.turn ?? currentState.turn) as number,
                phase: (serialized?.phase ?? currentState.phase) as string,
                move_type: 'trade_cards',
                actor_id: playerId,
                created_at: new Date(),
                payload: {
                  actorName: username,
                  bonus: Math.max(0, Number(postBank) - Number(prevBank)),
                },
              }
              const { emitCombined } = await import('../services/realtimeEmitter.js')
              await emitCombined(
                this.io as unknown as any,
                gameId,
                { deltas, moves: [move] },
                undefined,
              )
            } else {
              // No textual move to include; emit deltas individually
              const { emitFogFilteredDelta } = await import('../services/fogService.js')
              for (const d of deltas) await emitFogFilteredDelta(this.io, gameId, d)
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
        const { emitFogFilteredDelta } = await import('../services/fogService.js')
        await emitFogFilteredDelta(this.io, gameId, delta)
      }

      const result: ProcessGameActionResult = {
        success: true,
        delta: delta || null,
        processed: true,
      }
      await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60)
      return result
    } catch (error) {
      logger.error('❌ Failed to process game action', {
        gameId,
        playerId,
        actionType: action.type,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : String(error),
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
    } finally {
      if (lockToken) {
        try {
          await releaseLock(lockKey, lockToken)
        } catch {
          // best-effort
        }
      }
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

    // Co-emit deltas + textual fortify in a single sweep
    try {
      const updated = await this.gameService.getGameState(gameId)
      if (updated) {
        const deltas: GameDelta[] = []
        if (typeof result.fromArmies === 'number') {
          deltas.push(
            DeltaBuilder.territoryUpdate(gameId, fromTerritoryId, { armies: result.fromArmies }),
          )
        }
        if (typeof result.toArmies === 'number') {
          deltas.push(
            DeltaBuilder.territoryUpdate(gameId, toTerritoryId, { armies: result.toArmies }),
          )
        }
        // Include a concise FORTIFY_RESULT for UI movement tracking
        deltas.push({
          type: 'FORTIFY_RESULT',
          roomId: gameId,
          timestamp: Date.now(),
          fromTerritoryId,
          toTerritoryId,
          movedArmies: Number(action.payload?.armies || 0),
          fromArmies: Number(result.fromArmies || 0),
          toArmies: Number(result.toArmies || 0),
          playerId,
        } as import('@conquestk/shared/types/delta').FortifyResultDelta)

        const player = updated.players.find((p) => p.id === playerId)
        const actorName = player?.username || playerId
        const fromT = updated.board.find((t) => t.id === fromTerritoryId)
        const toT = updated.board.find((t) => t.id === toTerritoryId)
        const move: import('../services/logEmitter.js').DbMove = {
          id: `${Date.now()}-fortify`,
          game_id: gameId,
          turn_number: updated.turn,
          phase: updated.phase,
          move_type: 'fortify',
          actor_id: playerId,
          created_at: new Date(),
          payload: {
            actorName,
            fromId: fromTerritoryId,
            toId: toTerritoryId,
            fromName: fromT?.name,
            toName: toT?.name,
            fromOwnerName: actorName,
            toOwnerName: actorName,
            armies: Number(action.payload?.armies || 0),
          },
        }
        const { emitCombined } = await import('../services/realtimeEmitter.js')
        await emitCombined(this.io as unknown as any, gameId, { deltas, moves: [move] }, updated)
      }
    } catch {
      // best-effort; clients will converge on next snapshot
    }

    // Return a minimal delta for caller broadcast fallback (usually ignored)
    return DeltaBuilder.territoryUpdate(gameId, toTerritoryId, { armies: result.toArmies })
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    // Use full endTurn result for parity with inline path
    const result = await this.gameService.endTurn(gameId, playerId)

    // Emit treasure awarded (if any) before phase change for UX parity
    try {
      if (result.treasureAwarded) {
        const delta: Partial<import('@conquestk/shared/types/delta').TreasureAwardedDelta> & {
          type: 'TREASURE_AWARDED'
          roomId: string
          timestamp: number
          userId: string
          metal: import('@conquestk/shared/types').Metal
        } = {
          type: 'TREASURE_AWARDED',
          roomId: gameId,
          timestamp: Date.now(),
          userId: playerId,
          metal: result.treasureAwarded,
        }
        // Emit treasure delta immediately for UI cues
        this.io.to(`game:${gameId}`).emit('game-delta', delta)
        try {
          const { deltaBufferService } = await import('../services/deltaBufferService.js')
          await deltaBufferService.append(gameId, [
            delta as unknown as import('@conquestk/shared/types/delta').GameDelta,
          ])
        } catch {
          // best-effort
        }
        // Also emit a concise textual move for parity with inline path
        try {
          const updated = await this.gameService.getGameState(gameId)
          const username = updated?.players.find((p) => p.id === playerId)?.username || playerId
          const move: import('../services/logEmitter.js').DbMove = {
            id: `${Date.now()}-award`,
            game_id: gameId,
            turn_number: updated?.turn ?? 1,
            phase: updated?.phase ?? 'reinforcement',
            move_type: 'card_award',
            actor_id: playerId,
            created_at: new Date(),
            payload: { actorName: username },
          }
          const { emitCombined } = await import('../services/realtimeEmitter.js')
          await emitCombined(
            this.io as unknown as any,
            gameId,
            { moves: [move] },
            updated || undefined,
          )
        } catch {
          /* ignore textual move failures */
        }
      }
    } catch (_e) {
      // best-effort
    }

    try {
      const { GameLifecycleService } = await import('../services/gameLifecycleService.js')
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

    return DeltaBuilder.phaseChange(
      gameId,
      result.gameState.phase,
      result.gameState.currentPlayer,
      result.gameState.turn,
      result.reinforcementArmies,
    )
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
