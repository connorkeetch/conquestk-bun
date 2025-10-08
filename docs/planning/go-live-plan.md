# Beta Go-Live Backlog & Implementation Plan
_Last updated: October 8, 2025_
Beta go-live (friends-only soft launch) target: October 15, 2025

## Purpose & Conventions
- **Scope:** This plan covers everything that must be true before inviting ~12 close friends into the live build ("beta go-live"). It intentionally excludes post-beta polish and wider marketing prep.
- **Priority legend:** `P0` = blocker for beta go-live, `P1` = should land during beta if possible, `P2` = polish/nice-to-have once core items are stable.
- **Workstream tags:** `[fe]` frontend, `[be]` backend, `[ws]` websockets/sockets, `[pwa]` PWA/service worker, `[ops]` infrastructure & alerts, `[qa]` test coverage, `[doc]` documentation/product enablement.

## Executive Summary
- ✅ Core conquest gameplay, custom maps, and private matches have been validated end-to-end with test accounts.
- 🚧 Ranked match closure and CP awards still need authoritative verification; we have not yet recorded a successful ranked completion with correct leaderboard deltas.
- ✅ Unread clearing regression in the global inbox is fixed; dropdown layout/clarity remains a P2 polish item.
- 🚧 Push delivery must either work through the PWA install flow or fall back to Discord/Slack fan-out so players receive turn/game updates.
- 📝 AI opponents, plans/strategies tooling, and non-conquest modes can remain disabled for beta, but we should document expectations for testers so they are not surprised.

> **Beta mantra:** Stable ranked flow + reliable notifications + honest UI. Everything else can be rough around the edges as long as testers understand the limitations.

## P0 — Must Land Before Inviting Friends

### P0.1 Validate ranked game completion & CP awards
- **Tags:** [be][ws][qa]
- **Status:** 🔴 Not started
- **Why it matters:** A ranked match has not yet completed with accurate CP gains/losses. Without this, competitive testing is misleading.
- **Acceptance criteria:**
  - End-to-end ranked match (2+ humans) transitions through `active → completed` with final standings stored in the database.
  - CP deltas reflect the configured formula; leaderboard/history tables update correctly.
  - Post-game summary UI displays the awarded CP and updated rank.
  - Add a quick regression checklist covering: game creation, readiness check, battle resolution, completion, CP update, leaderboard refresh.
- **Next steps:**
  1. Capture existing ranked flow logs to confirm lifecycle transitions.
  2. Instrument or surface temporary debug output for CP calculations (if missing).
  3. Run at least one manual smoke test with two real accounts; document results in `docs/planning/qa-sessions.md` (create file if needed).

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
- **Status:** 🟡 Blocked on installability verification
- **Why it matters:** Testers need turn/game alerts when away from the browser. Either the PWA must install with push, or Discord/Slack relays must be enabled.
- **Acceptance criteria (Option A — Preferred):**
  - PWA passes Chrome/Edge installability checks on desktop and mobile (manifest + service worker).
  - Push subscriptions persist in the database; gameplay events (turn start, game completion) send notifications.
  - A tester can install the PWA, receive a push, and deep-link back into the correct game.
- **Acceptance criteria (Option B — Fallback):**
  - Discord and Slack webhook integrations (see `docs/planning/slack-discord-notification-plan.md`) broadcast turn/game summaries to a private channel.
  - Documentation instructs testers how to join the channel for alerts.
- **Next steps:**
  1. Follow the `pwa-hardening-checklist.md` smoke steps; capture screenshots of install prompts.
  2. If push fails, scope the minimal Discord/Slack worker implementation and wire it before beta.
  3. Update onboarding instructions with whichever channel ships.

### P0.4 Publish tester onboarding & expectations
- **Tags:** [doc]
- **Status:** 🟡 Guide drafted (awaiting invite template update)
- **Why it matters:** A small cohort still needs context on what works, what does not, and how to give feedback.
- **Acceptance criteria:**
  - ✅ Create `docs/planning/beta-onboarding.md` outlining: scope (friends-only), known limitations (AI offline, plans disabled, messaging quirks), how to report bugs, and recommended browser/devices.
  - ✅ Include checklist for testers (install PWA or join notifications channel, play one ranked game, try messaging, optional map browse).
  - ⬜ Link doc from the invite email/DM template.
- **Next steps:**
  1. Share the onboarding guide with invitees and update the invite template to reference it.
  2. Collect tester questions during the first session and append an FAQ section if needed.
  3. Keep the doc updated as other P0 items land so expectations stay accurate.

## P1 — Should Land Early in Beta

### P1.1 Broaden game mode QA coverage
- **Tags:** [qa][ws][be][fe]
- **Status:** 🔴 Not started
- **Why it matters:** Only classic conquest without fog has been exercised; beta testers could surface crashes in other toggles.
- **Acceptance criteria:**
  - Smoke-test at least: Capitals mode, Teams, Fog of War, and one alternate win condition (if available) in private matches.
  - Document known issues or disable unsupported toggles in the UI.
  - Update `docs/planning/game-modes-plan.md` with results and any bug tickets filed.

### P1.2 AI opponent roadmap checkpoint
- **Tags:** [be][ws][qa]
- **Status:** 🟡 Plan drafted, implementation pending
- **Why it matters:** Even though AI can remain disabled, testers will ask. We should expose a status blurb and next steps.
- **Acceptance criteria:**
  - Confirm AI remains hidden/disabled in UI for beta.
  - Add a status note in beta onboarding doc summarizing the improvement plan and expected timeline.
  - Ensure ongoing AI work items are tracked in `docs/planning/ai-players-plan.md` with up-to-date milestone dates.

### P1.3 Plans/strategies feature gating
- **Tags:** [fe][be][doc]
- **Status:** 🔴 Not started
- **Why it matters:** Plans have not been tested; ensure we do not advertise broken workflows.
- **Acceptance criteria:**
  - Hide or label Plans UI as "Coming Soon" if functionality is incomplete.
  - Note in onboarding doc that plans are out-of-scope for beta.
  - Track enabling criteria in `docs/planning/typing-roadmap.md` or a new doc if more appropriate.

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
