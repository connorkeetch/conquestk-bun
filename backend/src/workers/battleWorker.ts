import type Bull from 'bull'
import type { Server } from 'socket.io'
import { GameService } from '../services/gameService'
import { type BattleSimulationJob, queueService } from '../services/queueService'
import { DeltaBuilder, type GameDelta, type GameEndDelta } from '../types/deltaUpdates'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'

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
      return this.simulateBattle(job.data)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      console.log(`⚔️ Battle simulation completed: ${job.id}`)
    })

    this.queue.on('failed', (job, error) => {
      console.error(`❌ Battle simulation failed: ${job.id}`, error)
    })

    this.queue.on('stalled', (job) => {
      console.warn(`⚠️ Battle simulation stalled: ${job.id}`)
    })

    console.log('✅ BattleWorker initialized')
  }

  private async simulateBattle(jobData: BattleSimulationJob): Promise<BattleResult> {
    const {
      gameId,
      attackingTerritory,
      defendingTerritory,
      attackingArmies,
      defendingArmies,
      playerId,
    } = jobData

    try {
      console.log(`⚔️ Simulating battle: ${attackingTerritory} vs ${defendingTerritory}`)

      // Simulate dice roll and battle outcome
      const battleResult = this.calculateBattleResult(attackingArmies, defendingArmies)

      // Apply battle results to game state
      const gameState = await this.gameService.getGameState(gameId)
      if (!gameState) {
        throw new Error(`Game ${gameId} not found during battle`)
      }

      // Update territories based on battle result
      const attackingTerr = gameState.board.find((t: any) => t.id === attackingTerritory)
      const defendingTerr = gameState.board.find((t: any) => t.id === defendingTerritory)

      if (!attackingTerr || !defendingTerr) {
        throw new Error('Territory not found during battle processing')
      }

      // Calculate new army counts
      const newAttackingArmies = attackingTerr.armies - battleResult.attackerLosses
      const newDefendingArmies = defendingTerr.armies - battleResult.defenderLosses

      const deltas: GameDelta[] = []

      if (battleResult.territoryConquered) {
        // Territory conquered - transfer ownership
        const movingArmies = Math.min(attackingArmies, newAttackingArmies - 1)

        // Update attacking territory
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, attackingTerritory, {
            armies: newAttackingArmies - movingArmies,
          }),
        )

        // Update defending territory (new owner)
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, defendingTerritory, {
            armies: movingArmies,
            ownerId: attackingTerr.ownerId!,
          }),
        )

        // Check for player elimination
        const defendingPlayer = gameState.players.find((p: any) => p.id === defendingTerr.ownerId)
        const remainingTerritories = gameState.board.filter(
          (t: any) => t.ownerId === defendingTerr.ownerId && t.id !== defendingTerritory,
        )

        if (remainingTerritories.length === 0) {
          // Player eliminated - use player update delta to mark as eliminated
          deltas.push(
            DeltaBuilder.playerUpdate(gameId, defendingTerr.ownerId!, {
              isEliminated: true,
              territories: [],
            }),
          )
        }

        // Check for game victory
        const remainingPlayers = gameState.players.filter((p: any) => {
          return gameState.board.some((t: any) => t.owner === p.id)
        })

        if (remainingPlayers.length === 1) {
          deltas.push({
            type: 'GAME_END',
            roomId: gameId,
            winner: playerId,
            eliminatedPlayers: gameState.players
              .filter((p: any) => !gameState.board.some((t: any) => t.owner === p.id))
              .map((p: any) => p.id),
            timestamp: Date.now(),
          } as GameEndDelta)
        }
      } else {
        // Territory defended successfully
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, attackingTerritory, {
            armies: newAttackingArmies,
          }),
        )

        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, defendingTerritory, {
            armies: newDefendingArmies,
          }),
        )
      }

      // Create compound delta for all battle results
      const battleDelta: any = {
        type: 'BATTLE_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        battleResult: {
          ...battleResult,
          fromTerritory: {
            id: attackingTerritory,
            name: attackingTerr.name,
            armies: attackingTerr.armies - battleResult.attackerLosses,
          },
          toTerritory: {
            id: defendingTerritory,
            name: defendingTerr.name,
            armies: defendingTerr.armies - battleResult.defenderLosses,
            ownerId: battleResult.territoryConquered
              ? attackingTerr.ownerId!
              : defendingTerr.ownerId!,
          },
          conquered: battleResult.territoryConquered,
          attackerDice: battleResult.dice.attacker,
          defenderDice: battleResult.dice.defender,
        },
        changes: deltas,
      }

      // Broadcast battle results
      this.io.to(`game:${gameId}`).emit('game-delta', battleDelta)

      // Update persistent game state
      // TODO: Implement applyBattleResult method in GameService
      // await this.gameService.applyBattleResult(gameId, battleResult, attackingTerritory, defendingTerritory)

      return battleResult
    } catch (error) {
      console.error(`❌ Battle simulation failed:`, error)

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
}

// Export factory function instead of singleton
export const createBattleWorker = (io: Server<ClientToServerEvents, ServerToClientEvents>) =>
  new BattleWorker(io)
