import { GameEngine } from '../game/gameEngine.js'
import type { GameAction, GameState } from '../types/game.js'
import { logger } from '../utils/logger.js'

export interface Command {
  id: string // UUID for idempotency
  type: string
  playerId: string
  gameId: string
  baseVersion: number
  timestamp: number
  payload: unknown
}

export interface CommandResult {
  status: 'success' | 'duplicate' | 'version_mismatch' | 'not_your_turn' | 'invalid'
  error?: string
  event?: GameEvent
  newVersion?: number
  currentVersion?: number
}

export interface GameEvent {
  id: string
  seq: number
  type: string
  gameId: string
  version: number
  timestamp: string
  playerId?: string
  payload: unknown
}

export class CommandProcessor {
  private gameEngine: GameEngine
  private commandCache: Map<string, CommandResult> = new Map() // For deduplication
  private readonly CACHE_TTL_MS = 3600000 // 1 hour

  constructor() {
    this.gameEngine = new GameEngine()
  }

  /**
   * Process a command with full validation pipeline
   */
  async processCommand(command: Command, currentState: GameState): Promise<CommandResult> {
    // Step 1: Deduplication check
    const cached = this.commandCache.get(command.id)
    if (cached) {
      logger.debug('Command deduplicated', { commandId: command.id })
      return { ...cached, status: 'duplicate' }
    }

    // Step 2: Version check
    const stateVersion = currentState.version ?? 0
    if (command.baseVersion !== stateVersion) {
      logger.warn('Command version mismatch', {
        commandId: command.id,
        commandVersion: command.baseVersion,
        stateVersion,
      })
      return {
        status: 'version_mismatch',
        currentVersion: stateVersion,
        error: 'Client state is stale',
      }
    }

    // Step 3: Turn validation
    if (currentState.currentPlayer !== command.playerId) {
      // Allow some commands even when not current player (like resign)
      const allowedOffTurn = ['resign']
      if (!allowedOffTurn.includes(command.type)) {
        return {
          status: 'not_your_turn',
          error: 'It is not your turn',
        }
      }
    }

    // Step 4: Convert command to GameAction
    const action = {
      type: command.type as GameAction['type'],
      playerId: command.playerId,
      roomId: command.gameId,
      payload: command.payload,
    } as GameAction

    // Step 5: Game rules validation
    const isValid = this.gameEngine.validateAction(currentState, action)
    if (!isValid) {
      return {
        status: 'invalid',
        error: 'Invalid game action',
      }
    }

    // Step 6: Execute command (state mutation)
    try {
      const result = await this.gameEngine.processAction(currentState, action)
      const newState = result.gameState

      // Step 7: Create event
      const event: GameEvent = {
        id: command.id,
        seq: 0, // Will be set by EventLog
        type: command.type,
        gameId: command.gameId,
        version: newState.version ?? 0,
        timestamp: new Date().toISOString(),
        playerId: command.playerId,
        payload: {
          ...((command.payload as Record<string, unknown>) || {}),
          ...(result.battleResult ? { battleResult: result.battleResult } : {}),
        },
      }

      // Step 8: Cache result for deduplication
      const commandResult: CommandResult = {
        status: 'success',
        event,
        newVersion: newState.version,
      }

      this.commandCache.set(command.id, commandResult)
      setTimeout(() => this.commandCache.delete(command.id), this.CACHE_TTL_MS)

      return commandResult
    } catch (error) {
      logger.error('Command execution failed', {
        commandId: command.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        status: 'invalid',
        error: error instanceof Error ? error.message : 'Command execution failed',
      }
    }
  }

  /**
   * Validate command structure
   */
  validateCommandStructure(command: unknown): command is Command {
    if (!command || typeof command !== 'object') return false

    const cmd = command as Partial<Command>
    return !!(
      cmd.id &&
      typeof cmd.id === 'string' &&
      cmd.type &&
      typeof cmd.type === 'string' &&
      cmd.playerId &&
      typeof cmd.playerId === 'string' &&
      cmd.gameId &&
      typeof cmd.gameId === 'string' &&
      typeof cmd.baseVersion === 'number' &&
      typeof cmd.timestamp === 'number'
    )
  }

  /**
   * Clear cache for a specific game (useful for cleanup)
   */
  clearGameCache(gameId: string): void {
    for (const [key, value] of this.commandCache.entries()) {
      if (value.event?.gameId === gameId) {
        this.commandCache.delete(key)
      }
    }
  }
}

export const commandProcessor = new CommandProcessor()
