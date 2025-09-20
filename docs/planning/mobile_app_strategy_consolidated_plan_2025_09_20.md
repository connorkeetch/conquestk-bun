# Mobile App Strategy — **Consolidated Plan**
_Last updated: 2025‑09‑20_

## 1) Current Product Context
- **Frontend:** React 19 / TypeScript app built with Vite and Tailwind; responsive PWA with full touch support.
- **State/Logic:** Redux Toolkit; shared TypeScript game logic intended for reuse across clients.
- **Backend:** Node/Express + Socket.io for realtime multiplayer, auth, matchmaking, and map tooling; PostgreSQL + Redis on Railway.
- **Team:** Solo developer (Connor Keetch) focused on React/Node; contracting specialized mobile help would add cost.

## 2) Goals & Constraints
**Goals**
- **App Store presence** (Apple App Store + Google Play) to improve trust and discovery.
- **Feature parity** with the browser for real‑time matches, map browsing, auth/account.
- **Push + background reminders** for turns; optional offline shell.
- **Maximize reuse** of existing TypeScript business logic.

**Constraints**
- **Solo dev** → delivery speed, maintenance, and cost matter as much as UX.
- **Online‑first gameplay** → WebSocket reliability and resume/reconnect are critical.

## 3) Evaluation Criteria (How we’ll judge options)
- **Delivery speed / time‑to‑launch** (to TestFlight & Play Store)
- **UX quality & performance** (gestures, canvas/board rendering, perceived native polish)
- **Code reuse & maintainability** (UI + business logic reuse; upgrade burden)
- **Access to device APIs** (push, background refresh, in‑app purchases, secure storage)
- **Distribution & compliance** (review risk, privacy manifests, data safety forms)
- **Long‑term runway** (scales with map editor, modes, monetization)
- **Cost** (tooling, CI/CD, devices, developer time)

## 4) Options (Consolidated)

### A) **Harden the PWA (Web‑only)**
**What it is:** Double‑down on the responsive web client; promote install on Android and iOS (Add to Home Screen).

**Workstreams**
1. Tailwind/mobile breakpoints & game board interaction polish.
2. Service worker with Workbox/Vite plugin for asset caching + background sync (where supported).
3. Manifest, icons, install prompts; deep‑link handling.
4. QA on Android Chrome + iOS Safari (noting iOS PWA limitations since iOS 17.4).

**Pros**
- Fastest path; single codebase & pipeline; ships now.
- Zero store overhead; easy iteration.

**Cons / Risks**
- No native store listing; reduced discoverability/trust.
- iOS PWA push/offline limitations; background WebSocket constraints.
- No native IAP/Game Center/Play Games.

**When to choose:** Budget near zero; store presence not required; strong web acquisition already.

---

### B) **Capacitor Hybrid (Wrap the Web App)**
**What it is:** Package the existing Vite build inside native shells; add native plugins for push, secure storage, IAP.

**Workstreams**
1. Create `mobile/` with Capacitor CLI; configure Xcode/Gradle projects; CI sync of web build.
2. Push notifications via FCM/APNs; background fetch for turn refresh; native navigation shell.
3. Store assets & compliance (privacy manifest, Data Safety, review notes); icons/splash/haptics.
4. Tune WebView performance (hardware acceleration, draw‑call reduction, socket reconnect on lifecycle).

**Pros**
- **Near‑total code reuse** of current React app.
- Full store presence + native capabilities via plugins.
- Realistic MVP in **~4–8 weeks** with focused polish.

**Cons / Risks**
- WebView performance on heavy canvas; lifecycle complexity (backgrounding suspends WebView).
- Apple may reject apps that feel like “just a website” → needs authentic native touches.
- Maintain native project files alongside web app.

**When to choose:** Need store presence in <2 months while staying in the web codebase.

---

### C) **React Native + Expo (New Mobile Client, Shared Logic)**
**What it is:** Dedicated RN client using Expo; reuse shared TS models/services/reducers; rebuild UI with RN primitives.

**Workstreams**
1. Expo app + monorepo wiring (Metro + TS path aliases) to share `shared/` logic.
2. Port auth/lobby/gameplay; board rendering via **react‑native‑skia**/**SVG**; gesture handling.
3. Socket.io client + reconnection; push via Expo Notifications or native modules; deep links; OTA updates via EAS.
4. Device QA and performance profiling.

**Pros**
- Native‑feeling interactions & performance; full access to device APIs.
- High reuse of **business logic** while staying in JS/TS.
- Streamlined CI/CD with Expo EAS; OTA updates.

**Cons / Risks**
- Rebuild all screens; web‑specific libs (DOM canvas) replaced.
- **3–4 months** for solid parity as a solo dev.
- Dual code paths until convergence.

**When to choose:** Strategic native presence with better UX and you can invest a multi‑month build.

---

### D) **Flutter or Fully Native (Kotlin/Swift)**
**What it is:** Re‑implement mobile clients in Flutter or per‑platform natives; integrate with existing backend.

**Pros**
- Top‑tier performance and platform fidelity; deepest OS integrations.
- Strong rendering options for complex boards/animations.

**Cons / Risks**
- Minimal UI/code reuse; new language/tooling; highest cost.
- **6–12 months** to parity for a solo dev; parallel maintenance tracks.

**When to choose:** Only with bigger budget/team and mobile‑first roadmap.

---

## 5) Comparative Summary
| Option | Delivery Speed | UX Quality | Code Reuse | Maintenance Load | Store Presence | Review Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **PWA** | ⭐⭐⭐⭐⭐ (now) | ⭐⭐ | ⭐⭐⭐⭐ UI logic / ⭐⭐⭐⭐⭐ business | ⭐⭐⭐⭐⭐ | ❌ | n/a |
| **Capacitor** | ⭐⭐⭐⭐ (4–8 wks) | ⭐⭐⭐ | ⭐⭐⭐⭐ UI / ⭐⭐⭐⭐⭐ business | ⭐⭐ | ✅ | **High (Apple)** if feels purely web |
| **React Native + Expo** | ⭐⭐ (3–4 mos) | ⭐⭐⭐⭐ | ⭐⭐⭐ business / ⭐⭐ UI | ⭐⭐ | ✅ | Moderate |
| **Flutter/Native** | ⭐ (6–12 mos) | ⭐⭐⭐⭐⭐ | ⭐ business / ⭐ UI | ⭐ | ✅ | Low |

> **Rule of thumb:** Start where reuse is highest and risk is lowest; move deeper only when data justifies it.

## 6) Phased Recommendation (Cohesive Plan)
1. **Phase 1 — PWA Hardening (Weeks 0–2)**
   - Ship responsiveness & interaction polish; robust service worker; install prompts; analytics for mobile sessions, retention, and conversion.
   - Outcome: Better mobile web KPIs; baseline for store‑ready wrapper.

2. **Phase 2 — Capacitor Store Launch (Weeks 2–8)**
   - Create native shells, push notifications (turn reminders), minimal native navigation (tabs/drawer), splash/haptics.
   - Prepare review assets & notes emphasizing realtime gameplay and native integrations.
   - Outcome: App Store + Play Store listings; learn release cadence; validate uplift from store presence & notifications.

3. **Phase 3 — React Native/Expo Exploration (Start ~Month 3+ if metrics warrant)**
   - Spike: RN board rendering (Skia), socket perf, and navigation to prove UX lift.
   - If uplift justifies: build RN client sharing `shared/` logic; target beta in 3–4 months.
   - Outcome: Higher‑quality native UX while retaining TS logic; path to mobile‑first features.

> Revisit **Flutter/Native** only if RN hits hard limits (board perf, background policies) **and** revenue/staffing expand.

## 7) Decision Triggers (Move to next phase when…)
- **From Phase 1 → 2:** ≥30% mobile web sessions, clear friction on iOS (notifications/background), or evidence that store presence will improve conversion.
- **From Phase 2 → 3:** Store apps achieve MAU ≥ target (define), push CTR ≥ target, and reviews/analytics point to UX limits of WebView (gesture jank, reconnect pain).

## 8) Risks & Mitigations
- **Apple review rejection (Capacitor):** Add native‑feeling navigation, haptics, share sheet, and push; include detailed review notes; avoid “just a website”.
- **WebView socket lifecycle issues:** Implement exponential backoff + foreground resume; persist session in secure storage; background fetch to refresh turns.
- **RN rewrite scope creep:** Share logic first; prioritize top 3 flows; defer map editor until v2; use OTA for hotfixes.
- **CI/CD complexity:** Automate E2E: web → Capacitor sync; EAS for RN; fastlane for store assets.

## 9) Concrete Next Steps (Checklist)
**General**
- Define targets: desired launch date, KPI thresholds (MAU, retention D1/D7, push CTR), must‑have features (push, offline shell, monetization scope).
- Budget QA devices (1× iPhone, 1× iPad, 2× popular Androids); set up crash reporting and analytics funnels.

**If doing React Native later**
- Extract/confirm `shared/` TypeScript models/services/selectors.
- Prototype: socket connectivity + board rendering (Skia) + gestures.
- Choose Expo‑managed vs. bare based on required native modules.

**If doing Capacitor now**
- Audit PWA (manifest + service worker) for WebView compatibility.
- Implement native shell (tabs/drawer), push flow (APNs/FCM), and app lifecycle reconnect.
- Prepare compliance assets: privacy manifest, data safety forms, icons/screenshots, review notes.

**Always**
- Plan support workflows: version rollouts, update prompts, crash + feedback channels; add automated E2E tests for top gameplay flows.

—

**Summary:** Ship PWA polish immediately, launch Capacitor apps for store presence and push within ~2 months, and invest in a React Native client **only if** store data shows strong mobile adoption and UX limits worth solving. Flutter/native become viable with a larger team and a mobile‑first revenue story.

