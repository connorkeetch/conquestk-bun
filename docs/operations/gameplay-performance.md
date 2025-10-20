# Gameplay Performance & Latency Checklist

This note captures quick wins for keeping the live game responsive on both the client and server. Prioritise the high-impact items (top of each section) before chasing micro-optimisations.

## Frontend: minimise main-thread work

1. **Pause expensive theme effects during play sessions.** Premium themes such as *frontier*, *metal*, and *halloween* layer multiple animated gradients and particle effects. These rely on GPU-accelerated compositing and can hold frames open on low-power hardware. The theme loader now honours operating-system `prefers-reduced-motion` and `Save-Data` signals, turning background motion off automatically for those players. Keep this behaviour in mind when testing themes—if you force motion back on, expect higher GPU use, especially while the game map is animating.【F:frontend/src/config/themes.config.ts†L175-L211】
2. **Guard new animations with feature flags or the motion attribute.** If you add additional ambient effects, gate them behind the `data-background-motion="on"` attribute so they inherit the same opt-out behaviour. Avoid `will-change` on large containers because it forces layer promotion.
3. **Defer non-critical UI work.** The Game Room currently performs a large amount of Redux work on each socket tick. When adding new HUD features, lazy-load panels (`React.lazy` + `Suspense`) and debounce expensive selectors. Any component that re-renders every second should be memoised.
4. **Profile network waterfalls.** Vite chunks are already code-split; keep it that way. If you touch routing, avoid importing large admin bundles into the play experience.

### Quick diagnostics

- Record a Chrome Performance profile while ending a turn. Look for long purple (scripting) or green (render) blocks above 16 ms. Address the longest block first.
- Test on a throttled CPU (Chrome DevTools → Performance → 4× slowdown) to simulate mid-tier laptops.
- Watch the FPS meter (`Ctrl+Shift+P` → `Show FPS meter`). Sustained drops below 55 fps usually coincide with heavy CSS effects.

## Backend & transport

1. **Socket message size:** Keep payloads under 50 KB per tick. Use selectors on the client to derive view-only data instead of sending it all over the wire. Consider delta compression for map state if spikes persist.
2. **Database round-trips:** Lobby transitions call multiple services (maps, clans, stats). Batch queries in `gameService` so the turn handler only hits the database once per action. Push analytics/events off the hot path via BullMQ queues.
3. **Latency budgets:** Aim for <100 ms RTT between client and server. Enable Redis Socket.io adapter in production to prevent a single instance from becoming the bottleneck.

### Operational monitoring

- Track p95 socket latency via Socket.io's built-in metrics and surface it on the Grafana dashboard.
- Add a synthetic play session that joins a lobby, starts a game, and performs a few turns. Alert when response time > 250 ms.

### 2025‑10‑08: AI Orchestrator + Delta Optimisations (Shipped)

Performance-oriented changes landed alongside AI work:

- Per‑action AI streaming with readable pacing
  - AI turns now emit fog‑filtered deltas (deploy/attack/fortify/phase) one step at a time with ~250–400 ms delays, clamped by an overall per‑tier time budget.
  - Full snapshots are no longer broadcast mid‑turn for AI actions, reducing peak bandwidth and CPU on clients.

- Concise treasure cash‑in updates
  - Replaced full snapshot on `trade_cards` with two minimal deltas: `PLAYER_UPDATE` (armies, mustCashInTreasures) and conditional `PHASE_CHANGE` (reinforcement) — both fog‑filtered.

- Socket payload metrics
  - Added lightweight rolling metrics for `game:snapshot`, `game-action:frame-committed`, and `game-action:checksum` events (p50/p95/max). Logged periodically to help track regressions in payload size.

- Fog‑aware AI planning
  - Planner state is filtered to owned + adjacent territories (team‑aware) when fog is enabled. Prevents EV calculations from using hidden information.

- Grandmaster EV + chaining (budget‑aware)
  - Grandmaster selects attacks using a time‑boxed Monte Carlo EV estimate (win prob + expected losses + capture/sector/capital value) and re‑plans to chain multiple attacks within remaining budget up to `maxAttackChains`.
  - Commander received sector‑pressure reinforcement and simple card‑timing logic.

What to verify locally
- Observe lockstep frame commits instead of full snapshots during AI turns and treasure cash-ins.
- Watch logs for `Socket payload stats` and ensure p95 sizes do not increase over time.
- In fog games, confirm AI no longer targets unseen territories.
- With Grandmaster, expect multiple attacks per turn within budget; phase still transitions promptly.

## Asset strategy

1. **Backgrounds & audio:** Animated backgrounds are eye-catching but optional. On weaker devices, the cost is mostly GPU bound, so disable them (or swap to static imagery) once a game starts. Pre-render a static fallback screenshot for each theme to keep the brand feel without taxing the GPU.
2. **Image optimisation:** Run hero images through the CDN's `format=avif` or `webp` transformation. Keep map thumbnails under 300 KB.
3. **Audio streaming:** Stream long ambient tracks instead of preloading them. Provide a mute toggle that defaults to on for first-time players to avoid decode spikes when the map loads.

## Implementation Progress

### ✅ Phase 1: Quick Wins (Completed 2025-10-04)

**Performance Mode Toggle**
- [x] Added `performance.mode` boolean to Redux settings state ([frontend/src/store/settingsSlice.ts:65-67](frontend/src/store/settingsSlice.ts))
- [x] Created UI toggle in Settings → Display section with clear trade-off description
- [x] Wired to `setBackgroundMotionPreference()` for immediate effect
- [x] Persists user preference to localStorage

**Auto-Disable Backgrounds During Gameplay**
- [x] GameRoom now auto-disables background animations when games start ([frontend/src/pages/GameRoom.tsx:187-213](frontend/src/pages/GameRoom.tsx))
- [x] Restores user preference when game ends
- [x] Respects performance mode setting (stays off if enabled)
- [x] Already honours `prefers-reduced-motion` and `Save-Data` system hints

**Component Memoization** (5 heavy components optimized)
- [x] [PlayersPanel.tsx](frontend/src/components/game/PlayersPanel.tsx) - Memoized territory/army calculations with custom comparison
- [x] [PlayerStatsTable.tsx](frontend/src/components/game/PlayerStatsTable.tsx) - Memoized stats computation with useCallback handlers
- [x] [SectorControlPanel.tsx](frontend/src/components/game/SectorControlPanel.tsx) - Memoized player lookup map and partial control rendering
- [x] [TerritoryInfoPanel.tsx](frontend/src/components/game/TerritoryInfoPanel.tsx) - Memoized territory data lookup to prevent hover spam
- [x] Turn summary chip in [GameRoom.tsx](frontend/src/pages/GameRoom.tsx#L1100) - Memoized derived state keeps phase updates lightweight

**Memoized Redux Selectors** ([frontend/src/store/selectors.ts](frontend/src/store/selectors.ts))
- [x] `selectValidTargets` - Cached BFS pathfinding for fortify movement (was recalculated every selection)
- [x] `selectPlayerStats` - Territory/army aggregation per player
- [x] `selectSectorControl` - Sector ownership calculations
- [x] `selectAvailableActions` - Phase-based action availability

**Socket Latency Monitoring** ([backend/src/services/socketService.ts](backend/src/services/socketService.ts))
- [x] Added latency tracking infrastructure with p95 calculation
- [x] Auto-warning when latency >250ms for 5+ consecutive samples
- [x] Exported `getSocketLatencyMetrics()` for future monitoring endpoints
- [x] Tracks rolling window of last 10 samples per user

**Expected Improvements:**
- Reduced React re-renders via memoization
- Faster selector performance (BFS and aggregations cached)
- Lower GPU usage during active gameplay
- Better visibility into socket performance

### 🚧 Phase 2: Deep Optimizations (In Progress)

This phase focuses on shaving server-side latency and wire size during turns. Each work item below includes where to implement, concrete steps, and a clear “done when”. Capture a quick baseline first (see Baseline capture) so we can quantify wins.

1) Batch database queries in turn handlers
- Scope: Replace multi-round-trip patterns in hot paths with a single transaction/CTE pass.
- Where:
  - `backend/src/services/gameService.ts`
  - Helpers in `backend/src/config/database.ts` (`transaction`), `backend/src/services/gameRoomService.ts`
- Steps:
  - Add `getTurnContext(gameId, playerId)` that returns in one call: current serialized game_state, minimal room info (turn_number/current_turn_user_id), and any flags required by the engine (e.g., conquest this turn). Use a CTE with `$n` params and `FOR UPDATE` where needed.
  - In `endTurn`, `deployArmies`, `fortify`, and queued action appliers, call `getTurnContext` within a `transaction(...)` block and persist results + logs in the same transaction.
  - Avoid N+1 user fetches when finalizing results: fetch players and stats with `WHERE id = ANY($1)` in a single call (already present in some flows; ensure all paths use it).
- Done when:
  - Attack, deploy, fortify, endTurn each perform ≤1 DB round‑trip for read + ≤1 round‑trip for write in a single transaction.
  - No intermediate SELECTs between validation/persist within the same handler.
  - Integration tests for these handlers run with comparable behavior but show fewer DB calls in debug logs.
- Risks/rollback:
  - Transaction lock contention on hot rooms. If observed, isolate updates to rows touched (`game_states`, minimal `game_rooms` columns) and keep snapshot inserts as `DO NOTHING` outside the critical section.

Implementation notes (2025‑10‑08)
- endTurn now persists `game_states` + `game_rooms` and the immutable snapshot in a single DB transaction via `persistTurnStateTransactional()`. Caching remains unchanged.

2) Optimize socket payload sizes (<50 KB per `game:snapshot`)
- Scope: Reduce serialized payload and frequency; favor deltas.
- Where:
  - `backend/src/services/socketService.ts`
  - `backend/src/services/metricsService.ts` (new payload metrics)
  - Client consumers under `frontend/src/store` and `frontend/src/pages/GameRoom.tsx`
- Steps:
  - Instrument payload size: wrap `socket.emit('game:snapshot', data)` and `io.to(channel).emit('game:snapshot', data)` with a helper that measures `Buffer.byteLength(JSON.stringify(data),'utf8')` and records a metric `socket_payload_bytes{event="game:snapshot"}` (add a Gauge in `metricsService`). Capture p50/p95 in logs for now.
  - Trim shape: ensure `SerializedGameState` contains only required fields for the view. Prefer ids over embedded user objects; keep history/logs out of the hot message.
  - Keep `game:snapshot` usage exceptional; rely on lockstep frames (`game-action:frame-committed`) for turn-by-turn updates. Audit any remaining snapshot emits in `socketService.ts` and convert hot-path updates to framed actions.
- Done when:
  - Median payload size for `game:snapshot` < 30 KB, p95 < 50 KB across a 10‑minute synthetic session.
  - At least two previously full‑state emits replaced with deltas with no UX regressions.
- Risks/rollback:
  - Older clients missing delta handlers: maintain the full‑state path behind a feature flag for one release.
Implementation notes (2025‑10‑08)
- Server now emits a lean `game:snapshot` snapshot (players/board/config/targets/KOTH only) from `serializeGameStateForClient()`; heavy/unused fields are excluded.

3) Lockstep-only transport (server-led, client-safe)
- Scope: Rely exclusively on deterministic lockstep frames for state convergence while keeping fog-aware textual logs lightweight.
- Where:
  - `backend/src/workers/gameActionWorker.ts`
  - `backend/src/services/realtimeEmitter.ts`
  - `frontend/src/services/socketService.ts`
- Steps:
  - Ensure every action path records textual moves/logs without emitting legacy deltas.
  - Use `emitRevealSnapshot` sparingly for joins/resyncs; snapshots should not appear on normal turns.
  - Verify the client simulator consumes `game-action:*` frames exclusively.
- Done when:
  - No backend module imports `DeltaBuilder` or delta services; lockstep frames remain the only gameplay transport.
  - Packet-loss simulations still converge via reveal snapshots and lockstep checksum recovery.

Implementation notes (2025-10-08)
- Frontend lockstep replay handles all reconciliation; `socketService` no longer tracks delta sequences.
- Fog-aware textual moves flow through `realtimeEmitter`, keeping spectator/chat feeds synced without state payloads.
- Reveal snapshots remain the fallback path for joins or desync recovery.

4) Move analytics/events off the hot path to BullMQ queues

Implementation notes (2025‑10‑08)
- endTurn appends logs and per-turn stats via `queueService.addAnalyticsEvent()`; when queues are unavailable, these writes occur asynchronously (fire-and-forget) off the critical path.

4) Move analytics/events off the hot path to BullMQ queues
- Scope: Decouple event logging, achievements, and clan progression from action handlers.
- Where:
  - `backend/src/services/queueService.ts`
  - Call sites in `backend/src/services/gameService.ts` that log or fan out non-critical work
- Steps:
  - Introduce a lightweight `analyticsEvent` queue job with a simple DTO and DLQ retention.
  - Replace inline `query(...)` + log writes for analytics/telemetry with `queueService.add(...)` and minimal context. Keep a small in‑memory buffer if Redis is unavailable, and flush opportunistically.
  - Ensure idempotency (hash key includes gameId + turn + event type).
- Done when:
  - Turn handlers do not await analytics persistence; p95 handler time improves measurably in dev.
  - Dead-letter queue shows zero growth under normal play; errors are observable in logs/metrics.

Baseline capture (do this once before the above)
- Run a 10‑minute synthetic session locally (4 players, one AI). Capture:
  - p50/p95 `game:snapshot` payload bytes
  - p50/p95 server handler time for deploy/attack/fortify/endTurn (console logs fine)
  - DB calls per action (enable query debug or rough count via logger)
  - Socket latency p95 (already exposed via `getSocketLatencyMetrics()`)

Local verification checklist
- `npm run dev:backend` and play a short match with 2–3 turns.
- Confirm that: (a) payload size metrics log, (b) deltas arrive for each action, (c) full-state is only sent on join or desync, (d) no duplicated DB reads in turn handlers.

Notes
- Socket.io Redis adapter is already wired in `backend/src/index.ts:191-205` for multi‑instance scaling.
- Delta infrastructure exists in `backend/src/services/deltaEmitter.ts`; this phase ensures complete coverage and adds convergence safeguards.

### ✅ Phase 3: Asset & Media (In Progress)

- [x] Lazy-load heavy UI panels with `React.lazy` + `Suspense`
  - Implemented for PlayerStatsPanel, ChatLogPanel, GameLogPanelWrapper; modals (GameOver, Settings, PlayerProfile) are lazy too.
  - Intent prefetch on hover/focus and idle/viewport to smooth first-open UX.
- [x] Conditional audio loading (stream long tracks, default mute for first-time players)
  - Music (`playMusic`) now uses `html5: true` and `preload: false` to stream tracks.
  - First run defaults to muted if no stored preference; persists `audioMuted=true`.
- [ ] Static theme fallbacks for expensive themes (frontier, metal, halloween)
- [ ] CDN image transformations (`format=avif`, keep thumbnails <300 KB)

### 🔜 Phase 4: Monitoring & Validation (Planned)

- [ ] Add performance profiling hook (`usePerformanceMonitor`)
- [ ] Create synthetic play session test (join → start → 5 turns, assert <250ms response)
- [ ] Capture baseline metrics before Phase 2 work
- [ ] Compare before/after metrics and document improvements

## Next steps for the team

Continue with **Phase 2** work to batch database queries and reduce socket payload sizes. The foundation from Phase 1 (memoization + monitoring) will make it easier to measure improvements.
