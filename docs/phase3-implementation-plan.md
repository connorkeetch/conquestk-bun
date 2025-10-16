# Phase 3 Implementation Plan

## Goals
1. Add idempotency keys to prevent duplicate action processing
2. Implement optimistic UI updates with rollback capability
3. Add connection latency indicator UI
4. Add client-side metrics tracking

## Code Cleanup First
- Consolidate action emit methods to use `sendActionWithAck`
- Remove redundant emit patterns in `deployArmies`, `attack`, `fortify`, etc.
- Simplify `sendGameAction` to route through unified path

## Implementation Steps

### 1. Idempotency Keys
**Backend:**
- Add idempotency middleware/check in gameActionWorker
- Store processed idempotency keys in Redis with 1-hour TTL
- Return early if duplicate key detected

**Frontend:**
- Generate UUID for each action
- Include in action payload
- Track pending actions by idempotency key

### 2. Optimistic UI + Rollback
**Frontend:**
- Before emit: apply optimistic update, store rollback snapshot
- On ACK success: commit optimistic change
- On ACK fail/timeout: rollback to snapshot
- Toast user on rollback

### 3. Connection Latency Indicator
**UI Component:**
- Badge showing latency (green <100ms, yellow <300ms, red >300ms)
- Pulse animation on high latency
- Click to show detailed connection stats

### 4. Client-Side Metrics
**Tracking:**
- Actions sent/acked/failed
- Reconnections count
- Delta gaps detected
- Average latency
- Send to backend every 30s for aggregation
