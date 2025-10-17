# Socket Debugging & Troubleshooting Guide

## Overview

This guide describes the diagnostic tools available for troubleshooting socket connectivity and real-time update issues in ConquestK.

## Problem Symptoms

Common symptoms of socket/real-time issues:
- Moves not registering until page refresh
- Missing turn notifications
- Game state not updating automatically
- "Connection lost" even though internet works
- Events arriving late or not at all

## Diagnostic Tools

### 1. Debug Dashboard (Frontend)

**Access**: Press `Ctrl+Alt+Shift+D` anywhere in the application

**What it shows**:
- **Events Tab**: Last 200 socket events (incoming/outgoing) with timestamps and latency
- **Rooms Tab**: All rooms you're currently subscribed to
- **Sequences Tab**: Delta sequence tracking with gap detection
- **Pending Tab**: Actions waiting for acknowledgment

**How to use it**:

1. Open the dashboard with `Ctrl+Alt+Shift+D`
2. Enable debugging if not already enabled
3. Reproduce the issue (e.g., try to make a move)
4. Watch the Events tab to see if:
   - The event is being sent (look for ↑ OUT)
   - An acknowledgment is received (look for ↓ IN)
   - There are any errors or delays (check latency column)

**Connection Status Indicator**:
- 🟢 Green dot = Connected
- 🔴 Red dot = Disconnected

### 2. Socket Debugger Utility

**Enable via localStorage**:
```javascript
localStorage.setItem('socket-debug', 'true')
// Then refresh the page
```

**Access in console**:
```javascript
// View current state
window.__socketDebugger.getState()

// Clear logs
window.__socketDebugger.clearLogs()

// Check if enabled
window.__socketDebugger.isEnabled()
```

### 3. Browser DevTools

**Socket.IO built-in debugging**:
```javascript
localStorage.setItem('debug', 'socket.io-client:*')
// Refresh page to see detailed Socket.IO logs in console
```

**Network tab**:
1. Open DevTools → Network tab
2. Filter by `WS` (WebSocket)
3. Click on the Socket.IO connection
4. View Messages tab to see raw events

### 4. Backend Logs

**Enable debug logging**:
```bash
# In backend/.env
LOG_LEVEL=debug
SOCKET_DEBUG=true  # Future feature flag
```

**View logs**:
```bash
# Combined logs
tail -f backend/logs/combined.log

# Error logs only
tail -f backend/logs/error.log
```

**Key log patterns to look for**:
- `User ${userId} connected` - Socket auth successful
- `User ${userId} subscribed to game channel` - Room subscription
- `Socket payload stats` - Outgoing event tracking
- `Failed to ack` - Acknowledgment issues

## Common Issues & Solutions

### Issue: Moves don't register

**Diagnosis**:
1. Open Debug Dashboard (Ctrl+Alt+Shift+D)
2. Try to make a move
3. Check Events tab for:
   - `game-action` (OUT) event
   - Corresponding acknowledgment (IN)
   - Any error responses

**Possible causes**:
- **No OUT event**: Client-side JavaScript error (check console)
- **OUT but no IN**: Network issue or server not responding
- **IN with error**: Validation failure (check error message)
- **High latency (>500ms)**: Network congestion

**Solutions**:
- Check browser console for errors
- Verify internet connection
- Check if action is valid (enough armies, correct phase, etc.)
- Try refreshing if connection seems stuck

### Issue: Not getting turn notifications

**Diagnosis**:
1. Open Debug Dashboard
2. Wait for your turn
3. Check Events tab for:
   - `turn:start` event (IN)
   - `game-delta` with PHASE_CHANGE (IN)

**Possible causes**:
- **Not subscribed to room**: Check Rooms tab
- **Events not arriving**: Connection issue
- **Events arriving but no notification**: Client-side handler issue

**Solutions**:
- Verify you're in the Rooms list for that game
- Check connection status (green dot)
- Look for `join-room` event in Events tab
- If not subscribed, try refreshing the page

### Issue: Connection shows as connected but not receiving events

**Diagnosis**:
1. Check Debug Dashboard connection indicator
2. Look at Sequences tab for gaps
3. Check last event timestamp in Events tab

**This is a "zombie connection"** - appears connected but isn't receiving data.

**Solutions**:
- The app should auto-detect this (heartbeat every 5s)
- If not auto-recovering, refresh the page
- Check if other tabs are working (confirms internet)

### Issue: Delta sequence gaps

**Diagnosis**:
1. Open Sequences tab
2. Look for gaps (missing delta numbers)

**What this means**:
- You missed some real-time updates
- App should automatically request missing deltas
- If gaps remain, state may be desynced

**Solutions**:
- App should show "Syncing game state..." toast
- If not recovering, manually refresh
- Check Network tab for failed requests

### Issue: Service worker precache 404s after deploy

**Symptom**:
- Console shows `bad-precaching-response` with a hashed asset (e.g. `AdminGameDetails-XXXX.js`).

**Impact**:
- Service worker install fails, so offline/PWA caching is disabled.
- Socket connectivity continues to work; this error does **not** explain missing real-time events.

**Diagnosis**:
1. Compare the missing filename with the current build output under `backend/public/assets`. If the hash differs, the CDN is serving an outdated asset bundle.
2. Inspect `backend/public/sw.js` (generated by `npm run build`) and confirm the manifest lists the new hashed filename.

**Fix**:
1. Re-run `npm run build` from the repo root so `sw.js` and the asset hashes line up (the build outputs into `backend/public/**`).
2. Redeploy the updated `backend/public` bundle so the CDN has the new hashed file.
3. Bump the service worker (any code change works; we use `SW_BUILD_ID` in `frontend/src/sw.ts`) to ensure clients download the updated `sw.js`.
4. Ask testers to hard-refresh or clear site data if their browser keeps the old file cached.

**Verification**:
```javascript
// Confirm the active SW build ID in DevTools > Console
const channel = new MessageChannel()
channel.port1.onmessage = (event) => console.info('SW build', event.data)
navigator.serviceWorker.controller?.postMessage({ type: 'GET_SW_BUILD_ID' }, [channel.port2])
```
- Expected output is `{ type: 'SW_BUILD_ID', value: '2024-09-27T00:00Z' }` (update the date as new builds ship).

## Troubleshooting Workflow

### Step 1: Verify Connection
```
1. Open Debug Dashboard (Ctrl+Alt+Shift+D)
2. Check connection status (green/red dot)
3. Look at reconnect count in footer
```

**If disconnected**:
- Check internet connection
- Look at browser console for errors
- Check if token expired (sign out/in)

### Step 2: Verify Room Subscription
```
1. Go to Rooms tab
2. Confirm your game room ID is listed
```

**If not listed**:
- Look for `join-room` event in Events tab
- Check for errors in that event
- Try leaving and rejoining the game

### Step 3: Check Event Flow
```
1. Go to Events tab
2. Trigger an action (e.g., deploy troops)
3. Watch for:
   - Your action going OUT
   - Acknowledgment coming IN
   - Subsequent delta updates IN
```

**If events missing**:
- Note which event is missing (OUT or IN)
- Check browser console for errors
- Check Network tab for failed requests

### Step 4: Check Sequences
```
1. Go to Sequences tab
2. Look for your game room
3. Check for gaps or high duplicate count
```

**If gaps detected**:
- App should auto-request missing deltas
- Wait 5-10 seconds for recovery
- If not recovered, refresh page

### Step 5: Check Pending Actions
```
1. Go to Pending tab
2. Look for actions stuck for >5 seconds
```

**If actions stuck**:
- These actions timed out waiting for ack
- App should retry automatically
- If still stuck after retries, connection issue

## Analytics Worker Note

The analytics-events worker processes two types of events:

- **`append_log`**: Stores individual game actions (attacks, deploys, fortifies, card trades, etc.) throughout the entire game for replay/audit trail. Called after each significant action.
- **`append_turn_stats`**: Records per-turn snapshot of game state (territory counts, army distributions, etc.) for performance metrics and analytics. Called only at the end of each turn.

These are **separate** and **intentional** - not a bug. They serve different purposes in the data pipeline:

- `append_log` = **Action-by-action history** (what happened)
- `append_turn_stats` = **Turn-level snapshots** (state at end of turn)

## Backend Diagnostic Endpoints (Future)

Planned endpoints for admin troubleshooting:
- `GET /api/debug/socket-state` - View all connected sockets and rooms
- `GET /api/debug/queue-health` - Check worker health and job counts
- `POST /api/debug/emit-test` - Manually emit test event to a socket

## Best Practices

### For Development
1. Keep Debug Dashboard open when testing features
2. Enable socket debugging in localStorage
3. Use `debug` log level in backend
4. Monitor both Events and Sequences tabs
5. Clear logs between test scenarios

### For Production Issues
1. Ask user to open Debug Dashboard (Ctrl+Alt+Shift+D)
2. Have them screenshot the Events tab
3. Check connection status and reconnect count
4. Look for patterns in event timing
5. Check backend logs for corresponding events

### For Performance Testing
1. Monitor latency column in Events tab
2. Check avgProcessingMs in queue stats
3. Look for delayed events (timestamp gaps)
4. Track reconnection frequency

## Reporting Issues

When reporting socket/real-time issues, include:
1. **Screenshot of Debug Dashboard Events tab**
2. **Connection status** (green/red, reconnect count)
3. **Room subscription** (from Rooms tab)
4. **Sequence gaps** (from Sequences tab)
5. **Pending actions** (from Pending tab)
6. **Browser console errors** (if any)
7. **Steps to reproduce**
8. **Expected vs actual behavior**

## Technical Details

### Socket Event Flow
```
Client Action
    ↓
  emit('game-action')
    ↓
Backend Validation
    ↓
Queue Job (BullMQ)
    ↓
Worker Processing
    ↓
emit('game-delta') to room
    ↓
Client Receives & Applies
    ↓
UI Updates
```

### Delta Sequence Tracking
- Each delta has a `version` number
- Client tracks last received version per room
- Gaps trigger automatic recovery
- Recovery fetches missing deltas or full state

### Connection Health Monitoring
- Heartbeat ping every 5 seconds
- Timeout if no pong in 3 seconds
- Auto-reconnect with exponential backoff
- Zombie connection detection

### Idempotency
- Each action gets unique idempotency key
- Prevents duplicate processing
- Allows safe retries
- Tracks in-flight actions

## Future Enhancements

Planned improvements to debugging:
1. Export debug logs to file
2. Replay captured events
3. Diff tool for delta sequences
4. Real-time latency graphs
5. Backend socket viewer (admin UI)
6. Automated health checks
7. Alert system for connection issues

---

**Last Updated**: 2025-10-17
**Maintainer**: Connor Keetch
