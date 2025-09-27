import type { BattleResultDelta, GameDelta, GameEndDelta } from '@risk-game/shared/types'
import type Bull from 'bull'
import type { Server } from 'socket.io'
import { GameService } from '../services/gameService'
import { jobIdempotencyService } from '../services/jobIdempotencyService'
import { type BattleSimulationJob, queueService } from '../services/queueService'
import { DeltaBuilder } from '../types/deltaUpdates'
import type { GameState } from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'

interface BattleResult {
  attackerLosses: number
  defenderLosses: number
  territoryConquered: boolean
  attackingArmiesRemaining: number
  defendingArmiesRemaining: number
  dice: {
    attacker: number[]
    defender: number[]
  }
}

export class BattleWorker {
  private queue: Bull.Queue<BattleSimulationJob>
  private gameService: GameService
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService()
    this.io = io
    // Get the queue from the service - will be set after queueService initialization
    this.queue = queueService.getBattleQueue()
  }

  async initialize(): Promise<void> {
    // Process battle simulation jobs
    this.queue.process('simulate-battle', 5, async (job: Bull.Job<BattleSimulationJob>) => {
      return this.simulateBattle(job)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      logger.info('⚔️ Battle simulation job completed', {
        jobId: job.id,
        result,
      })
    })

    this.queue.on('failed', (job, error) => {
      logger.error('❌ Battle simulation job failed', {
        jobId: job.id,
        error,
      })
    })

    this.queue.on('stalled', (job) => {
      logger.warn('⚠️ Battle simulation job stalled', { jobId: job.id })
    })

    logger.info('✅ BattleWorker initialized')
  }

  private async simulateBattle(job: Bull.Job<BattleSimulationJob>): Promise<BattleResult> {
    const {
      gameId,
      attackingTerritory,
      defendingTerritory,
      attackingArmies,
      defendingArmies,
      playerId,
      idempotencyKey,
    } = job.data
    const jobId = job.id !== undefined ? String(job.id) : `${gameId}:${Date.now()}`
    const idKey = idempotencyKey ?? jobId

    const cached = await jobIdempotencyService.getProcessedJob<BattleResult>(this.queue.name, idKey)
    if (cached.exists && cached.value) {
      logger.info('♻️ Skipping already processed battle simulation job', {
        jobId,
        gameId,
        attackingTerritory,
        defendingTerritory,
      })
      return cached.value
    }

    try {
      logger.debug('Simulating battle', {
        gameId,
        attackingTerritory,
        defendingTerritory,
        playerId,
      })

      // Simulate dice roll and battle outcome
      const battleResult = this.calculateBattleResult(attackingArmies, defendingArmies)

      // Apply battle results to game state
      const gameState = await this.gameService.getGameState(gameId)
      if (!gameState) {
        throw new Error(`Game ${gameId} not found during battle`)
      }

      // Update territories based on battle result
      const attackingTerr = gameState.board.find((territory) => territory.id === attackingTerritory)
      const defendingTerr = gameState.board.find((territory) => territory.id === defendingTerritory)

      if (!attackingTerr || !defendingTerr) {
        throw new Error('Territory not found during battle processing')
      }

      // Calculate new army counts
      const newAttackingArmies = attackingTerr.armies - battleResult.attackerLosses
      const newDefendingArmies = defendingTerr.armies - battleResult.defenderLosses

      const deltas: GameDelta[] = []
      const attackerOwnerId = attackingTerr.ownerId ?? playerId
      const defenderOwnerId = defendingTerr.ownerId ?? null

      const preMoveArmies = Math.max(newAttackingArmies, 0)
      const movingArmies = battleResult.territoryConquered
        ? Math.max(0, Math.min(attackingArmies, preMoveArmies - 1))
        : 0
      const finalAttackerArmies = battleResult.territoryConquered
        ? Math.max(preMoveArmies - movingArmies, 1)
        : Math.max(preMoveArmies, 1)
      const finalDefenderArmies = battleResult.territoryConquered
        ? Math.max(movingArmies, 0)
        : Math.max(newDefendingArmies, 0)

      if (battleResult.territoryConquered) {
        // Territory conquered - transfer ownership
        // Update attacking territory
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, attackingTerritory, {
            armies: finalAttackerArmies,
          }),
        )

        // Update defending territory (new owner)
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, defendingTerritory, {
            armies: finalDefenderArmies,
            ownerId: attackerOwnerId,
          }),
        )

        // Check for player elimination
        const remainingTerritories = gameState.board.filter(
          (territory) =>
            territory.ownerId === defendingTerr.ownerId && territory.id !== defendingTerritory,
        )

        if (remainingTerritories.length === 0) {
          // Player eliminated - use player update delta to mark as eliminated
          if (defenderOwnerId) {
            deltas.push(
              DeltaBuilder.playerUpdate(gameId, defenderOwnerId, {
                isEliminated: true,
                territories: [],
              }),
            )
          }
        }

        // Check for game victory
        const remainingPlayers = gameState.players.filter((player) => {
          return gameState.board.some(
            (territory) => this.getTerritoryOwnerId(territory) === player.id,
          )
        })

        if (remainingPlayers.length === 1) {
          deltas.push({
            type: 'GAME_END',
            roomId: gameId,
            winner: playerId,
            eliminatedPlayers: gameState.players
              .filter(
                (player) =>
                  !gameState.board.some(
                    (territory) => this.getTerritoryOwnerId(territory) === player.id,
                  ),
              )
              .map((player) => player.id),
            timestamp: Date.now(),
          } as GameEndDelta)
        }
      } else {
        // Territory defended successfully
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, attackingTerritory, {
            armies: finalAttackerArmies,
          }),
        )

        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, defendingTerritory, {
            armies: finalDefenderArmies,
          }),
        )
      }

      // Create compound delta for all battle results
      const battleDelta: BattleResultDelta & { changes: GameDelta[] } = {
        type: 'BATTLE_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        battleResult: {
          attackerId: attackerOwnerId,
          defenderId: defenderOwnerId ?? null,
          ...battleResult,
          fromTerritory: {
            id: attackingTerritory,
            armies: finalAttackerArmies,
          },
          toTerritory: {
            id: defendingTerritory,
            armies: finalDefenderArmies,
            ownerId: battleResult.territoryConquered
              ? attackerOwnerId
              : (defenderOwnerId ?? attackerOwnerId),
          },
          conquered: battleResult.territoryConquered,
          attackerDice: battleResult.dice.attacker,
          defenderDice: battleResult.dice.defender,
        },
        changes: deltas,
      }

      // Broadcast battle results with fog-of-war filtering per viewer
      const { emitFogFilteredDelta } = await import('../services/fogService')
      await emitFogFilteredDelta(this.io as unknown as Server, gameId, battleDelta)

      // Update persistent game state
      await this.gameService.applyBattleResult(gameId, {
        jobId,
        attackerLosses: battleResult.attackerLosses,
        defenderLosses: battleResult.defenderLosses,
        territoryConquered: battleResult.territoryConquered,
        attackingArmiesRemaining: preMoveArmies,
        defendingArmiesRemaining: Math.max(newDefendingArmies, 0),
        dice: battleResult.dice,
        attackingTerritoryId: attackingTerritory,
        defendingTerritoryId: defendingTerritory,
        attackingPlayerId: attackerOwnerId,
        defendingPlayerId: defenderOwnerId,
        attackingArmiesCommitted: attackingArmies,
      })

      // If visibility changed (on conquest), send filtered snapshots to affected players
      if (battleResult.territoryConquered) {
        const { emitRevealSnapshot } = await import('../services/fogService')

        // Fetch updated state to build correct masks
        const updatedState = await this.gameService.getGameState(gameId)

        const viewers = new Set<string>()
        if (attackerOwnerId) viewers.add(attackerOwnerId)
        if (defenderOwnerId) viewers.add(defenderOwnerId)

        // Include teammates if team play is enabled
        if (updatedState?.gameConfig?.allowTeamPlay) {
          const attackerTeam = updatedState.players.find((p) => p.id === attackerOwnerId)?.teamId
          const defenderTeam = updatedState.players.find((p) => p.id === defenderOwnerId)?.teamId

          if (attackerTeam && attackerTeam > 0) {
            updatedState.players
              .filter((p) => p.teamId === attackerTeam)
              .forEach((p) => {
                viewers.add(p.id)
              })
          }
          if (defenderTeam && defenderTeam > 0) {
            updatedState.players
              .filter((p) => p.teamId === defenderTeam)
              .forEach((p) => {
                viewers.add(p.id)
              })
          }
        }

        for (const viewerId of viewers) {
          await emitRevealSnapshot(
            this.io as unknown as Server,
            gameId,
            viewerId,
            updatedState ?? undefined,
          )
        }
      }

      await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, battleResult, 60 * 60)

      return battleResult
    } catch (error) {
      logger.error('❌ Battle simulation failed during processing', {
        gameId,
        attackingTerritory,
        defendingTerritory,
        error,
      })

      // Emit battle error to game room
      this.io.to(`game:${gameId}`).emit('error', {
        event: 'battle:error',
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
      })

      throw error
    }
  }

  private calculateBattleResult(attackingArmies: number, defendingArmies: number): BattleResult {
    // Limit armies in battle (max 3 attacking, max 2 defending)
    const attackerDice = Math.min(attackingArmies, 3)
    const defenderDice = Math.min(defendingArmies, 2)

    // Roll dice
    const attackerRolls = this.rollDice(attackerDice).sort((a, b) => b - a)
    const defenderRolls = this.rollDice(defenderDice).sort((a, b) => b - a)

    let attackerLosses = 0
    let defenderLosses = 0

    // Compare highest dice first, then second highest if both exist
    for (let i = 0; i < Math.min(attackerRolls.length, defenderRolls.length); i++) {
      if (attackerRolls[i] > defenderRolls[i]) {
        defenderLosses++
      } else {
        attackerLosses++
      }
    }

    const attackingArmiesRemaining = attackingArmies - attackerLosses
    const defendingArmiesRemaining = defendingArmies - defenderLosses
    const territoryConquered = defendingArmiesRemaining === 0

    return {
      attackerLosses,
      defenderLosses,
      territoryConquered,
      attackingArmiesRemaining,
      defendingArmiesRemaining,
      dice: {
        attacker: attackerRolls,
        defender: defenderRolls,
      },
    }
  }

  private rollDice(count: number): number[] {
    const rolls: number[] = []
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * 6) + 1)
    }
    return rolls
  }

  private getTerritoryOwnerId(territory: GameState['board'][number]): string | null {
    return territory.ownerId ?? null
  }
}

// Export factory function instead of singleton
export const createBattleWorker = (io: Server<ClientToServerEvents, ServerToClientEvents>) =>
  new BattleWorker(io)
