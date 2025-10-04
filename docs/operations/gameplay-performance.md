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
2. **Database round-trips:** Lobby transitions call multiple services (maps, clans, stats). Batch queries in `gameService` so the turn handler only hits the database once per action. Push analytics/events off the hot path via Bull queues.
3. **Latency budgets:** Aim for <100 ms RTT between client and server. Enable Redis Socket.io adapter in production to prevent a single instance from becoming the bottleneck.

### Operational monitoring

- Track p95 socket latency via Socket.io's built-in metrics and surface it on the Grafana dashboard.
- Add a synthetic play session that joins a lobby, starts a game, and performs a few turns. Alert when response time > 250 ms.

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
- [x] [ContinentControlPanel.tsx](frontend/src/components/game/ContinentControlPanel.tsx) - Memoized player lookup map and partial control rendering
- [x] [TerritoryInfoPanel.tsx](frontend/src/components/game/TerritoryInfoPanel.tsx) - Memoized territory data lookup to prevent hover spam
- [x] [GameHeader.tsx](frontend/src/components/game/GameHeader.tsx) - Memoized with phase-based re-render control

**Memoized Redux Selectors** ([frontend/src/store/selectors.ts](frontend/src/store/selectors.ts))
- [x] `selectValidTargets` - Cached BFS pathfinding for fortify movement (was recalculated every selection)
- [x] `selectPlayerStats` - Territory/army aggregation per player
- [x] `selectContinentControl` - Continent ownership calculations
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

### 🔜 Phase 2: Deep Optimizations (Planned)

- [ ] Batch database queries in `gameService` turn handlers
- [ ] Optimize socket payload sizes (target: <50 KB per `gameUpdate`)
- [ ] Consider delta compression for board state updates
- [ ] Move analytics/events off hot path to Bull queues

### 🔜 Phase 3: Asset & Media (Planned)

- [ ] Lazy-load heavy UI panels with `React.lazy` + `Suspense`
- [ ] Conditional audio loading (stream long tracks, default mute for first-time players)
- [ ] Static theme fallbacks for expensive themes (frontier, metal, halloween)
- [ ] CDN image transformations (`format=avif`, keep thumbnails <300 KB)

### 🔜 Phase 4: Monitoring & Validation (Planned)

- [ ] Add performance profiling hook (`usePerformanceMonitor`)
- [ ] Create synthetic play session test (join → start → 5 turns, assert <250ms response)
- [ ] Capture baseline metrics before Phase 2 work
- [ ] Compare before/after metrics and document improvements

## Next steps for the team

Continue with **Phase 2** work to batch database queries and reduce socket payload sizes. The foundation from Phase 1 (memoization + monitoring) will make it easier to measure improvements.
