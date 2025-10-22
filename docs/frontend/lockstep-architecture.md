# Frontend Lockstep Architecture

## Overview

ConquestK uses a **Pure Lockstep Architecture** for real-time game state synchronization. This document explains how the frontend handles game state updates, when snapshots are received, and how the lockstep simulation works.

## Pure Lockstep Mode (Default)

In Pure Lockstep mode, the frontend maintains game state through **lockstep frames** rather than full snapshots. This provides:

- **~50% bandwidth reduction** by eliminating redundant action snapshots
- **Deterministic state** - all clients compute identical state from the same inputs
- **Efficient updates** - only action commands are transmitted, not full state
- **Desync detection** - checksums validate state consistency across clients

## Snapshot Emission Semantics

The server sends `game:snapshot` events only in specific scenarios:

### Always Sent (Critical Updates)

1. **`init`** - Initial baseline when joining a game
   - Establishes the starting point for lockstep simulation
   - Frontend stores this as the baseline in `LockstepSimulationManager`
   - Subsequent frames are applied on top of this baseline

2. **`resync`** - Explicit client resync request
   - Triggered when the client detects desynchronization
   - Resets the lockstep baseline to the authoritative server state
   - Clears any accumulated simulation drift

3. **`fog`** - Fog-of-war filtered view updates
   - Sent when fog changes (e.g., player elimination, territory visibility changes)
   - Contains visibility-filtered state specific to the viewing player
   - Does not affect lockstep simulation (view-only update)

### Never Sent (Pure Lockstep)

4. **`action`** - Post-action state broadcast
   - **ALWAYS skipped** in Pure Lockstep mode
   - Lockstep frames (`game-action:frame-committed`) are used instead
   - Legacy hybrid mode sent both frames and snapshots (wasteful)

## Lockstep Frame Processing

### Frame Structure

Lockstep frames (`game-action:frame-committed`) contain:

```typescript
{
  matchId: string
  frame: {
    seq: number           // Monotonic sequence number
    commands: Command[]   // Array of game actions
    timestamp: number     // Server timestamp
  }
  checksum: number       // State hash after applying frame
}
```

### Frontend Simulation Flow

1. **Initialization**
   - Client joins game
   - Receives `game:snapshot` with `reason: 'init'`
   - `LockstepSimulationManager.setBaseline(matchId, state)` establishes baseline

2. **Frame Application**
   - Server emits `game-action:frame-committed` for each player action
   - Frontend calls `LockstepSimulationManager.applyFrame(matchId, frame)`
   - Frame is simulated using `simulateFrame()` from `@conquestk/shared/lockstep`
   - State is updated deterministically based on commands

3. **Checksum Validation**
   - Server emits `game-action:checksum` after each frame
   - Frontend computes local checksum: `LockstepSimulationManager.checksum(matchId)`
   - If mismatch detected → request resync via `game-action:resync` socket event
   - Server sends `game:snapshot` with `reason: 'resync'` to restore correct state

4. **State Access**
   - UI reads current state via `LockstepSimulationManager.getState(matchId)`
   - State is always the result of baseline + all applied frames
   - No direct state modification - frames are the only state mutations

## Implementation Details

### LockstepSimulationManager

Located at `frontend/src/services/lockstepSimulationManager.ts`:

```typescript
class LockstepSimulationManager {
  // Store baseline state when joining
  setBaseline(matchId: string, state: SharedGameState): void

  // Apply a single frame to current state
  applyFrame(matchId: string, frame: InputFrame): ApplyFrameResult

  // Apply multiple frames in sequence
  applyFrames(matchId: string, frames: InputFrame[]): ApplyFrameResult

  // Compute checksum of current state
  checksum(matchId: string): number | null

  // Get current simulated state
  getState(matchId: string): SharedGameState | null

  // Clear state when leaving game
  clear(matchId: string): void
}
```

### Shared Lockstep Library

Core simulation logic is shared between frontend and backend via `@conquestk/shared/lockstep`:

- **`simulateFrame(state, frame)`** - Deterministic frame application
- **`computeChecksum(state)`** - State hashing for desync detection
- **`applyFrame(state, command)`** - Individual command processing

This ensures **identical state computation** on client and server.

## Handling Edge Cases

### Unsupported Commands

If a frame contains commands not yet implemented in the frontend simulator:

```typescript
const result = simulationManager.applyFrame(matchId, frame)
if (!result.ok && result.reason === 'unsupported_commands') {
  console.warn('Unsupported commands:', result.unsupported)
  // Fall back to requesting a snapshot
  socket.emit('game-action:resync', { matchId })
}
```

### Missing Baseline

If frames arrive before the initial snapshot:

```typescript
const result = simulationManager.applyFrame(matchId, frame)
if (!result.ok && result.reason === 'missing_state') {
  // Queue frames or request snapshot
  socket.emit('game-action:resync', { matchId })
}
```

### Desynchronization Recovery

Automatic recovery when checksums mismatch:

```typescript
socket.on('game-action:checksum', ({ matchId, checksum }) => {
  const localChecksum = simulationManager.checksum(matchId)
  if (localChecksum !== checksum) {
    console.error('Desync detected', { local: localChecksum, server: checksum })
    socket.emit('game-action:resync', { matchId })
  }
})
```

## Legacy Hybrid Mode

**Not recommended.** Can be enabled by setting `LOCKSTEP_ONLY=false` in backend `.env`.

In hybrid mode:
- Snapshots are sent after **every action** (`reason: 'action'`)
- Lockstep frames are also sent (redundant)
- **2x bandwidth usage** compared to Pure Lockstep
- Useful only for debugging or gradual migration

## Migration from Snapshot-Only

If your code was previously relying on action snapshots:

### Before (Snapshot-Only)
```typescript
socket.on('game:snapshot', (state) => {
  // Direct state replacement
  dispatch(setGameState(state))
})
```

### After (Pure Lockstep)
```typescript
// Initialize baseline
socket.on('game:snapshot', (state, reason) => {
  if (reason === 'init' || reason === 'resync') {
    simulationManager.setBaseline(matchId, state)
    dispatch(setGameState(state))
  }
  // Ignore 'action' reason - use frames instead
})

// Process frames
socket.on('game-action:frame-committed', ({ matchId, frame }) => {
  const result = simulationManager.applyFrame(matchId, frame)
  if (result.ok) {
    const newState = simulationManager.getState(matchId)
    dispatch(setGameState(newState))
  }
})

// Validate checksums
socket.on('game-action:checksum', ({ matchId, checksum }) => {
  const localChecksum = simulationManager.checksum(matchId)
  if (localChecksum !== checksum) {
    socket.emit('game-action:resync', { matchId })
  }
})
```

## Performance Characteristics

### Bandwidth Savings

Pure Lockstep mode reduces bandwidth by ~50%:

- **Snapshot size**: ~50-100 KB (full game state)
- **Frame size**: ~0.5-2 KB (action commands only)
- **Actions per game**: 50-200 moves
- **Savings**: Eliminates 50-200 redundant 50KB snapshots → ~2.5-10 MB saved per game

### CPU Trade-off

- **Snapshot mode**: Zero CPU (direct state replacement)
- **Lockstep mode**: Minimal CPU (deterministic command application)
- Frame simulation is highly optimized and typically <1ms per frame

### Memory Usage

- **Baseline state**: ~50-100 KB (one copy per active game)
- **Frame history**: ~1-5 KB (recent frames for potential replay)
- Total overhead: negligible compared to full React component tree

## Debugging

### Enable Lockstep Logging

Add to frontend console:

```typescript
localStorage.setItem('debug', 'lockstep:*')
```

### Inspect Simulation State

```typescript
// Get current state
const state = simulationManager.getState(matchId)
console.log('Current state:', state)

// Compute checksum
const checksum = simulationManager.checksum(matchId)
console.log('State checksum:', checksum.toString(16))
```

### Monitor Frame Application

```typescript
socket.on('game-action:frame-committed', ({ matchId, frame }) => {
  console.log(`Applying frame ${frame.seq}:`, frame.commands)
  const result = simulationManager.applyFrame(matchId, frame)
  console.log('Result:', result)
})
```

## See Also

- [Backend Lockstep Configuration](../../backend/src/config/lockstep.ts)
- [Shared Lockstep Library](../../shared/lockstep/)
- [Lockstep Architecture Refactor Plan](../planning/lockstep-architecture-refactor.md)
- [Admin Lockstep Metrics Endpoint](../../backend/src/routes/admin.ts#L308-L337)
