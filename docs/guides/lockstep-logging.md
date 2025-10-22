# Lockstep Synchronization Logging Guide

## Where to Find Logs

### Local Development
- **Browser Console**: All client-side `[Lockstep]` logs appear in browser DevTools console
- **Terminal**: Backend logs appear in the terminal where you ran `npm run dev:backend`

### Production/Staging (Railway)
- **Railway Dashboard** → Your Service → **Logs** tab
- **Log Level**: Set via `LOG_LEVEL` environment variable (default: `info`)
- **Recommended**: Keep at `info` level to see important lockstep events without spam

## Log Levels

All lockstep logs use these levels:
- **`error`** - Critical failures (checksum mismatches, snapshot apply failures)
- **`warn`** - Important issues (frame gaps, missing baselines, resyncs)
- **`info`** - Normal operations (baseline initialization, successful syncs)
- **`debug`** - Detailed trace (every frame/checksum, timing details)

**For Railway**: Set `LOG_LEVEL=info` to see `error`, `warn`, and `info` logs.

---

## Client-Side Logs (`[Lockstep]` Prefix)

### Baseline Initialization
```
[Lockstep] Initializing baseline from game:snapshot
[Lockstep] Setting baseline from game:snapshot
[Lockstep] Baseline ready - sending ack
```
**What it means**: Client received initial game state and is ready for lockstep frames.
**If missing**: Check for "Snapshot dropped" debug logs - client may have rejected the snapshot.

---

### Frame Processing
```javascript
[Lockstep] Frame received
  matchId: "abc123"
  frameSeq: 42
  lastSeq: 41
  baselineReady: true
  commandCount: 1

[Lockstep] Frame applied successfully
  matchId: "abc123"
  seq: 42
  phase: "attack"
  currentPlayer: "user123"
```
**What it means**: Client received and successfully applied a game action frame.
**Normal**: You should see one of these for every action (deploy, attack, fortify).

---

### Checksum Verification
```javascript
[Lockstep] Checksum received
  matchId: "abc123"
  seq: 42
  crc32: 2847562913
  baselineReady: true

[Lockstep] Checksum verified - states in sync
  matchId: "abc123"
  seq: 42
  checksum: 2847562913
```
**What it means**: Server and client game states match perfectly.
**Normal**: Periodic (every few actions), not after every frame.

---

### Error: Checksum Arrived Without Baseline
```javascript
[Lockstep] Checksum received but baseline not ready - requesting resync
  matchId: "abc123"
  checksumSeq: 5
```
**What it means**: Server sent checksum before client initialized baseline.
**Fix Applied**: Phase 1 ensures baseline is always initialized from first `game:snapshot`.
**If you still see this**: Client may have lost baseline - check for disconnect/reconnect.

---

### Error: Frame Gap Detected
```javascript
[Lockstep] Frame gap detected - requesting resync
  matchId: "abc123"
  expected: 43
  received: 45
  gap: 2
```
**What it means**: Client missed frames 43 and 44 - network issue or server pruned old frames.
**Normal Recovery**: Resync triggered automatically, snapshot will catch client up.

---

### Error: Checksum Mismatch
```javascript
[Lockstep] CHECKSUM MISMATCH - states diverged!
  matchId: "abc123"
  serverSeq: 50
  serverChecksum: 2847562913
  localChecksum: 2847562999
  diff: 86
```
**What it means**: Client and server have different game states - serious desync.
**Normal Recovery**: Automatic resync requested, client will receive fresh snapshot.
**If frequent**: Indicates simulation bug - report with logs.

---

### Resync Workflow
```javascript
// 1. Resync triggered
[Lockstep] Initiating resync
  roomId: "abc123"
  reason: "frame_gap"
  attempt: 1
  lastSeq: 42
  baselineReady: true

[Lockstep] Resync request sent
  roomId: "abc123"
  fromSeq: 42
  traceId: "abc123:xyz789"

// 2. Snapshot received
[Lockstep] Snapshot received
  matchId: "abc123"
  baselineSeq: 40
  frameCount: 5
  pendingResync: true

[Lockstep] Applying catch-up frames
  matchId: "abc123"
  frameCount: 5
  firstSeq: 41
  lastSeq: 45

[Lockstep] Snapshot applied successfully
  matchId: "abc123"
  finalSeq: 45
  phase: "reinforcement"

[Lockstep] Baseline ready - sending ack
  matchId: "abc123"
  seq: 45
```
**What it means**: Full resync completed successfully.
**Duration**: Should complete within 1-2 seconds.

---

### Resync Timeout (Phase 3 Fix)
```javascript
[Lockstep] Resync timeout - falling back to full game state fetch
  roomId: "abc123"
  traceId: "abc123:xyz789"
  timeoutMs: 10000
```
**What it means**: Snapshot didn't arrive within 10 seconds - falling back to HTTP fetch.
**Rare**: Should not happen unless server is overwhelmed or network is very poor.

---

### Health Monitoring (Phase 5)
```javascript
[Lockstep] Health check: too many consecutive resyncs - disabling lockstep for room
  roomId: "abc123"
  attempts: 3
  threshold: 3

Lockstep disabled due to repeated sync failures - using snapshot mode
```
**What it means**: After 3 failed resyncs, client gives up on lockstep and uses snapshots only.
**Recovery**: Rejoin room or refresh page to re-enable lockstep.
**If frequent**: Indicates persistent simulation mismatch - report to developer.

---

## Server-Side Logs (`[Lockstep Server]` Prefix)

### Baseline Ack Tracking (Phase 4)
```javascript
[Lockstep Server] Baseline ack received
  matchId: "abc123"
  socketId: "xyz789"
  seq: 0

[Lockstep Server] Baseline ack updated
  matchId: "abc123"
  socketId: "xyz789"
  oldSeq: 0
  newSeq: 45
  timeSinceLastAck: 5234
```
**What it means**: Server tracking which clients have initialized their baseline.
**Use**: Helps identify clients stuck without baseline.

---

### Warning: Emitting to Clients Without Baseline
```javascript
[Lockstep Server] Emitting frame to clients without baseline ack
  matchId: "abc123"
  frameSeq: 10
  unackedCount: 1
  totalInRoom: 2
  unackedSocketIds: ["xyz789"]
```
**What it means**: Server is sending frames to clients that haven't acked baseline yet.
**Normal**: Brief window after join before baseline-ack arrives (<1 second).
**If persistent**: Client stuck in loading state - check client logs for errors.

---

### Checksum Emission
```javascript
[Lockstep Server] Checksum emitted
  matchId: "abc123"
  checksumSeq: 50
  crc32: 2847562913
  emittedTo: 2
```
**What it means**: Server sent checksum to N clients who have acked baseline.
**Normal**: Only clients with baseline receive checksums (security/performance).

---

### Stale Baseline Warning
```javascript
[Lockstep Server] Checksum emitted to stale baseline ack
  matchId: "abc123"
  socketId: "xyz789"
  timeSinceAck: 350000
  ackedSeq: 10
  checksumSeq: 100
```
**What it means**: Client hasn't re-acked baseline in >5 minutes but is still in room.
**Rare**: Indicates client may be stuck or zombie connection.

---

### Initial Sync on Join

```javascript
[Lockstep Server] Sending initial sync to newly joined client
  matchId: "abc123"
  socketId: "xyz789"
  userId: "user123"
  latestSnapshotSeq: 45
  recentFrameCount: 3

[Lockstep Server] Initial sync completed for joined client
  matchId: "abc123"
  socketId: "xyz789"
  framesSent: 3
  finalSeq: 48
```
**What it means**: Server sends recent frames (up to 10) immediately after join to ensure perfect sync.
**Purpose**: Prevents window where client has baseline but server has moved forward.
**Normal**: You'll see this on every join if the game has progressed beyond seq 0.
**If fails**: Best-effort - join succeeds anyway, client will catch up via normal frame flow.

---

## Common Scenarios & What to Look For

### Scenario 1: Normal Gameplay (2 Players)
**Expected Logs**:
1. Both clients: `Baseline ready - sending ack`
2. Server: `Baseline ack received` (x2)
3. Player 1 attacks: Server emits frame → Both clients: `Frame applied successfully`
4. Server periodically: `Checksum emitted` → Both clients: `Checksum verified`

**No warnings or errors**

---

### Scenario 2: Player Joins Mid-Game
**Expected Logs**:
1. New client: `Initializing baseline from game:snapshot`
2. New client: `Applying catch-up frames` (if game is in progress)
3. New client: `Snapshot applied successfully`
4. New client: `Baseline ready - sending ack`
5. Server: `Baseline ack received`
6. Server: Next frame → All clients including new one: `Frame applied successfully`

**Brief "unackedCount: 1" warning before baseline-ack arrives is normal**

---

### Scenario 3: Network Hiccup (Frame Dropped)
**Expected Logs**:
1. Client: `Frame gap detected - requesting resync` (expected 43, received 45)
2. Client: `Initiating resync`
3. Client: `Snapshot received`
4. Client: `Snapshot applied successfully`
5. Play continues normally

**Recovery should take <3 seconds**

---

### Scenario 4: Page Refresh
**Expected Logs**:
1. Old connection: Server removes baseline ack
2. New connection: Full rejoin flow (same as "Player Joins Mid-Game")
3. Server may briefly emit to room without ack until new baseline-ack arrives

**Normal - lockstep re-establishes automatically**

---

## Debugging Tips

### Issue: "Checksum arrived without baseline state"
**Check**:
1. Client logs for "Initializing baseline from game:snapshot" - if missing, snapshot was dropped
2. Client logs for "Snapshot dropped: version not ahead" - conditional logic rejected it
3. **Fix**: Phase 1 ensures baseline always initializes - should be resolved

---

### Issue: "Frame gap (expected 251, received 29)"
**Check**:
1. Server logs for frame pruning (backend prunes old frames to save memory)
2. Client logs for server reset detection
3. **Fix**: Phase 2 detects server resets and triggers resync - should be resolved

---

### Issue: Actions don't register until refresh
**Check**:
1. Client logs for `desyncDetected: true` or `resyncing: true` flags stuck
2. Client logs for resync timeout "falling back to full game state fetch"
3. **Fix**: Phase 3 adds 10s timeout with fallback - should be resolved

---

### Issue: Constant resyncs
**Check**:
1. Count resync attempts in logs - if >3, lockstep disables itself
2. Look for checksum mismatches with different `diff` values each time
3. **Indicates**: Simulation bug (non-deterministic behavior)
4. **Report**: Full logs from both clients + server

---

## Log Verbosity Settings

### Development (Local)
```bash
# Backend - see all lockstep details
LOG_LEVEL=debug npm run dev:backend

# Frontend - browser console shows all levels by default
# Filter in DevTools: type "[Lockstep]" in console filter box
```

### Production/Staging (Railway)
```bash
# Railway environment variable
LOG_LEVEL=info  # Recommended - shows important events without spam
LOG_LEVEL=debug # Use temporarily when debugging issues
LOG_LEVEL=warn  # Minimal - only warnings and errors
```

**Note**: `debug` logs are very verbose (every frame, every checksum). Only enable temporarily.

---

## Log Retention

### Railway
- **Free Tier**: Last 1000 lines (rolling buffer)
- **Pro Tier**: Longer retention + download capability
- **Tip**: For extended debugging, pipe logs to external service (Papertrail, Logtail, etc.)

### Local Development
- **Terminal**: Scrollback buffer (depends on terminal settings)
- **Browser**: Console history (usually 10k-100k lines depending on browser)
- **Tip**: Use `> output.log` to save backend logs to file

---

## Performance Impact

### Client-Side
- `debug` logs: ~0.1ms per log (negligible)
- Frame/checksum logs: ~50-100 logs per minute during active gameplay
- **Impact**: Minimal - safe to leave at `info` level in production

### Server-Side
- `debug` logs: Includes every frame emission to every client
- `info` logs: Only baseline acks and resync events
- **Impact**: `debug` can add 5-10% CPU in busy games (many players, rapid actions)
- **Recommendation**: Use `info` in production, `debug` only for diagnostics

---

## Summary

**Where to look**:
- Local: Browser console (client) + Terminal (server)
- Railway: Dashboard → Logs tab

**What level**: `info` is perfect for Railway production/staging

**Key logs to watch for**:
- ✅ "Baseline ready - sending ack" - lockstep initialized
- ✅ "Frame applied successfully" - actions processing
- ✅ "Checksum verified" - states in sync
- ⚠️ "Frame gap detected" - minor issue, auto-recovers
- ⚠️ "Checksum mismatch" - serious desync, auto-recovers
- ❌ "Lockstep disabled due to repeated sync failures" - gave up, needs investigation

All fixes from Phases 1-5 are designed to make the ⚠️ warnings self-heal and prevent ❌ errors from occurring in normal gameplay.
