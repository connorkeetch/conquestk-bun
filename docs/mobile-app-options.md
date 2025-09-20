# Mobile App Strategy Options
_Last updated: September 20, 2025_

## 1) Current Product Context
- **Frontend:** React 19 + TypeScript application built with Vite and Tailwind CSS. The existing web client is responsive, touch-friendly, and already ships as a progressive web app (PWA).
- **Shared logic:** Redux Toolkit manages state and most gameplay logic lives in shared TypeScript modules that can be reused across clients.
- **Backend:** Node/Express + Socket.io delivers real-time multiplayer, authentication, matchmaking, and map tooling, backed by PostgreSQL and Redis on Railway.
- **Team:** Solo developer (Connor Keetch) with deep familiarity in the current React/Node stack. Bringing on mobile specialists increases cost and coordination overhead.

## 2) Goals, Constraints, and Evaluation Criteria
### Goals
- Secure App Store and Google Play presence to strengthen trust and discovery.
- Maintain feature parity with the browser experience (async/real-time matches, maps, account settings).
- Deliver push notifications and turn reminders; offline play is optional but useful.
- Maximize reuse of existing TypeScript business logic.

### Constraints
- Solo developer bandwidth: delivery speed, maintainability, and cost are critical.
- Online-first gameplay: requires reliable WebSocket connectivity, reconnection, and background handling.

### Evaluation Criteria
| Dimension | Questions to Ask |
| --- | --- |
| Delivery speed | How quickly can we ship a v1 to both stores? |
| UX quality | Can we deliver native-feeling performance and gesture handling for complex boards? |
| Code reuse | How much of the current React + TypeScript stack can be reused? |
| Maintainability | What is the ongoing overhead for SDK upgrades, store guidelines, and release processes? |
| Platform capabilities | Do we get push notifications, background tasks, secure storage, and IAP without major rewrites? |
| Long-term runway | Does the approach support future features (map editor, new game modes, monetization)? |
| Compliance risk | How likely is App Store/Play Store approval or rejection? |

## 3) Option Breakdown
### Option 1 — Harden the Responsive Web App (PWA only)
**Summary:** Enhance the current responsive experience, polish service worker caching, add install prompts, and rely on browsers for installation rather than shipping binaries.

**Workstreams**
1. Audit Tailwind breakpoints and touch interactions (especially on the game board canvas).
2. Implement or harden service worker caching (Vite plugin or Workbox), covering assets and push notifications where supported.
3. Refresh `manifest.json`, icons, deep link handling, and install prompts.
4. QA across Android Chrome and iOS Safari, documenting iOS-specific limitations.

**Pros**
- Full reuse of the existing frontend; ships immediately with almost zero additional tooling.
- Minimal cost and the fastest delivery (1–2 sprints of polish).
- Web push works on desktop and Android; offline shell is achievable.

**Cons / Risks**
- No App Store or Play Store presence; discoverability and trust rely on the website.
- iOS push and background behaviour remain limited (especially post–iOS 17.4).
- No access to native monetization, Game Center, or Play Games services.

**Best for:** Validating demand quickly on a minimal budget while continuing to invest in the web client first.

### Option 2 — Capacitor Hybrid Wrapper
**Summary:** Package the current Vite build inside native shells via Capacitor, adding native plugins for push notifications, secure storage, and other device APIs.

**Workstreams**
1. Create a `mobile/` workspace with the Capacitor CLI; configure Xcode and Gradle projects and integrate into CI.
2. Automate syncing of the web build into Capacitor’s WebView; optimize hardware acceleration and socket reconnection on lifecycle events.
3. Implement native bridges for FCM/APNs push, background fetch, haptics, and optional in-app purchases.
4. Prepare store assets, privacy manifests, Data Safety forms, and release pipelines.

**Pros**
- Near-total reuse of the existing web UI and business logic.
- Provides full store presence quickly (≈4–8 weeks) while enabling native capabilities through plugins.
- Lets the web team continue iterating without splitting the codebase.

**Cons / Risks**
- WebView performance can suffer on heavy canvas scenes; may require optimization.
- Apple may reject an app that feels like “just a website” unless native polish (navigation, splash, haptics) is added.
- Requires maintaining native project files and dealing with platform SDK updates.

**Best for:** Achieving store distribution rapidly without a full rewrite, while investing in enough native touches to satisfy app review.

### Option 3 — React Native + Expo
**Summary:** Build a dedicated React Native client that reuses shared TypeScript models/services while rewriting UI with native components and Expo tooling.

**Workstreams**
1. Scaffold an Expo-managed app; configure monorepo tooling (Metro resolver, TS path aliases) to consume the existing `shared/` packages.
2. Port authentication, lobby, gameplay, and spectator flows, reusing Redux slices/selectors where possible.
3. Implement the game board with `react-native-skia` or SVG plus gesture handlers for pan/zoom.
4. Integrate Socket.io via `socket.io-client` with WebSocket polyfills, background reconnection, and Expo Notifications.
5. Establish OTA updates (EAS Update), store submissions, and automated QA.

**Pros**
- High reuse of business logic; stays in the JavaScript/TypeScript ecosystem.
- Delivers native-feeling UX, gestures, and access to device APIs.
- Expo simplifies builds, updates, and push notification workflows.

**Cons / Risks**
- UI must be rebuilt screen by screen; expect a 3–4 month effort for parity as a solo dev.
- Web-specific libraries (DOM canvas, HTML) require native equivalents or redesigns.
- Maintaining web and native code paths in parallel increases ongoing workload until convergence.

**Best for:** A strategic native presence once metrics justify a multi-month investment while remaining within the React ecosystem.

### Option 4 — Flutter or Fully Native (Kotlin/Swift)
**Summary:** Rebuild mobile clients in Flutter or platform-native languages, integrating with the existing backend via REST/Socket.io-compatible libraries.

**Workstreams**
1. Bootstrap Flutter or separate Kotlin/Swift projects; define state management mirroring current gameplay flows.
2. Reimplement UI screens and map rendering (Flutter `CustomPainter`/Flame, or SwiftUI + Compose custom views).
3. Integrate networking, push notifications, background execution, and analytics per platform.
4. Establish CI/CD (Codemagic, fastlane) and dedicated QA.

**Pros**
- Highest performance and platform fidelity; richest access to OS capabilities.
- Rendering engines well-suited for complex boards and animations.
- Enables mobile-first UX decisions without legacy constraints.

**Cons / Risks**
- Minimal code reuse; new language/tooling adds significant cognitive load.
- Longest timeline (6–12 months) to hit feature parity as a solo developer.
- Parallel maintenance tracks for web and mobile increase risk of drift.

**Best for:** A future phase when the team expands and a mobile-first strategy with top-tier native UX becomes essential.

## 4) Comparative Summary
| Option | Delivery Speed | UX Quality | Code Reuse | Maintenance Load | Store Presence | Review Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **PWA polish** | ⭐⭐⭐⭐⭐ (now) | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | n/a |
| **Capacitor hybrid** | ⭐⭐⭐⭐ (4–8 wks) | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ✅ | High if app stays webby |
| **React Native + Expo** | ⭐⭐ (3–4 mos) | ⭐⭐⭐⭐ | ⭐⭐⭐ (logic) | ⭐⭐ | ✅ | Moderate |
| **Flutter / Native** | ⭐ (6–12 mos) | ⭐⭐⭐⭐⭐ | ⭐ (logic) | ⭐ | ✅ | Low |

> **Rule of thumb:** Start where reuse is highest and risk is lowest; deepen investment when live metrics prove the need.

## 5) Recommended Path
1. **Phase 1 — PWA Hardening (Weeks 0–2):** Ship responsiveness and interaction polish, robust service worker, and install prompts. Collect mobile web analytics to understand behaviour and friction.
2. **Phase 2 — Capacitor Store Launch (Weeks 2–8):** Wrap the web app, implement native touches (push, splash, haptics), and prepare review notes that highlight realtime gameplay and native integrations.
3. **Phase 3 — React Native / Expo Exploration (Start ~Month 3+ if metrics warrant):** Prototype RN board rendering, socket performance, and navigation. If the uplift justifies it, build the RN client sharing `shared/` logic and target a beta within 3–4 months.
4. **Escalate to Flutter/Native only** if React Native hits hard limits (board performance, background policies) **and** budget/staffing increase to support parallel native development.

## 6) Next Steps Checklist
- Align on launch targets, KPI thresholds (MAU, D1/D7 retention, push CTR), and must-have features (push, offline shell, monetization scope).
- Budget QA devices (at least one iPhone, one iPad, and two popular Android models) plus crash reporting and analytics.
- Extract and confirm the `shared/` TypeScript models/services to ease reuse across mobile efforts.
- For React Native exploration: prototype socket connectivity and board rendering with gesture handling before committing.
- For Capacitor: audit PWA readiness, ensure WebView compatibility, and craft native navigation wrappers and push flows.
- Document customer support workflows for mobile (version rollouts, update prompts, crash triage) regardless of the chosen path.

This approach keeps immediate wins lightweight, unlocks store distribution quickly, and leaves a clear runway toward a richer native client once data and resources support the investment.
