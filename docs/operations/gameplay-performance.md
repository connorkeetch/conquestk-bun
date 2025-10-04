# Gameplay Performance & Latency Checklist

This note captures quick wins for keeping the live game responsive on both the client and server. Prioritise the high-impact items (top of each section) before chasing micro-optimisations.

## Frontend: minimise main-thread work

1. **Pause expensive theme effects during play sessions.** Premium themes such as *frontier*, *metal*, and *halloween* layer multiple animated gradients and particle effects. These rely on GPU-accelerated compositing and can hold frames open on low-power hardware. The theme loader now honours operating-system `prefers-reduced-motion` and `Save-Data` signals, turning background motion off automatically for those players. Keep this behaviour in mind when testing themes—if you force motion back on, expect higher GPU use, especially while the game map is animating.【F:frontend/src/config/themes.config.ts†L175-L211】
2. **Guard new animations with feature flags or the motion attribute.** If you add additional ambient effects, gate them behind the `data-background-motion="on"` attribute so they inherit the same opt-out behaviour. Avoid `will-change` on large containers because it forces layer promotion.
3. **Defer non-critical UI work.** The Game Room currently performs a large amount of Redux work on each socket tick. When adding new HUD features, lazy-load panels (`React.lazy` + `Suspense`) and debounce expensive selectors. Any component that re-renders every second should be memoised.
4. **Profile network waterfalls.** Vite chunks are already code-split; keep it that way. If you touch routing, avoid importing large admin bundles into the play experience.

### Quick diagnostics

- Record a Chrome Performance profile while ending a turn. Look for long purple (scripting) or green (render) blocks above 16 ms. Address the longest block first.
- Test on a throttled CPU (Chrome DevTools → Performance → 4× slowdown) to simulate mid-tier laptops.
- Watch the FPS meter (`Ctrl+Shift+P` → `Show FPS meter`). Sustained drops below 55 fps usually coincide with heavy CSS effects.

## Backend & transport

1. **Socket message size:** Keep payloads under 50 KB per tick. Use selectors on the client to derive view-only data instead of sending it all over the wire. Consider delta compression for map state if spikes persist.
2. **Database round-trips:** Lobby transitions call multiple services (maps, clans, stats). Batch queries in `gameService` so the turn handler only hits the database once per action. Push analytics/events off the hot path via Bull queues.
3. **Latency budgets:** Aim for <100 ms RTT between client and server. Enable Redis Socket.io adapter in production to prevent a single instance from becoming the bottleneck.

### Operational monitoring

- Track p95 socket latency via Socket.io's built-in metrics and surface it on the Grafana dashboard.
- Add a synthetic play session that joins a lobby, starts a game, and performs a few turns. Alert when response time > 250 ms.

## Asset strategy

1. **Backgrounds & audio:** Animated backgrounds are eye-catching but optional. On weaker devices, the cost is mostly GPU bound, so disable them (or swap to static imagery) once a game starts. Pre-render a static fallback screenshot for each theme to keep the brand feel without taxing the GPU.
2. **Image optimisation:** Run hero images through the CDN's `format=avif` or `webp` transformation. Keep map thumbnails under 300 KB.
3. **Audio streaming:** Stream long ambient tracks instead of preloading them. Provide a mute toggle that defaults to on for first-time players to avoid decode spikes when the map loads.

## Next steps for the team

- [ ] Add a `Performance` toggle in Settings that explicitly lets players trade visuals for speed, wiring it to `setBackgroundMotionPreference(false)` plus lighter map shaders.
- [ ] Audit React component re-render frequency in `GameRoom.tsx` using the React DevTools profiler. Memoise selectors where the flame chart shows >16 ms renders.
- [ ] Capture baseline metrics (frame time, socket RTT, payload size) before the next round of feature work so regressions are obvious.

