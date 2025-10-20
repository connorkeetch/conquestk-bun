# Real-time game update pipeline notes

This document explains how a board update flows from one player's action to all clients, reflects the latest changes we landed across BE/FE, and calls out remaining gaps to reach Slack-grade reliability without page refreshes.

## 1) Socket authentication and room subscription

- Backend sockets require a JWT and then an explicit room join. On connect we set `socket.userId` and mirror minimal identity in `socket.data.userId` so fog filtering can target viewers reliably.
- `join-room` verifies membership, joins both the lifecycle room (`roomId`) and game channel (`game:${roomId}`), emits `player-joined` to peers, and sends a filtered snapshot to the joining socket using the latest cached state (or a fresh fetch when cache is missing).
- Frontend establishes the socket in `socketService.connect()` and joins on entry. On reconnect, we automatically rejoin based on Redux state (member vs spectator) and trigger a small delayed full-state refetch to converge if the connection wasn’t recovered by Socket.io’s replay.

Status: Subscription works and auto‑rejoin is in place. `join-room`/`spectate-room` now ack with `{ ok, roomId, joinedAt }`, and the client retries with backoff until the join is confirmed.

## 2) Queueing and processing gameplay actions

- Unified path: all actions go through `'game-action'`. The server attempts to enqueue to BullMQ via `queueService.addGameAction`; if queues are unavailable or not initialised, it falls back to inline processing through `GameActionProcessor` and still acks the client. This removes the previous “queued but never processed” stall.
- Workers: `GameActionWorker` pops jobs, validates via `GameService`, and now emits only fog-aware log text through `realtimeEmitter` (see section 3). Job idempotency is handled by `jobIdempotencyService` so retries don’t double-apply while state convergence flows through deterministic frames.
- Acknowledgements: the server acks immediately on both paths with `{ ok: true, queued: boolean, acceptedAt }`. The client treats game‑action acks as delivery confirmation (not success of the move), and converges on subsequent deltas/snapshot.

Status: Inline fallback and acks are implemented; job idempotency exists server‑side, and the client now emits idempotency keys and automatically retries timeouts with the same key.

## 3) Lockstep broadcast + fog-aware logs

- Frames first: backend commits deterministic input frames via `game-action:frame-committed` (with seq + checksum) and sends periodic `game-action:checksum` heartbeats. These replace legacy `game-delta` payloads entirely.
- Replay buffer: persisted frames live in Postgres (`match_frames`) and can be streamed for resync/replay without relying on ad-hoc Redis rings.
- Fog filtering: textual game-log emissions (`game-log:append` / `game-log:batch`) remain fog-aware, using visibility masks derived from the authoritative state when the frame was applied.
- Targeted reveal: when a client joins or reports a gap, we emit a fog-filtered snapshot (`emitRevealSnapshot`) to that socket only, avoiding room-wide broadcasts.

Status: Frame commits + checksums are the sole realtime transport; only game-log text continues over fog-aware socket events.

## 4) Frontend consumption and convergence

- Lockstep client: `socketService` replays committed frames through the shared simulator, tracking seq/checksum. Gaps trigger a `game-action:resync-request` which pulls a snapshot + missing frames.
- Snapshot usage: full snapshots (`game-action:snapshot` / `game:snapshot`) are reserved for join/reconnect flows and resync fallbacks; normal play derives state exclusively from frames.
- Defensive checks: checksum mismatches or frame gaps flip the `needsResync` flag and surface a banner instead of silently drifting.
- Optimism: deploy/fortify still apply lightweight optimistic updates on ack, but the authoritative frame reconciles them immediately after commit.
- Health: heartbeat pings + reconnect logic remain; after reconnect we request the latest snapshot if checksums diverged.

Status: Lockstep replay is live, with resync + checksum handling in place. Further UX polish (connection badges, richer banners) is tracked in Phase 3.

## 5) What’s still fragile (re‑evaluated)

1. Turn notifications coverage: client emits a toast on PHASE_CHANGE→my turn; server‑side push/web notifications are not guaranteed for all paths (AI skips, resignations). Centralize and emit a specific “turn_start” signal on every transition.
2. Visibility metadata dependency: fog filtering depends on `socket.data.userId`. We already fall back to unfiltered broadcast when it’s missing; ensure tests cover this to prevent regressions.
3. Client watchdog polish: we auto-fetch after delta starvation, but we still surface only toast-level feedback. Consider a subtle banner/state indicator when tempo degrades.
4. Admin observability: queue/socket health and replay buffer stats are not yet exposed in the UI; surface them so Connor can spot issues quickly.

## 6) Hardening plan (prioritised, updated)

1. Reliability metrics + badge (Phase 3 Metrics + Latency Indicator).
   - Track action success rate, reconnects, delta gaps, and p95 latency in `metricsService` and surface a small ConnectionBadge in Game Room.
   - Add `/api/metrics/client` to store snapshots for admin triage and alert when success rate < 90%.
2. Turn notifications from the server.
   - Emit a dedicated socket event (and optional push) for every “your turn” transition, including AI/skip flows; keep the client toast for redundancy.
3. Surface queue/socket health + replay stats in-app.
   - Use existing `/api/queues/health` and expose ring buffer depth so players/admins see “Realtime degraded” without diving into logs.
4. Explore a light client watchdog banner.
   - When we auto-fetch after missing deltas, surface a transient banner/toast so players know we’re resyncing on their behalf.

## References and related docs

- Lockstep contract + fogged logs: backend/src/services/realtimeEmitter.ts, backend/src/services/fogService.ts, backend/src/workers/gameActionWorker.ts
- Client socket orchestration: frontend/src/services/socketService.ts
- Queues and fallback: backend/src/services/queueService.ts, backend/src/workers/workerManager.ts, backend/src/services/jobIdempotencyService.ts
- Phase 3 guides to implement next:
  - docs/phase3-idempotency-guide.md
  - docs/phase3-optimistic-ui-guide.md
  - docs/phase3-metrics-tracking.md
  - docs/phase3-latency-indicator.md

Following this updated plan, even if Redis hiccups or a worker dies, actions process inline, subscriptions are confirmed/retried, lockstep frames keep every client in sync, and the client self-heals and surfaces status — eliminating the need for manual refreshes.
