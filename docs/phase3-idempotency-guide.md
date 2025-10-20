# Phase 3: Idempotency Keys Implementation Guide

## Overview
Idempotency keys prevent duplicate action processing when clients retry failed requests. This is critical for game actions where processing the same attack/deploy twice would corrupt state.

> **Why this document still matters (2025-10-16):** We have queue plumbing, a Redis-backed helper (`jobIdempotencyService`), stable client idempotency keys, metrics wiring, and backend/frontend smoke tests. Remaining work is focused on broadening worker coverage, surfacing dashboards, and auditing edge-case action types, so keep using this guide as the canonical checklist until those are wrapped.

## Status Snapshot (2025-10-16)

| Area | Status | Notes |
| --- | --- | --- |
| Redis-backed store | ✅ Implemented via `backend/src/services/jobIdempotencyService.ts` with TTL + in-memory fallback; result payload shape validated via `gameActionWorker.idempotency.spec.ts`. |
| Worker guard rails | ⚠️ Partial – `backend/src/workers/gameActionWorker.ts` consults the store and duplicate-job coverage now exists in `gameActionWorker.idempotency.spec.ts`, but we still need broader per-action tests and result replay assertions. |
| Queue wiring | ✅ `backend/src/services/queueService.ts` and socket handlers accept `idempotencyKey` and reuse it for BullMQ job IDs. |
| Client key management | ✅ `frontend/src/services/socketService.ts` now generates UUID-based keys, fingerprints repeated payloads, and reuses the same identifier through retries. |
| Optimistic rollback helpers | ✅ `frontend/src/utils/optimisticActions.ts` manages apply/rollback handlers keyed by idempotency ID and is wired through `socketService`. |
| Metrics & observability | ✅ `idempotencyMetrics` in `backend/src/services/metricsService.ts` tracks Redis vs in-memory hits, stores, fallbacks, and duplicates (surfaced via `/metrics/client`). |
| Test coverage | ⚠️ Initial duplicate-job Jest spec exists and now includes service + socket smoke tests, but we still need broader coverage to prove cached responses for every action shape. |

## Implementation Checklist

- [x] Finalize backend result caching semantics: confirm `ProcessGameActionResult` payload captures success/processing flags without relying on legacy delta data. *(Verified via updated worker spec storing the streamlined `{ success, processed }` result.)*
- [x] Add targeted Jest tests for `gameActionWorker` that simulate duplicate jobs with reused `idempotencyKey`. *(See `backend/src/workers/gameActionWorker.idempotency.spec.ts`; expand to other action types.)*
- [x] Replace timestamp-based key generation on the client with UUIDs (or shared per-action keys) and persist them through retries/optimistic flows. *(Shipped via `frontend/src/services/socketService.ts` fingerprinting logic.)*
- [x] Expose a tiny helper for optimistic updates that can register rollback handlers keyed by idempotency ID. *(See `frontend/src/utils/optimisticActions.ts` and `SocketService.sendActionWithAck` integration.)*
- [x] Instrument dedupe metrics (Redis hits/misses, duplicate short-circuits) and surface them via `/metrics/client` or the existing queue dashboards. *(See `idempotencyMetrics` in `backend/src/services/metricsService.ts` with new counters.)*
- [x] Build integration smoke tests (backend + socket) proving double clicks and retry flows are safe. *(Backend: `backend/src/test/idempotencyMetrics.integration.test.ts`; Frontend: `frontend/src/services/socketService.idempotency.test.ts`.)*

## Backend Implementation

### 1. Create Idempotency Service

> **Status:** Pending – the snippets below describe the planned dedicated service. Today we lean on `jobIdempotencyService`; either extend it directly or wrap it with this interface so other services can request cached results without knowing queue details.

**File:** `backend/src/services/idempotencyService.ts`

```typescript
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

/**
 * Idempotency Service
 * Tracks processed action keys to prevent duplicate execution
 */
class IdempotencyService {
  private inMemoryCache: Map<string, { result: unknown; timestamp: number }> = new Map()
  private readonly TTL_MS = 60 * 60 * 1000 // 1 hour

  /**
   * Check if an action with this idempotency key has been processed
   * Returns cached result if found, null otherwise
   */
  async checkIdempotency(key: string): Promise<{ isDuplicate: boolean; result?: unknown }> {
    const redis = getRedisClient()

    if (redis) {
      try {
        const cached = await redis.get(`idempotency:${key}`)
        if (cached) {
          logger.info('Idempotency key found - skipping duplicate action', { key })
          return { isDuplicate: true, result: JSON.parse(cached) }
        }
      } catch (error) {
        logger.warn('Failed to check idempotency in Redis', { key, error })
        // Fall through to in-memory check
      }
    }

    // In-memory fallback
    const cached = this.inMemoryCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.TTL_MS) {
      logger.info('Idempotency key found in memory - skipping duplicate action', { key })
      return { isDuplicate: true, result: cached.result }
    }

    return { isDuplicate: false }
  }

  /**
   * Store result for an idempotency key
   */
  async storeResult(key: string, result: unknown): Promise<void> {
    const redis = getRedisClient()

    if (redis) {
      try {
        await redis.set(`idempotency:${key}`, JSON.stringify(result), 'PX', this.TTL_MS)
        return
      } catch (error) {
        logger.warn('Failed to store idempotency result in Redis', { key, error })
      }
    }

    // In-memory fallback
    this.inMemoryCache.set(key, { result, timestamp: Date.now() })

    // Cleanup old entries (every 100 stores)
    if (this.inMemoryCache.size > 1000) {
      const now = Date.now()
      for (const [k, v] of this.inMemoryCache.entries()) {
        if (now - v.timestamp > this.TTL_MS) {
          this.inMemoryCache.delete(k)
        }
      }
    }
  }

  /**
   * Clear idempotency cache for a specific game (on game end)
   */
  async clearGame(gameId: string): Promise<void> {
    const redis = getRedisClient()

    if (redis) {
      try {
        const keys = await redis.keys(`idempotency:${gameId}:*`)
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } catch (error) {
        logger.warn('Failed to clear game idempotency keys', { gameId, error })
      }
    }

    // Clear in-memory entries starting with gameId
    for (const key of this.inMemoryCache.keys()) {
      if (key.startsWith(`${gameId}:`)) {
        this.inMemoryCache.delete(key)
      }
    }
  }
}

export const idempotencyService = new IdempotencyService()
```

### 2. Update Game Action Worker

> **Status:** Partial – `GameActionWorker.processGameAction` already calls `jobIdempotencyService.getProcessedJob`. Align the implementation with this section once the dedicated service exists and add unit tests that assert duplicate jobs return the cached payload.

**File:** `backend/src/workers/gameActionWorker.ts`

Add idempotency check at the start of the action processor:

```typescript
import { idempotencyService } from '../services/idempotencyService.js'

// In the process method, before executing the action:
async process(job: Job<GameActionJob>): Promise<void> {
  const { gameId, playerId, action, idempotencyKey } = job.data

  // IDEMPOTENCY CHECK
  if (idempotencyKey) {
    const check = await idempotencyService.checkIdempotency(idempotencyKey)
    if (check.isDuplicate) {
      logger.info('Skipping duplicate action', { gameId, playerId, action: action.type, idempotencyKey })
      // Return cached result without re-processing
      return check.result as void
    }
  }

  // ... existing action processing logic ...

  // STORE RESULT
  if (idempotencyKey) {
    await idempotencyService.storeResult(idempotencyKey, { ok: true, queued: true })
  }
}
```

### 3. Update Socket Service to Accept Idempotency Keys

> **Status:** Done (verify) – the `game-action` handler currently forwards `idempotencyKey`. Keep this section for clarity and double-check we also enrich any admin tooling that inspects queued jobs.

**File:** `backend/src/services/socketService.ts`

The `game-action` handler should already forward idempotency keys from the queue job. Just ensure the type includes it:

```typescript
// In the game-action socket handler:
socket.on('game-action', async (payload: {
  roomId: string
  action: GameAction
  idempotencyKey?: string // <-- Ensure this is in the type
}, callback) => {
  // ... existing logic that forwards to queue ...

  await queueService.addGameAction({
    gameId: payload.roomId,
    playerId: socket.userId!,
    action: payload.action,
    socketId: socket.id,
    idempotencyKey: payload.idempotencyKey, // <-- Forward to queue
  })
})
```

## Frontend Implementation

### 4. Generate Idempotency Keys

> **Status:** Pending – `sendActionWithAck` still uses `Date.now()` which effectively produces a new key per click. Replace that logic with the UUID-based flow below, and make sure retries reuse the same key.

**File:** `frontend/src/services/socketService.ts`

Update `sendActionWithAck` to generate and include idempotency keys:

```typescript
import { v4 as uuidv4 } from 'uuid'

private async sendActionWithAck(
  roomId: string,
  action: { type: string; playerId?: string; payload?: unknown },
  options?: { idempotencyKey?: string; timeoutMs?: number }
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  // Generate idempotency key if not provided
  const idempotencyKey = options?.idempotencyKey ?? `${roomId}:${action.type}:${uuidv4()}`
  const timeoutMs = options?.timeoutMs ?? 5000

  return new Promise((resolve) => {
    if (!this.socket) {
      resolve({ ok: false, error: 'Not connected' })
      return
    }

    const timeoutHandle = setTimeout(() => {
      resolve({ ok: false, error: 'Timeout - server did not acknowledge action' })
    }, timeoutMs)

    try {
      this.socket.emit(
        'game-action',
        {
          roomId,
          action,
          idempotencyKey // <-- Include idempotency key
        } as Parameters<ClientToServerEvents['game-action']>[0],
        (ack?: { ok: boolean; queued?: boolean; acceptedAt?: number }) => {
          clearTimeout(timeoutHandle)
          resolve(ack ?? { ok: true })
        },
      )
    } catch (error) {
      clearTimeout(timeoutHandle)
      resolve({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })
}
```

### 5. Track Pending Actions by Idempotency Key

> **Status:** Partial – the `pendingActions` map exists, but without stable keys it never collapses duplicates. Wire it up once the UUID-based keys land and extend the rollback handlers so we can revert optimistic state on terminal failures.

Add tracking to prevent multiple in-flight requests with the same key:

```typescript
private pendingActions: Map<string, Promise<{ ok: boolean }>> = new Map()

private async sendActionWithAck(
  roomId: string,
  action: { type: string; playerId?: string; payload?: unknown },
  options?: { idempotencyKey?: string; timeoutMs?: number }
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  const idempotencyKey = options?.idempotencyKey ?? `${roomId}:${action.type}:${uuidv4()}`

  // Check if this action is already in-flight
  const pending = this.pendingActions.get(idempotencyKey)
  if (pending) {
    logger.info('Action already in-flight, reusing pending request', { idempotencyKey })
    return pending
  }

  // Create promise for this action
  const actionPromise = this._sendActionInternal(roomId, action, idempotencyKey, options?.timeoutMs)
  this.pendingActions.set(idempotencyKey, actionPromise)

  // Clean up after completion
  actionPromise.finally(() => {
    this.pendingActions.delete(idempotencyKey)
  })

  return actionPromise
}

private async _sendActionInternal(
  roomId: string,
  action: { type: string; playerId?: string; payload?: unknown },
  idempotencyKey: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  // ... existing emit logic from sendActionWithAck ...
}
```

## Testing Idempotency

### Test Case 1: Rapid Double-Click
```typescript
// Simulate user double-clicking deploy button
await socketService.sendActionWithAck(roomId, { type: 'deploy', payload: { territoryId: 't1', armies: 5 }})
await socketService.sendActionWithAck(roomId, { type: 'deploy', payload: { territoryId: 't1', armies: 5 }})
// Expected: Only one action processed, second returns cached result
```

### Test Case 2: Retry After Timeout
```typescript
// First attempt times out
const result1 = await socketService.sendActionWithAck(roomId, action) // { ok: false, error: 'Timeout' }

// Retry with SAME idempotency key
const result2 = await socketService.retryAction(roomId, action)
// Expected: If first actually processed, second skipped; if not, retries with new key
```

### Test Case 3: Network Partition Recovery
```typescript
// Send action before network partition
socketService.sendActionWithAck(roomId, action) // Gets lost in network
// Network recovers, client retries
socketService.sendActionWithAck(roomId, action, { idempotencyKey: sameKey })
// Expected: Server recognizes duplicate and doesn't re-process
```

## Key Benefits

1. **Prevents Double-Processing**: Rapid clicks won't process twice
2. **Safe Retries**: Clients can retry without fear of duplication
3. **Network Resilience**: Handles dropped acks gracefully
4. **TTL-based Cleanup**: Keys expire after 1 hour automatically

## Performance Notes

- Redis `GET` is O(1) - no performance impact
- In-memory fallback for dev/Redis outage
- Keys are scoped per-game and auto-expire
- Minimal memory footprint (UUID + timestamp + result)
