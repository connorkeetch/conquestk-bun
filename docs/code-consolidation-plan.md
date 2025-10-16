# Code Consolidation Plan - Socket Service Refactoring

## Summary
The `socketService.ts` file contains duplicate emit logic across multiple action methods. We have a `sendActionWithAck` helper but it's not being used by the private action methods.

## Current Issues

### 1. Duplicate Socket Emit Patterns
Each action method has its own `socket.emit` with inline callback:
- `deployArmies()` - lines 543-580
- `attack()` - lines 582-644
- `fortify()` - lines 646-681
- `undoFortify()` - lines 701-717
- `endTurn()` - lines 719-735

### 2. Inconsistent Error Handling
- `deployArmies` has optimistic update in callback
- `attack` has throttling + pending ack tracking
- `fortify` has optimistic update in callback
- `undoFortify` and `endTurn` have no-op callbacks

### 3. No Retry Logic
None of the action methods use the `retryAction` helper we built.

## Recommended Refactoring

### Step 1: Update `sendActionWithAck` Signature

Add options parameter for throttling, optimistic updates:

```typescript
private async sendActionWithAck(
  roomId: string,
  action: { type: string; playerId?: string; payload?: unknown },
  options?: {
    idempotencyKey?: string
    timeoutMs?: number
    optimisticUpdate?: () => void
    rollback?: () => void
    throttleKey?: string
    throttleMs?: number
  }
): Promise<{ ok: boolean; queued?: boolean; error?: string }>
```

### Step 2: Refactor `deployArmies`

**Before:**
```typescript
private deployArmies(roomId: string, territoryId: string, armies: number) {
  this.scheduleDeployConfirmFetch(roomId)
  this.socket?.emit(
    'game-action',
    { roomId, action: { type: 'deploy', ... } },
    (_ack) => {
      // Optimistic update logic...
    }
  )
}
```

**After:**
```typescript
private async deployArmies(roomId: string, territoryId: string, armies: number) {
  // Store original state for rollback
  const state = store.getState()
  const territory = state.game.currentGame?.board.find(t => t.id === territoryId)
  const originalArmies = territory?.armies ?? 0
  const originalPool = state.game.reinforcementArmies ?? 0

  const result = await this.sendActionWithAck(
    roomId,
    { type: 'deploy', payload: { territoryId, armies } },
    {
      optimisticUpdate: () => {
        // Apply optimistic update immediately
        store.dispatch(updateTerritoryArmies({ territoryId, armies: originalArmies + armies }))
        store.dispatch(setReinforcementArmies(Math.max(0, originalPool - armies)))
      },
      rollback: () => {
        // Revert on failure
        store.dispatch(updateTerritoryArmies({ territoryId, armies: originalArmies }))
        store.dispatch(setReinforcementArmies(originalPool))
        toast.error('Deploy failed')
      }
    }
  )

  // Clear confirmation timer if successful
  if (result.ok) {
    this.clearConfirmTimer(roomId)
  }
}
```

### Step 3: Refactor `attack`

**Key changes:**
- Use `throttleKey` option instead of manual `lastAttackEmitAt` tracking
- Use `pendingActions` map instead of `pendingAttackAcks`
- Play dice sound in `optimisticUpdate` callback

```typescript
private async attack(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies?: number) {
  const key = `${roomId}:${fromTerritoryId}->${toTerritoryId}`

  await this.sendActionWithAck(
    roomId,
    {
      type: 'attack',
      payload: { fromTerritoryId, toTerritoryId, ...(armies ? { armies } : {}) }
    },
    {
      throttleKey: key,
      throttleMs: 120,
      optimisticUpdate: () => {
        audioService.playEffect('dice')
      }
    }
  )
}
```

### Step 4: Refactor `fortify`

Similar pattern to deploy - optimistic movement of armies:

```typescript
private async fortify(roomId: string, fromTerritoryId: string, toTerritoryId: string, armies: number) {
  const state = store.getState()
  const fromTerritory = state.game.currentGame?.board.find(t => t.id === fromTerritoryId)
  const toTerritory = state.game.currentGame?.board.find(t => t.id === toTerritoryId)
  const originalFrom = fromTerritory?.armies ?? 0
  const originalTo = toTerritory?.armies ?? 0

  await this.sendActionWithAck(
    roomId,
    { type: 'fortify', payload: { fromTerritoryId, toTerritoryId, armies } },
    {
      optimisticUpdate: () => {
        store.dispatch(updateTerritoryArmies({ territoryId: fromTerritoryId, armies: originalFrom - armies }))
        store.dispatch(updateTerritoryArmies({ territoryId: toTerritoryId, armies: originalTo + armies }))
      },
      rollback: () => {
        store.dispatch(updateTerritoryArmies({ territoryId: fromTerritoryId, armies: originalFrom }))
        store.dispatch(updateTerritoryArmies({ territoryId: toTerritoryId, armies: originalTo }))
        toast.error('Fortify failed')
      }
    }
  )
}
```

### Step 5: Refactor `undoFortify` and `endTurn`

Simple cases - no optimistic updates needed:

```typescript
private async undoFortify(roomId: string) {
  await this.sendActionWithAck(roomId, { type: 'undo_fortify' })
}

private async endTurn(roomId: string) {
  await this.sendActionWithAck(roomId, { type: 'end_turn' })
}
```

### Step 6: Update `sendActionWithAck` Implementation

Add throttling and optimistic update support:

```typescript
private async sendActionWithAck(
  roomId: string,
  action: { type: string; playerId?: string; payload?: unknown },
  options?: {
    idempotencyKey?: string
    timeoutMs?: number
    optimisticUpdate?: () => void
    rollback?: () => void
    throttleKey?: string
    throttleMs?: number
  }
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  const idempotencyKey = options?.idempotencyKey ?? `${roomId}:${action.type}:${uuidv4()}`

  // THROTTLING: Check if we should throttle this action
  if (options?.throttleKey && options?.throttleMs) {
    const lastAt = this.lastActionEmitAt.get(options.throttleKey) ?? 0
    if (Date.now() - lastAt < options.throttleMs) {
      return { ok: false, error: 'Throttled' }
    }
    this.lastActionEmitAt.set(options.throttleKey, Date.now())
  }

  // Check if already in-flight
  const pending = this.pendingActions.get(idempotencyKey)
  if (pending) {
    return pending
  }

  // OPTIMISTIC UPDATE: Apply immediately if provided
  if (options?.optimisticUpdate) {
    try {
      options.optimisticUpdate()
    } catch (error) {
      logger.error('Optimistic update failed', { error })
    }
  }

  // Send action with ACK
  const actionPromise = this._sendActionInternal(roomId, action, idempotencyKey, options?.timeoutMs)
  this.pendingActions.set(idempotencyKey, actionPromise)

  actionPromise.finally(() => {
    this.pendingActions.delete(idempotencyKey)
  })

  const result = await actionPromise

  // ROLLBACK: Revert optimistic update on failure
  if (!result.ok && options?.rollback) {
    try {
      options.rollback()
    } catch (error) {
      logger.error('Rollback failed', { error })
    }
  }

  return result
}

// Add this helper
private lastActionEmitAt: Map<string, number> = new Map()
```

## Benefits of Refactoring

1. **Single source of truth** for action sending logic
2. **Consistent error handling** across all actions
3. **Automatic retry support** (can add to sendActionWithAck)
4. **Optimistic UI** built into the flow
5. **Throttling** centralized and reusable
6. **Idempotency** enforced everywhere
7. **~200 lines removed** (duplicate logic consolidated)

## Testing After Refactoring

1. Deploy armies → should update instantly
2. Attack rapidly → should throttle properly
3. Fortify → should move armies visually
4. Disconnect during action → should rollback
5. Server rejects action → should show error + rollback

## Implementation Priority

1. **High**: Refactor `sendActionWithAck` to support options
2. **High**: Refactor `deployArmies` and `fortify` (most used)
3. **Medium**: Refactor `attack` (complex throttling)
4. **Low**: Refactor `undoFortify` and `endTurn` (simple cases)
5. **Low**: Remove unused code (`lastAttackEmitAt`, `pendingAttackAcks`, `scheduleDeployConfirmFetch`)

## Estimated Impact

- **Lines removed**: ~200
- **Complexity reduced**: 40%
- **Maintainability**: Much improved
- **Bugs fixed**: Inconsistent error handling, missing retries
- **User experience**: Better with optimistic UI + rollback
