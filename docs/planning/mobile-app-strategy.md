# Mobile App Strategy
_Last updated: October 21, 2025_

## 1. Current Product Context
- **Frontend:** React 19 + TypeScript application built with Vite and Tailwind CSS. The responsive web client already ships as a progressive web app (PWA) with touch-friendly controls.
- **Shared logic:** Gameplay state is driven by Redux Toolkit and TypeScript modules in `shared/`, positioning logic for reuse across clients.
- **Backend:** Node/Express with Socket.io powers real-time multiplayer, authentication, matchmaking, and map tooling on top of PostgreSQL and Redis (Railway-hosted environments).
- **Team:** Solo developer (Connor Keetch) focused on the existing React/Node stack; outside mobile specialists add both cost and coordination overhead.

## 2. Objectives and Constraints
### Goals
- Ship presence on both the Apple App Store and Google Play to boost trust and discovery.
- Maintain feature parity with the browser client (real-time/async matches, map browsing, account settings).
- Deliver push notifications and turn reminders; an offline shell is a nice-to-have.
- Maximize reuse of existing TypeScript logic to keep maintenance manageable.

### Constraints
- Limited solo developer bandwidth makes delivery speed, maintainability, and direct costs critical.
- Online-first gameplay requires reliable WebSocket connectivity, reconnection, and background handling on mobile.

## 3. Evaluation Criteria
- **Delivery speed / time-to-launch** (how quickly a v1 reaches TestFlight and the Play Store).
- **UX quality & performance** (gesture handling, complex board rendering, native polish).
- **Code reuse & maintainability** (UI + business logic reuse; upgrade overhead).
- **Access to device capabilities** (push, background refresh, in-app purchases, secure storage).
- **Distribution & compliance** (review risk, privacy manifests, data safety reporting).
- **Long-term runway** (ability to support future features like map editing and monetization).
- **Cost** (tooling, CI/CD, QA devices, and developer time).

## 4. Option Analysis
### Option A — Harden the Responsive PWA (Web-only)
**Summary:** Double down on the existing responsive client; encourage Add to Home Screen installs rather than shipping binaries.

**Core workstreams** _(see [PWA Hardening Checklist](./pwa-hardening-checklist.md) for step-by-step tasks and definitions of done)_
1. Audit Tailwind breakpoints and touch interactions (especially the game board canvas) for high-DPI devices.
2. Implement or harden service worker caching via Vite/Workbox, covering assets and limited background sync.
3. Refresh `manifest.json`, icons, deep-link handling, and install prompts.
4. Run QA across Android Chrome and iOS Safari, documenting iOS-specific limitations (push/background behaviour remains constrained in iOS 18).

**Pros**
- Full reuse of the existing frontend; can ship improvements immediately.
- Minimal incremental cost and the fastest path to better mobile UX (≈1–2 sprints of polish).
- Web push works on desktop and Android; offline shell is achievable.

**Cons / Risks**
- No native store presence, so discoverability and trust rely on the website and word of mouth.
- iOS push, offline behaviour, and WebSocket persistence remain limited and subject to policy shifts.
- No access to native monetization, Game Center, or Play Games services.

**Best for:** Validating mobile demand quickly when budgets are minimal and the web remains the primary platform.

---

### Option B — Capacitor Hybrid Wrapper
**Summary:** Package the current Vite build inside native shells using Capacitor, adding plugins for push notifications, secure storage, and native flourishes.

**Core workstreams**
1. Create a `mobile/` workspace with the Capacitor CLI; configure Xcode and Gradle projects and wire them into CI.
2. Automate syncing of the production web build into Capacitor’s WebView; tune hardware acceleration and socket reconnection on lifecycle events.
3. Implement native bridges for FCM/APNs push, background fetch, haptics, secure storage, and optional in-app purchases.
4. Prepare store assets, privacy manifests, Data Safety forms, and release pipelines (fastlane/EAS or equivalent).

**Pros**
- Near-total reuse of the existing web UI and TypeScript business logic.
- Provides full store presence quickly (≈4–8 weeks) while enabling native capabilities through plugins.
- Lets the web stack remain the single source of truth for most gameplay changes.

**Cons / Risks**
- WebView performance can struggle on complex canvas scenes; may require optimization.
- Apple reviewers may reject an app that feels like “just a website” unless native navigation, splash screens, and haptics are added.
- Requires maintaining native project files and keeping pace with platform SDK updates.

**Best for:** Achieving store distribution rapidly without a full rewrite, while layering in enough native polish to satisfy review.

---

### Option C — React Native + Expo
**Summary:** Build a dedicated React Native client that reuses shared TypeScript models/services while rebuilding UI using native components with Expo tooling.

**Core workstreams**
1. Scaffold an Expo-managed app; configure monorepo tooling (Metro resolver, TS path aliases) to consume the existing `shared/` packages.
2. Port authentication, lobby, gameplay, and spectator flows, reusing Redux slices/selectors where possible.
3. Implement the game board with `react-native-skia` or SVG plus gesture handlers for pan/zoom.
4. Integrate Socket.io via `socket.io-client` with WebSocket polyfills, background reconnection, and Expo Notifications.
5. Establish OTA updates (EAS Update), store submissions, automated QA, and crash reporting.

**Pros**
- High reuse of business logic while staying in the JavaScript/TypeScript ecosystem.
- Delivers native-feeling UX, gestures, and access to device APIs.
- Expo streamlines builds, OTA updates, and push notification workflows.

**Cons / Risks**
- UI must be rebuilt screen by screen; expect ≈3–4 months for feature parity as a solo developer.
- Web-specific libraries (DOM canvas, HTML) need native equivalents or redesigns.
- Maintaining parallel web and native code paths increases ongoing workload until convergence.

**Best for:** A strategic native presence once store metrics justify a multi-month investment and richer mobile UX.

---

### Option D — Flutter or Fully Native (Kotlin/Swift)
**Summary:** Rebuild mobile clients in Flutter or platform-native languages, integrating with the existing backend via REST and Socket.io-compatible libraries.

**Core workstreams**
1. Bootstrap Flutter or separate Kotlin/Swift projects; define state management mirroring current gameplay flows.
2. Reimplement UI screens and map rendering (Flutter `CustomPainter`/Flame, or SwiftUI + Jetpack Compose custom views).
3. Integrate networking, push notifications, background execution, analytics, and platform services per OS.
4. Establish CI/CD (Codemagic, fastlane) and dedicated QA pipelines.

**Pros**
- Highest performance and platform fidelity with deep access to OS capabilities.
- Rendering engines suited for complex boards and animations.
- Enables mobile-first UX decisions unconstrained by web legacy.

**Cons / Risks**
- Minimal code reuse; new language/tooling adds significant cognitive load.
- Longest timeline (≈6–12 months) to reach feature parity as a solo developer.
- Parallel maintenance tracks for web and native increase the risk of drift.

**Best for:** A future phase when the team expands and a mobile-first strategy with top-tier native UX is essential.

## 5. Comparative Summary
| Option | Delivery Speed | UX Quality | Code Reuse | Maintenance Load | Store Presence | Review Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **PWA polish** | ⭐⭐⭐⭐⭐ (available now) | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | n/a |
| **Capacitor hybrid** | ⭐⭐⭐⭐ (4–8 wks) | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ✅ | High if app feels purely web |
| **React Native + Expo** | ⭐⭐ (3–4 mos) | ⭐⭐⭐⭐ | ⭐⭐⭐ (logic) | ⭐⭐ | ✅ | Moderate |
| **Flutter / Native** | ⭐ (6–12 mos) | ⭐⭐⭐⭐⭐ | ⭐ (logic) | ⭐ | ✅ | Low |

> **Rule of thumb:** Start where reuse is highest and risk is lowest; deepen investment when live metrics justify the additional build.

## 6. Recommended Phased Approach
1. **Phase 1 — PWA Hardening (Weeks 0–2)**
   Ship responsiveness and interaction polish, a robust service worker, and install prompts. Instrument mobile web analytics to understand behaviour and friction.
2. **Phase 2 — Capacitor Store Launch (Weeks 2–8)**
   Wrap the web app, add native touches (push, splash, haptics, secure storage), and prepare review notes that highlight real-time gameplay and native integrations.
3. **Phase 3 — React Native / Expo Exploration (Month 3+ if metrics warrant)**
   Prototype React Native board rendering, socket performance, and navigation. If the uplift justifies it, build the RN client sharing `shared/` logic and target a beta within 3–4 months.
4. **Escalate to Flutter/Native only** if React Native hits hard limits (board performance, background policies) **and** budget/staffing expand to support parallel native development.

## 7. Decision Triggers
- **Move from Phase 1 → 2** when ≥30% of sessions originate from mobile web, there is clear friction from lacking native notifications/background behaviour, or there is evidence store presence will materially improve conversion.
- **Move from Phase 2 → 3** when store apps achieve the target MAU, push notification CTR meets goals, and reviews/analytics show UX limits tied to the WebView (gesture jank, reconnect pain).

## 8. Key Risks and Mitigations
- **Apple review rejection (Capacitor):** Add native-feeling navigation, haptics, share sheets, and push; supply thorough review notes; ensure the binary offers more than a wrapped website.
- **WebView socket lifecycle issues:** Implement exponential backoff, foreground resume hooks, and secure storage for session persistence; leverage background fetch where available for turn refresh.
- **React Native rewrite scope creep:** Prioritize the top three gameplay flows, reuse shared logic first, defer the map editor to a later milestone, and lean on OTA updates for hotfixes.
- **CI/CD complexity:** Automate pipelines end-to-end: web build → Capacitor sync; Expo Application Services for React Native; fastlane or similar for store metadata and screenshots.

## 9. Next Steps Checklist
**General**
- Align on launch targets, KPI thresholds (MAU, D1/D7 retention, push CTR), and must-have features (push, offline shell, monetization scope).
- Budget QA devices (at least one iPhone, one iPad, and two popular Android models) plus crash reporting and analytics tooling.

**If pursuing React Native later**
- Extract and confirm the `shared/` TypeScript models/services/selectors for reuse.
- Prototype socket connectivity and board rendering with gesture handling before committing to a full build.
- Decide between Expo managed and bare workflows based on required native modules.

**If pursuing Capacitor now**
- Audit PWA readiness (manifest, service worker, responsive layout) for WebView compatibility.
- Implement native shell navigation, push notification flows (APNs/FCM), and lifecycle-aware reconnect logic.
- Prepare compliance assets: privacy manifest, Data Safety forms, icons/screenshots, and reviewer notes.

**Always**
- Document customer support workflows for mobile (version rollouts, update prompts, crash triage) regardless of the chosen path.
- Maintain automated end-to-end coverage for the critical gameplay flows to catch regressions across platforms.

This consolidated strategy keeps immediate wins lightweight, unlocks store distribution quickly, and leaves a clear runway toward a richer native client once data and resources support the investment.
