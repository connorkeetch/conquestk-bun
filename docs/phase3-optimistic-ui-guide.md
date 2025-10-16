# Phase 3: Optimistic UI with Rollback Guide

## Overview
Optimistic UI updates apply changes immediately before server confirmation, providing instant feedback. If the server rejects the action, we rollback to the previous state.

## Core Concepts

### 1. Optimistic Update Flow
```
User clicks "Deploy 5 armies"
  ↓
Apply optimistic update (armies: 10 → 15 instantly)
  ↓
Send action to server with ACK
  ↓
[Success] → Commit optimistic change (already visible)
[Failure] → Rollback to snapshot (armies: 15 → 10, show error toast)
```

### 2. When to Use Optimistic UI
✅ **Good candidates:**
- Deploy armies (visual feedback)
- Fortify troops (instant movement)
- End turn (immediate phase change)

❌ **Bad candidates:**
- Attack (dice rolls determined by server)
- Trade cards (treasure awards from server)
- Game end (requires validation)

## Frontend Implementation

### 1. Create Optimistic Update Manager

**File:** `frontend/src/services/optimisticUpdateManager.ts`

```typescript
import { store } from '@/store'
import type { GameState } from '@conquestk/shared'
import { logger } from '@/utils/logger'

interface OptimisticSnapshot {
  actionId: string
  timestamp: number
  snapshot: Partial<GameState>
  rollback: () => void
}

class OptimisticUpdateManager {
  private snapshots: Map<string, OptimisticSnapshot> = new Map()
  private maxSnapshotAge = 10000 // 10 seconds

  /**
   * Apply an optimistic update and store rollback snapshot
   * Returns rollback function
   */
  applyOptimistic(
    actionId: string,
    optimisticUpdate: () => void,
    createRollback: () => () => void
  ): () => void {
    // Create rollback function BEFORE applying update
    const rollback = createRollback()

    // Apply optimistic update
    optimisticUpdate()

    // Store snapshot
    const snapshot: OptimisticSnapshot = {
      actionId,
      timestamp: Date.now(),
      snapshot: {}, // Minimal snapshot, rollback fn has closure
      rollback,
    }
    this.snapshots.set(actionId, snapshot)

    logger.debug('Applied optimistic update', { actionId })

    // Auto-cleanup old snapshots
    this.cleanupOldSnapshots()

    return rollback
  }

  /**
   * Commit an optimistic update (server confirmed)
   */
  commit(actionId: string): void {
    const snapshot = this.snapshots.get(actionId)
    if (snapshot) {
      this.snapshots.delete(actionId)
      logger.debug('Committed optimistic update', { actionId })
    }
  }

  /**
   * Rollback an optimistic update (server rejected)
   */
  rollback(actionId: string, reason?: string): void {
    const snapshot = this.snapshots.get(actionId)
    if (snapshot) {
      logger.warn('Rolling back optimistic update', { actionId, reason })
      snapshot.rollback()
      this.snapshots.delete(actionId)
    }
  }

  /**
   * Rollback all pending optimistic updates (e.g., on disconnect)
   */
  rollbackAll(): void {
    logger.warn('Rolling back all optimistic updates', { count: this.snapshots.size })
    for (const [actionId, snapshot] of this.snapshots.entries()) {
      snapshot.rollback()
      this.snapshots.delete(actionId)
    }
  }

  private cleanupOldSnapshots(): void {
    const now = Date.now()
    for (const [actionId, snapshot] of this.snapshots.entries()) {
      if (now - snapshot.timestamp > this.maxSnapshotAge) {
        logger.warn('Auto-committing stale optimistic update', { actionId })
        this.snapshots.delete(actionId)
      }
    }
  }
}

export const optimisticUpdateManager = new OptimisticUpdateManager()
```

### 2. Integrate with Socket Service

**File:** `frontend/src/services/socketService.ts`

Update action methods to support optimistic updates:

```typescript
import { optimisticUpdateManager } from './optimisticUpdateManager'

/**
 * Deploy armies with optimistic UI
 */
deployArmies(roomId: string, territoryId: string, armies: number) {
  const state = store.getState()
  const territory = state.game.currentGame?.territories?.find(t => t.id === territoryId)

  if (!territory) return

  // Generate action ID for tracking
  const actionId = `deploy:${territoryId}:${Date.now()}`

  // Store original armies for rollback
  const originalArmies = territory.armies

  // Apply optimistic update
  const rollback = optimisticUpdateManager.applyOptimistic(
    actionId,
    () => {
      // Optimistic: Increase armies immediately
      store.dispatch(updateTerritoryArmies({ territoryId, armies: originalArmies + armies }))
    },
    () => {
      // Create rollback closure
      return () => {
        store.dispatch(updateTerritoryArmies({ territoryId, armies: originalArmies }))
        toast.error('Deploy failed - armies restored')
      }
    }
  )

  // Send action to server
  this.sendActionWithAck(
    roomId,
    { type: 'deploy', payload: { territoryId, armies } },
    { idempotencyKey: actionId }
  ).then(ack => {
    if (ack.ok) {
      // Success: commit optimistic update
      optimisticUpdateManager.commit(actionId)
    } else {
      // Failure: rollback optimistic update
      optimisticUpdateManager.rollback(actionId, ack.error)
    }
  })
}

/**
 * Fortify with optimistic UI
 */
fortify(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
  const state = store.getState()
  const fromTerritory = state.game.currentGame?.territories?.find(t => t.id === fromTerritoryId)
  const toTerritory = state.game.currentGame?.territories?.find(t => t.id === toTerritoryId)

  if (!fromTerritory || !toTerritory) return

  const actionId = `fortify:${fromTerritoryId}:${toTerritoryId}:${Date.now()}`
  const originalFrom = fromTerritory.armies
  const originalTo = toTerritory.armies

  // Apply optimistic update
  optimisticUpdateManager.applyOptimistic(
    actionId,
    () => {
      // Move armies visually
      store.dispatch(updateTerritoryArmies({ territoryId: fromTerritoryId, armies: originalFrom - armies }))
      store.dispatch(updateTerritoryArmies({ territoryId: toTerritoryId, armies: originalTo + armies }))
    },
    () => {
      return () => {
        store.dispatch(updateTerritoryArmies({ territoryId: fromTerritoryId, armies: originalFrom }))
        store.dispatch(updateTerritoryArmies({ territoryId: toTerritoryId, armies: originalTo }))
        toast.error('Fortify failed - armies restored')
      }
    }
  )

  // Send to server
  this.sendActionWithAck(
    roomId,
    { type: 'fortify', payload: { fromTerritoryId, toTerritoryId, armies } },
    { idempotencyKey: actionId }
  ).then(ack => {
    if (ack.ok) {
      optimisticUpdateManager.commit(actionId)
    } else {
      optimisticUpdateManager.rollback(actionId, ack.error)
    }
  })
}

/**
 * End turn with optimistic phase change
 */
endTurn(roomId: string) {
  const state = store.getState()
  const currentPhase = state.game.currentGame?.phase
  const currentPlayer = state.game.currentGame?.currentPlayer

  const actionId = `end-turn:${Date.now()}`

  // Optimistic: Advance phase immediately
  optimisticUpdateManager.applyOptimistic(
    actionId,
    () => {
      // Show "Waiting for server..." or advance phase optimistically
      store.dispatch(setPhase({ phase: 'pending_turn_end' })) // Custom transient phase
    },
    () => {
      return () => {
        store.dispatch(setPhase({ phase: currentPhase }))
        store.dispatch(setCurrentPlayer({ playerId: currentPlayer }))
        toast.error('End turn failed')
      }
    }
  )

  this.sendActionWithAck(
    roomId,
    { type: 'end_turn' },
    { idempotencyKey: actionId }
  ).then(ack => {
    if (ack.ok) {
      optimisticUpdateManager.commit(actionId)
      // Server will send PHASE_CHANGE delta
    } else {
      optimisticUpdateManager.rollback(actionId, ack.error)
    }
  })
}
```

### 3. Rollback on Disconnect

Rollback all optimistic updates when connection drops:

```typescript
// In setupEventListeners():
this.socket.on('disconnect', () => {
  store.dispatch(setConnectionStatus('disconnected'))
  this.stopHeartbeat()

  // ROLLBACK: Cancel all optimistic updates on disconnect
  optimisticUpdateManager.rollbackAll()
})
```

### 4. Add Redux Actions for Optimistic Updates

**File:** `frontend/src/store/gameSlice.ts`

```typescript
// Add reducer for optimistic territory updates
updateTerritoryArmies: (state, action: PayloadAction<{ territoryId: string; armies: number }>) => {
  const { territoryId, armies } = action.payload
  const territory = state.currentGame?.territories?.find(t => t.id === territoryId)
  if (territory) {
    territory.armies = armies
  }
},

// Add transient phase for "pending" states
setPhase: (state, action: PayloadAction<{ phase: string }>) => {
  if (state.currentGame) {
    state.currentGame.phase = action.payload.phase as GamePhase
  }
},
```

## UI Feedback

### 1. Visual Indicators for Optimistic State

Add CSS classes to show optimistic updates:

```tsx
// In territory component
<div
  className={cn(
    "territory",
    isOptimistic && "territory-optimistic animate-pulse opacity-80"
  )}
>
  {armies}
  {isOptimistic && <span className="text-xs">⏳</span>}
</div>
```

### 2. Loading States

```tsx
// Show spinner during optimistic action
{isPendingAction && (
  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
    <Loader2 className="animate-spin" />
  </div>
)}
```

## Testing Optimistic UI

### Test Case 1: Success Path
```typescript
// Deploy armies
socketService.deployArmies(roomId, 't1', 5)
// Expected: Armies increase immediately, server confirms, no rollback
```

### Test Case 2: Failure Path
```typescript
// Deploy invalid amount (too many)
socketService.deployArmies(roomId, 't1', 9999)
// Expected: Armies increase, server rejects, rollback with error toast
```

### Test Case 3: Network Failure
```typescript
// Deploy while disconnected
socketService.disconnect()
socketService.deployArmies(roomId, 't1', 5)
// Expected: No optimistic update (or rollback immediately)
```

### Test Case 4: Rapid Actions
```typescript
// Deploy to 3 territories rapidly
socketService.deployArmies(roomId, 't1', 1)
socketService.deployArmies(roomId, 't2', 1)
socketService.deployArmies(roomId, 't3', 1)
// Expected: All show immediately, all confirmed independently
```

## Key Benefits

1. **Instant Feedback**: No waiting for server round-trip
2. **Perceived Performance**: Feels 200-500ms faster
3. **Graceful Degradation**: Rolls back on failure with clear error
4. **Maintains Consistency**: Server deltas override optimistic state

## Performance Notes

- Optimistic updates are synchronous (immediate)
- Rollbacks are rare (<<1% of actions)
- Snapshots are tiny (just territory IDs + armies)
- Auto-cleanup prevents memory leaks
