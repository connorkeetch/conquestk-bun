/**
 * StateReconciler - Client-side state reconciliation with optimistic updates
 *
 * Handles version-based conflict resolution between optimistic client predictions
 * and authoritative server state updates.
 */

import type { GameAction, GameState } from '@conquestk/shared'
import { logger } from '@/utils/logger'

export interface PendingCommand {
  id: string // Idempotency key
  action: GameAction
  baseVersion: number
  timestamp: number
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

export interface CommandRejection {
  commandId: string
  error: string
  reason: 'version_mismatch' | 'invalid' | 'not_your_turn' | 'duplicate'
  currentVersion?: number
}

/**
 * StateReconciler manages the reconciliation between optimistic client state
 * and authoritative server state using version-based conflict resolution.
 */
export class StateReconciler {
  private serverState: GameState | null = null // Confirmed by server
  private optimisticState: GameState | null = null // What we show user
  private pendingCommands: PendingCommand[] = [] // Awaiting confirmation
  private commandResolvers: Map<string, (success: boolean) => void> = new Map()

  constructor() {
    logger.debug('[StateReconciler] Initialized')
  }

  /**
   * Get the current state to display to the user
   */
  getCurrentState(): GameState | null {
    return this.optimisticState ?? this.serverState
  }

  /**
   * Get the confirmed server state
   */
  getServerState(): GameState | null {
    return this.serverState
  }

  /**
   * Get the count of pending commands
   */
  getPendingCount(): number {
    return this.pendingCommands.length
  }

  /**
   * Check if a command is pending
   */
  isPending(commandId: string): boolean {
    return this.pendingCommands.some((cmd) => cmd.id === commandId)
  }

  /**
   * Reset to a fresh server state (e.g., on reconnect or full sync)
   */
  resetToServerState(newServerState: GameState): void {
    logger.debug('[StateReconciler] Reset to server state', {
      version: newServerState.version,
      pendingCount: this.pendingCommands.length,
    })

    this.serverState = structuredClone(newServerState)

    // Clear commands that are now stale (based on old versions)
    const currentVersion = newServerState.version ?? 0
    this.pendingCommands = this.pendingCommands.filter((cmd) => cmd.baseVersion >= currentVersion)

    // Rebuild optimistic state from server state + remaining pending commands
    this.rebuildOptimisticState()
  }

  /**
   * Apply an optimistic update for a user action
   * This is called immediately when the user performs an action
   */
  applyOptimistic(command: PendingCommand): void {
    logger.debug('[StateReconciler] Apply optimistic command', {
      commandId: command.id,
      type: command.action.type,
      baseVersion: command.baseVersion,
    })

    // Add to pending queue
    this.pendingCommands.push(command)

    // Apply optimistically
    this.rebuildOptimisticState()
  }

  /**
   * Handle a server event confirmation
   */
  handleServerEvent(event: GameEvent): void {
    logger.debug('[StateReconciler] Server event received', {
      eventId: event.id,
      type: event.type,
      version: event.version,
      seq: event.seq,
    })

    if (!this.serverState) {
      logger.warn('[StateReconciler] Received event but no server state')
      return
    }

    // Update server state version
    this.serverState = {
      ...this.serverState,
      version: event.version,
    }

    // Remove confirmed commands (commands with baseVersion < event.version are now confirmed)
    const beforeCount = this.pendingCommands.length
    this.pendingCommands = this.pendingCommands.filter((cmd) => cmd.baseVersion >= event.version)

    const confirmedCount = beforeCount - this.pendingCommands.length
    if (confirmedCount > 0) {
      logger.debug('[StateReconciler] Confirmed commands', { count: confirmedCount })
    }

    // Resolve command promises
    this.commandResolvers.get(event.id)?.call(null, true)
    this.commandResolvers.delete(event.id)

    // Rebuild optimistic state
    this.rebuildOptimisticState()
  }

  /**
   * Handle a full server state snapshot
   */
  handleServerSnapshot(snapshot: GameState): void {
    logger.debug('[StateReconciler] Server snapshot received', {
      version: snapshot.version,
      turn: snapshot.turn,
      phase: snapshot.phase,
    })

    this.serverState = structuredClone(snapshot)

    // Remove commands that are now outdated
    const currentVersion = snapshot.version ?? 0
    this.pendingCommands = this.pendingCommands.filter((cmd) => cmd.baseVersion >= currentVersion)

    // Rebuild optimistic state
    this.rebuildOptimisticState()
  }

  /**
   * Handle a command rejection from the server
   */
  handleRejection(rejection: CommandRejection): void {
    logger.warn('[StateReconciler] Command rejected', {
      commandId: rejection.commandId,
      reason: rejection.reason,
      error: rejection.error,
    })

    // Remove the rejected command
    const beforeCount = this.pendingCommands.length
    this.pendingCommands = this.pendingCommands.filter((cmd) => cmd.id !== rejection.commandId)

    if (beforeCount > this.pendingCommands.length) {
      logger.debug('[StateReconciler] Removed rejected command')
    }

    // Resolve command promise with failure
    this.commandResolvers.get(rejection.commandId)?.call(null, false)
    this.commandResolvers.delete(rejection.commandId)

    // Rebuild optimistic state (without the rejected command)
    this.rebuildOptimisticState()

    // If version mismatch, we might need to request fresh state
    if (rejection.reason === 'version_mismatch' && rejection.currentVersion != null) {
      logger.info('[StateReconciler] Version mismatch detected', {
        expectedVersion: rejection.currentVersion,
        ourVersion: this.serverState?.version,
      })
      // Caller should request fresh state via socket
    }
  }

  /**
   * Clear all pending commands (e.g., on disconnect or major error)
   */
  clearPending(): void {
    logger.info('[StateReconciler] Clearing all pending commands', {
      count: this.pendingCommands.length,
    })

    // Reject all pending commands
    for (const cmd of this.pendingCommands) {
      this.commandResolvers.get(cmd.id)?.call(null, false)
      this.commandResolvers.delete(cmd.id)
    }

    this.pendingCommands = []
    this.rebuildOptimisticState()
  }

  /**
   * Register a callback for command resolution
   */
  onCommandResolved(commandId: string, callback: (success: boolean) => void): void {
    this.commandResolvers.set(commandId, callback)
  }

  /**
   * Rebuild optimistic state from server state + pending commands
   * This is called after any state change to compute the display state
   */
  private rebuildOptimisticState(): void {
    if (!this.serverState) {
      this.optimisticState = null
      return
    }

    // Start with confirmed server state
    let state = structuredClone(this.serverState)

    // Apply pending commands in order
    for (const cmd of this.pendingCommands) {
      state = this.applyCommandOptimistically(state, cmd.action)
    }

    this.optimisticState = state

    logger.debug('[StateReconciler] Rebuilt optimistic state', {
      serverVersion: this.serverState.version,
      pendingCount: this.pendingCommands.length,
      optimisticVersion: state.version,
    })
  }

  /**
   * Apply a command optimistically to a state
   * This is a simplified prediction - the server is authoritative
   */
  private applyCommandOptimistically(state: GameState, action: GameAction): GameState {
    // For now, we don't apply complex optimistic predictions
    // We rely on the server snapshot to update state
    // This could be enhanced to predict state changes for better UX

    // Just increment the version to show something changed
    return {
      ...state,
      version: (state.version ?? 0) + 1,
      lastAction: action,
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): {
    hasServerState: boolean
    serverVersion: number | null
    pendingCount: number
    pendingCommands: Array<{ id: string; type: string; baseVersion: number }>
  } {
    return {
      hasServerState: this.serverState != null,
      serverVersion: this.serverState?.version ?? null,
      pendingCount: this.pendingCommands.length,
      pendingCommands: this.pendingCommands.map((cmd) => ({
        id: cmd.id,
        type: cmd.action.type,
        baseVersion: cmd.baseVersion,
      })),
    }
  }
}

// Singleton instance
export const stateReconciler = new StateReconciler()
