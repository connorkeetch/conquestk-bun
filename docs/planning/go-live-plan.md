# Beta Go-Live Backlog & Implementation Plan
_Last updated: March 9, 2026_
Beta go-live (friends-only soft launch) target: October 15, 2025 (historical)

> **Audit note (March 2026):** The friends-and-family beta shipped in November 2025. Every P0 item below is complete, but the plan remains as historical context. Use it together with `docs/planning/roadmap.md` for the current priorities (notifications, telemetry dashboards, accessibility presets, and match service rollout guardrails).

## Purpose & Conventions
- **Scope:** This plan covers everything that must be true before inviting ~12 close friends into the live build ("beta go-live"). It intentionally excludes post-beta polish and wider marketing prep.
- **Priority legend:** `P0` = blocker for beta go-live, `P1` = should land during beta if possible, `P2` = polish/nice-to-have once core items are stable.
- **Workstream tags:** `[fe]` frontend, `[be]` backend, `[ws]` websockets/sockets, `[pwa]` PWA/service worker, `[ops]` infrastructure & alerts, `[qa]` test coverage, `[doc]` documentation/product enablement.

## Executive Summary
- ✅ Core conquest gameplay, custom maps, and private matches have been validated end-to-end with test accounts.
- ✅ Ranked match closure and CP awards verified during the November 2025 beta smoke tests; regression checklist documented alongside telemetry work.
- ✅ Unread clearing regression in the global inbox is fixed; dropdown layout/clarity remains a P2 polish item.
- ✅ PWA install + push delivery path validated; Discord/Slack fallback remains documented but unused.
- 📝 AI opponents (Grandmaster gated behind admin flag) and plans/strategies remain outside the beta scope and are clearly labeled in onboarding material.

> **Beta mantra:** Stable ranked flow + reliable notifications + honest UI. Everything else can be rough around the edges as long as testers understand the limitations.

## P0 — Must Land Before Inviting Friends

### P0.1 Validate ranked game completion & CP awards
- **Tags:** [be][ws][qa]
- **Status:** 🟢 Completed (Nov 2025)
- **Why it matters:** A ranked match has not yet completed with accurate CP gains/losses. Without this, competitive testing is misleading.
- **Acceptance criteria:**
  - End-to-end ranked matches transition `active → completed` with final standings stored in the database. ✅ Verified via November 2025 beta smoke tests; see the shared QA session notes (`2025-11-05-ranked-beta`).
  - CP deltas reflect the configured formula; leaderboard/history tables update correctly. ✅ Confirmed through automated `finalizeCompletedGame` logs and leaderboard comparisons.
  - Post-game summary UI displays the awarded CP and updated rank. ✅ Beta testers captured screenshots appended to the same QA log.
  - Regression checklist lives alongside the QA session notes for reruns before larger access.
- **Next steps:** Continue to add telemetry dashboards (roadmap item) so ranked regressions page operators automatically.

- **Tags:** [fe][ws][qa]
- **Status:** 🟢 Completed (Oct 8, 2025)
- **Why it matters:** Persistent unread badges will distract beta testers and hide real messages.
### P0.2 Fix global messaging dropdown unread regression
- **Tags:** [fe][ws][qa]
- **Status:** 🟢 Completed (Oct 8, 2025)
- **Why it matters:** Persistent unread badges will distract beta testers and hide real messages.
- **Acceptance criteria:**
  - Opening a conversation through the header/inbox dropdown marks messages read server-side and clears local unread counts. ✅
- **What shipped:**
  - Prevent self-authored chat notifications (defensive client check; server already targets recipients).
  - Optimistic read on open + `receipt.read` socket emission from both Inbox and in-room chat.
  - Inbox thread list relabeled to “Conversations”; unread threads render in bold for clarity.
  - Threads auto-load the latest 20 messages; “Load earlier messages” only appears when more messages exist.
  - Default `hasMore` is false until first fetch, avoiding premature “Load earlier” visibility.
- **Verification notes:**
  - Header badge clears immediately when opening a conversation; stays cleared on refresh.
  - Sender never receives a notification for their own message; recipient sees one (if enabled).

### P0.3 Ship at least one reliable notification channel
- **Tags:** [pwa][ops][be][qa]
- **Status:** 🟢 Completed (Nov 2025)
- **Why it matters:** Testers need turn/game alerts when away from the browser. Either the PWA must install with push, or Discord/Slack relays must be enabled.
- **Acceptance criteria (Option A — Preferred):**
  - PWA passes Chrome/Edge installability checks on desktop and mobile (manifest + service worker). ✅ Validated during `2025-11-07-pwa-install` QA run with screenshots stored in the same folder.
  - Push subscriptions persist in the database; gameplay events (turn start, game completion) send notifications. ✅ Confirmed via `notifications` table inspection and live push receipts.
  - Testers successfully deep-linked back into matches from push notifications. ✅ Documented in onboarding feedback doc.
- **Acceptance criteria (Option B — Fallback):**
  - Discord/Slack fallback not needed; remains documented in case of future regression.
- **Next steps:** Expand fan-out to creator/moderator workflows (roadmap “Creator/moderator notifications”).

### P0.4 Publish tester onboarding & expectations
- **Tags:** [doc]
- **Status:** 🟢 Completed (Nov 2025)
- **Why it matters:** A small cohort still needs context on what works, what does not, and how to give feedback.
- **Acceptance criteria:**
  - ✅ `docs/planning/beta-onboarding.md` is live and linked from the invite template (updated Nov 10 2025).
  - ✅ Checklist covers install, notifications, ranked smoke, messaging, and optional map browse.
  - ✅ FAQ appended after the first beta weekend to capture tester questions.
- **Next steps:** Keep onboarding updated as we expand early access beyond the original cohort.

## P1 — Should Land Early in Beta

- **Tags:** [qa][ws][be][fe]
- **Status:** 🟡 In progress (Jan 2026)
- **Why it matters:** Only classic conquest without fog has been exercised; beta testers could surface crashes in other toggles.
- **Acceptance criteria:**
  - Capitals, Teams, and Fog of War received smoke tests in January 2026; alternate win conditions pending scenario coverage. Notes captured in `docs/planning/game-modes-plan.md` (2026-01-18 update).
  - Known issues flagged directly in the lobby UI copy until fixes land.
  - Remaining action: run King of the Hill + Hidden Treasures smoke in March 2026.

- **Tags:** [be][ws][qa]
- **Status:** 🟡 Ongoing (WASM rollout complete; Commander polish pending)
- **Why it matters:** Even though AI can remain disabled, testers will ask. We should expose a status blurb and next steps.
- **Acceptance criteria:**
  - Recruit + Commander live in casual lobbies; Grandmaster available via admin flag and routes through WASM evaluator. UI surfaces status badges accordingly.
  - Beta onboarding doc now includes AI availability expectations (updated Feb 2026).
  - `docs/planning/ai-players-plan.md` refreshed March 2026 with milestone notes.

- **Tags:** [fe][be][doc]
- **Status:** 🟡 Labeled in UI (Dec 2025)
- **Why it matters:** Plans have not been tested; ensure we do not advertise broken workflows.
- **Acceptance criteria:**
  - Plans UI shows “Coming Soon” badge and is disabled for beta testers (landed Dec 2025).
  - Onboarding doc flags plans as out-of-scope (Nov 2025 edit).
  - Enabling criteria now tracked in `docs/planning/typing-roadmap.md` (Jan 2026 update).

## P2 — Nice-to-Have Polish Before Wider Launch

### P2.1 Messaging UX improvements
- **Tags:** [fe][ux]
- **Status:** 🟡 Ideas backlog
- **Opportunities:**
  - Redesign dropdown layout to better separate system/game/DM threads.
  - Add quick reply or "mark all as read" affordance.
  - Evaluate migrating to a full-page inbox view before public launch.

### P2.2 Ranked match analytics & logging
- **Tags:** [be][ops]
- **Status:** 🟢 Structured CP logging shipped (Oct 9, 2025)
- **Next focus:** Capture latency metrics for battle resolution vs. client receipt.
- **Notes:** Added backend logging that records per-player rating inputs and deltas when games complete, plus persistence success/failure logs around rating updates.

### P2.3 QA automation scaffolding
- **Tags:** [qa]
- **Opportunities:**
  - Script a Jest/Vitest smoke test that simulates ranked completion using existing fixtures.
  - Automate unread badge regression test via Playwright once UI fixes land.

## Timeline & Checkpoints
- **Oct 9–10:** Focus on P0.1 (ranked CP validation); book time with at least one friend to co-test.
- **Oct 11–12:** Resolve messaging unread bug and rerun smoke checks.
- **Oct 13:** Confirm notification path (PWA or Discord/Slack) and finalize onboarding doc.
- **Oct 14:** Run full beta rehearsal: install app, play ranked game, verify notifications, collect screenshots/logs.
- **Oct 15:** Send invites to friends-only cohort (beta go-live).

## Dependencies & References
- `docs/planning/slack-discord-notification-plan.md` — integration details for fallback notifications.
- `docs/planning/pwa-hardening-checklist.md` — installability and push validation steps.
- `docs/planning/ai-players-plan.md` — current AI roadmap; update milestone dates.
- `docs/planning/game-modes-plan.md` — reference for alternate mode expectations.

## Done / No Longer Blocking Beta
- Map authoring permissions and publishing workflow ✅
- Core conquest gameplay loop ✅
- Game-room chat (per-room) ✅
- Map creation, publishing, and approval for personal maps ✅
