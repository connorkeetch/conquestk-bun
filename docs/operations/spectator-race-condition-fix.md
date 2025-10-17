# Spectator Race Condition Bug Fix

## The Problem

Users were experiencing issues where:
- Moves didn't register on the map until page refresh
- Turn notifications weren't received
- Game state updates weren't appearing in real-time

## Root Cause

A **race condition** in the GameRoom component's socket subscription logic:

### What Was Happening

```typescript
// Old code - BUGGY
useEffect(() => {
  if (!roomId) return
  if (isMember) {
    socketService.joinRoom(roomId)  // Join as player
  } else {
    socketService.spectateRoom(roomId)  // Join as spectator
  }
}, [roomId, isMember])
```

**Timeline of the bug**:

1. Component renders, `currentRoom` is `null` (not loaded yet)
2. `isMember` evaluates to `false` (because `currentRoom?.players` is undefined)
3. useEffect runs immediately
4. Falls through to `else` branch → calls `spectateRoom()`
5. **Backend marks user as spectator** (joins only `roomId` channel, not `game:roomId`)
6. API request completes, `currentRoom` loads with player data
7. `isMember` re-evaluates to `true`
8. useEffect re-runs and calls `joinRoom()`
9. **Too late!** Backend already has them as spectator

### The Evidence

From backend logs:
```
User subscribed to game channel game:b1ee9f3f...
User spectating room b1ee9f3f...  <- WRONG! They're a player!
```

### Why This Broke Everything

The backend has two different subscription modes:

**Player (`join-room`)**:
- Joins `game:${roomId}` channel
- Receives ALL game deltas (moves, attacks, etc.)
- Can send game actions

**Spectator (`spectate-room`)**:
- Joins only `${roomId}` channel
- Receives ONLY lifecycle events and logs
- **CANNOT receive game deltas** (the move updates!)
- **CANNOT send game actions**

When players were incorrectly marked as spectators:
- Their moves were ignored (not subscribed to correct channel)
- They didn't receive game-delta events (not in `game:${roomId}`)
- Page refresh forced re-subscription with correct data → worked until next refresh

## The Fix

```typescript
// New code - FIXED
useEffect(() => {
  if (!roomId || !currentRoom) return  // Wait for room to load!

  if (isMember) {
    socketService.joinRoom(roomId)
  } else {
    socketService.spectateRoom(roomId)
  }
}, [roomId, isMember, currentRoom])  // Added currentRoom dependency
```

**Key changes**:
1. **Added guard**: `if (!currentRoom) return` - don't subscribe until room loads
2. **Added dependency**: `currentRoom` in dependency array - re-run when room loads
3. **Added comment**: Explains the race condition for future maintainers

## How It Works Now

**New timeline**:

1. Component renders, `currentRoom` is `null`
2. useEffect runs but **immediately returns** (guard clause)
3. API request completes, `currentRoom` loads
4. useEffect re-runs with correct `currentRoom` data
5. `isMember` evaluates correctly based on actual player list
6. Calls correct subscription method (`joinRoom` or `spectateRoom`)
7. Backend subscribes to correct channels
8. Real-time updates work perfectly

## Testing

To verify the fix works:

1. Open browser DevTools → Network → WS
2. Navigate to a game you're playing in
3. Watch Socket.IO messages
4. Should see `join-room` event (not `spectate-room`)
5. Backend logs should show:
   ```
   User subscribed to game channel game:xxx  ← Correct!
   ```
   (No "spectating" message)
6. Make a move - should update immediately without refresh

## Related Issues

This bug also explains:
- Why refreshing "fixed" the issue (forced re-subscription with loaded data)
- Why spectators couldn't affect the game (working as intended)
- Why some users had "Connection lost" issues (wrong channel subscriptions)

## Diagnostic Tools

New debug dashboard available to help catch similar issues:

- **Access**: Press `Ctrl+Alt+Shift+D`
- **Check**: Rooms tab shows which channels you're in
- **Verify**: Events tab shows all socket events
- **Monitor**: Connection status indicator

See [socket-debugging-guide.md](./socket-debugging-guide.md) for full details.

## Lessons Learned

1. **Always wait for async data before acting on it** - don't assume initial null/undefined state
2. **Race conditions are subtle** - code "works" but timing determines behavior
3. **Logs are your friend** - the spectator logs immediately revealed the issue
4. **Include dependencies** - React hooks need ALL dependencies that affect behavior
5. **Add guards** - defensive checks prevent acting on incomplete data

## Files Changed

- [frontend/src/pages/GameRoom.tsx](../../frontend/src/pages/GameRoom.tsx:1076) - Fixed subscription useEffect
- [frontend/src/components/DebugDashboard.tsx](../../frontend/src/components/DebugDashboard.tsx:15) - Changed keyboard shortcut
- [docs/operations/socket-debugging-guide.md](./socket-debugging-guide.md) - Updated documentation

---

**Fixed**: 2025-10-17
**Severity**: Critical (affected all players in all games)
**Impact**: Real-time gameplay completely broken until refresh
