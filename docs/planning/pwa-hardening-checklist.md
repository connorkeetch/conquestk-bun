# PWA Hardening Checklist
_Last updated: February 21, 2026_

This checklist breaks down the workstreams from the mobile app strategy into concrete tasks Connor can slot into upcoming sprints. Each section ends with a definition-of-done so QA knows what to verify.

## 1. Responsive & Touch Polish
1. **Inventory live breakpoints**
   - Pull the Tailwind config (`frontend/tailwind.config.ts`) and document current breakpoint tokens.
   - Compare to analytics for top device widths (use Plausible + GA). Add tablet-specific breakpoints if there are gaps between `md` and `lg`.
2. **Audit layout at target widths**
   - Use Chrome device toolbar presets (iPhone 15, Pixel 8 Pro, iPad Mini, Galaxy Tab) and an ultrawide tablet (Surface Duo) to review all primary routes: Home, Lobby, Game Room, Spectator, Map Browser.
   - Capture screenshots of any layout overflow, clipped modals, or font scaling issues.
3. **Tighten interaction hit areas**
   - Confirm all tap targets are ≥44px (11 Tailwind `rem` units) on mobile.
   - For the game board canvas, instrument pinch/zoom/pan with `pointer` events instead of legacy `touch` events; ensure high-DPI scaling maintains crisp territory borders.
4. **High-DPI rendering pass**
   - Render the game board at 2× device pixel ratio on canvas, then downscale for display to eliminate blur.
   - Profile frame rate with Chrome Performance—target ≥50fps while panning on modern phones.

**Definition of done**: All prioritized routes pass manual QA on the device matrix with screenshots archived in Notion. No interactive element falls below 44px hit area, and the board canvas stays crisp during pinch/zoom without tearing.

## 2. Service Worker & Caching
1. **Select tooling**
   - Adopt `@vite-pwa/vitepress` or vanilla Workbox plugin for Vite (Vite 7 compatible). Record the choice in `docs/frontend/pwa.md`.
2. **Cache strategy design**
   - Map bundles (`app`, `vendor`), fonts, icons, and API calls. Use precaching for static assets with revision hashes, stale-while-revalidate for API reads, and network-only for POST/PUT.
   - Add background sync for turn submissions via `workbox-background-sync` so queued moves post when connectivity returns.
3. **Implementation**
   - Create `frontend/src/service-worker.ts` with modular handlers; register via `main.tsx` with feature detection.
   - Include an offline fallback page (simple HTML screen stored in precache) to handle full disconnects.
4. **Testing**
   - Use Chrome Lighthouse PWA audit and `workbox-window` debugging to validate caches populate and purge correctly on deploy.
   - Simulate offline in devtools; confirm queued turn submissions replay once network is restored.

**Definition of done**: Lighthouse PWA score ≥90, static asset caches warm within one navigation, background sync successfully replays at least one queued turn, and deploy notes document cache invalidation steps.

### Progress (2025-10)
- Added Workbox Background Sync for turn submissions: Service worker queues POSTs to `POST /api/game/rooms/:roomId/actions` when offline and replays them once connectivity returns. File: `frontend/src/sw.ts` (queue name `rk-turn-submissions`).
- HTTP fallback endpoint implemented: `POST /api/game/rooms/:roomId/actions` accepts a `GameAction` and enqueues it on the server (`queueService.addGameAction`). Files: `backend/src/routes/game.ts`, `backend/src/controllers/gameController.ts` (`submitAction`).
- Client fallbacks:
  - End turn → HTTP + Background Sync
  - Deploy (incl. undo placement via negative armies) → HTTP + Background Sync
  - Attack → HTTP + Background Sync
  - Fortify + Undo Fortify → HTTP + Background Sync
  - Go back to reinforcement → HTTP + Background Sync
  - Trade treasures → HTTP + Background Sync
  - Conquest transfers → HTTP + Background Sync via dedicated endpoint
  All in `frontend/src/store/gameActions.ts`.

Additional endpoints and SW routes:
- `POST /api/game/rooms/:roomId/transfer-conquest` processes transfer of armies after conquest server-side and is queued offline by the SW. Files: `backend/src/routes/game.ts`, `backend/src/controllers/gameController.ts` (`transferConquest`). SW route added in `frontend/src/sw.ts`.

Verify locally:
- Start both servers, open Game Room, go offline in DevTools, click End Turn; you should see “Turn queued — will submit when online”. Return online and watch the request replay in Application → Background Sync → rk-turn-submissions.
- Confirm the backend logs show a queued job or inline processing when Redis is disabled.

## 3. Manifest, Icons, and Install UX
1. **Manifest refresh**
   - Update `frontend/public/manifest.json` with human-readable `name`/`short_name`, display `standalone`, and accurate `start_url`.
   - Populate `categories`, `description`, `screenshots`, and orientation hints for tablets.
2. **Icon set overhaul**
   - Generate a full suite (48–512px) of maskable and regular icons using Figma export + RealFaviconGenerator. Store source in `docs/assets/pwa-icons.fig`.
   - Add iOS-specific icons/splash screens via `<link rel="apple-touch-icon">` and meta tags in `frontend/index.html`.
3. **Install prompts**
   - Build a custom “Install ConquestK” banner triggered after two visits with Service Worker ready and user interacting with the site.
   - On iOS, show an instructional modal (using WebKit install instructions) since `beforeinstallprompt` is unavailable.
4. **Deep-link routing**
   - Ensure each core route renders correctly when loaded cold (no client state). Update router to hydrate from URL params for game IDs/invites.

**Definition of done**: Manifest passes PWABuilder validation, icon assets load without 404s, install prompts show on Android Chrome after heuristics are met, and iOS instructions surface via a dismissible modal.

### Progress (2025-10)
- Implemented manifest refinements: stable `id`/`scope`, `categories`, `orientation`, and `screenshots` entries for both `narrow` and `wide` form factors. File: `frontend/public/manifest.json`.
- Replaced discouraged `purpose: "any maskable"` with separate entries for `any` and `maskable`. Added generated files `icon-192-maskable.png` and `icon-512-maskable.png`.
- Added generator: `frontend/scripts/generate-pwa-assets.mjs` (uses `sharp`) to produce maskable icons and two screenshots (`/screenshots/mobile-1080x1920.png`, `/screenshots/wide-1920x1080.png`). Run with `npm run gen:pwa-assets`.
- Tweaked head tags in `frontend/index.html` to include `application-name`, `apple-mobile-web-app-title`, and `mask-icon` for Safari pinned tabs.

What Connor should verify locally:
- `npm run gen:pwa-assets` succeeds and creates the four images (2 icons, 2 screenshots) under `frontend/public`.
- `npm run build` then load `http://localhost:5001/manifest.json` and check that image URLs resolve (no 404s) and that Lighthouse/PWA install UI no longer warns about missing screenshots.
- In DevTools > Application > Manifest, confirm the two screenshots appear and richer install UI shows on desktop and mobile emulation.

Risks / notes:
- If production uses a CDN in front of `backend/public`, ensure these new paths are not cached incorrectly. Static cache headers are set in `backend/src/index.ts`—icons/screenshots fall under the one‑day cache path. Purge the CDN after deploy.
- Keep screenshots fresh when UI changes; re-run the generator (or replace with real screenshots) and redeploy.

## 4. Cross-Platform QA Plan
1. **Device lab matrix**
   - Minimum physical devices: iPhone 14, iPad Air, Pixel 8, Galaxy S23, Galaxy Tab S9. Supplement with BrowserStack for coverage.
2. **Test scenarios**
   - New user onboarding, joining a live game, submitting turns, spectating, reconnecting after backgrounding, offline attempt, installing to home screen, uninstall/reinstall.
   - Capture console logs and network traces for any failures.
3. **iOS limitations doc**
   - Document in `docs/frontend/pwa-ios-limitations.md` the current iOS Safari constraints: no push notifications (as of iOS 18), background sync limits, storage quotas.
4. **Regression cadence**
   - Schedule QA sweeps before each tagged release. Automate smoke tests with Playwright mobile emulation where reliable.

**Definition of done**: QA report stored in Notion template, new limitation doc merged, and all critical bugs triaged with owner + fix timeline.

## 5. Push Notification Considerations
- **Android Chrome / desktop**: Web push is supported today via VAPID + service worker; backend must expose a subscription endpoint and send notifications through a push service.
- **iOS Safari**: As of iOS 18, standalone PWAs installed to the home screen cannot receive push notifications. Apple only allows Web Push for Safari on macOS/iPadOS and, on iOS, only when using Safari itself (not installed PWAs).
- **Future watch**: Monitor WebKit feature status for "Push API for iOS Web Apps". Add a quarterly reminder to revisit.
- **Alternative**: If push is business-critical on iOS, wrap the PWA with Capacitor to access APNs, or plan for Expo/React Native implementation.

**Definition of done**: Engineering decision recorded on whether to pursue web push for Android now, defer iOS push until native shell, or adopt a hybrid approach. Backend ticket filed for subscription handling if proceeding.

---

_Once each checklist section reaches definition-of-done, update `docs/planning/mobile-app-strategy.md` (Option A) with status and link to this file so stakeholders can track progress._
