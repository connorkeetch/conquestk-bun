# 🧭 ConquestK Roadmap

_Last updated: September 21, 2025_

## How to use this document
- **Purpose:** capture the active product strategy so we are not maintaining scattered TODO files.
- **Scope:** highlights the initiatives that are underway or committed for the next milestones. Anything speculative lives under "Future Opportunities" so we can trim the backlog without losing context.
- **Updates:** refresh this file whenever we finish a milestone, change ownership, or reprioritise major workstreams.

## ✅ Recent milestones
Progress over the summer 2025 cycle that is now in production:
- **Authoritative battle archival & rankings:** the battle worker now calls `applyBattleResult` end-to-end, persisting to `game_results`/`player_game_results`, updating ELO, and exposing battle metrics for alerting.
- **Lifecycle state machine & ready-check:** lobby → initializing → active → completed transitions are enforced server-side, with ready-check broadcasts and automatic game archival on completion.
- **Real-time delta streaming:** the frontend consumes live deltas over the canonical `game:<roomId>` channel, replacing fixture data and keeping the Redux store authoritative.
- **Capitals & continent parity:** backend continent bonuses, capital assignments, and team logic now drive both reinforcement math and UI messaging for custom and classic maps.
- **Web push notification foundation:** durable subscription storage, turn/game notifications, and service worker handling landed; approvals/DM fan-out remain on the backlog.
- **Navigation & audio truthfulness:** tournament stubs were removed, and turn notification sound aliases keep legacy keys functioning without regressions.

## 🔄 In progress (Fall 2025 focus)
| Stream | Owner | Key deliverables |
| --- | --- | --- |
| **Map authoring security** | Connor | Lock down continent/territory/adjacency routes so only creators/collaborators mutate drafts; audit approval endpoints for proper authZ. |
| **Play hub truthfulness** | Connor | Gate or reroute Quick Match/Ranked/AI cards until real flows exist, and surface links to the working lobby experience. |
| **Chat source of truth** | Connor | Replace `localStorage` chat identity with authenticated Redux state and broadcast edit/delete events to every participant. |
| **Player stats surfaces** | Connor | Wire profile + header metrics to the new `player_stats`, game history, and leaderboard data instead of placeholder values. |
| **Worker safety hardening** | Connor | Finish Bull queue enablement by wiring modifier cleanup, dead-letter monitoring, and idempotent job handling before toggling queues on. |

## 🎯 Next-up backlog (ready for sprint planning)
- **Approval notifications:** extend the push/websocket system so creators/moderators get map workflow updates once authZ is enforced.
- **Map asset lifecycle:** ship the background purge for soft-deleted thumbnails/uploads and expose admin recovery tooling.
- **Audio polish:** prune duplicate legacy files, lazy-load infrequent SFX, and add accessibility cues for key moments.
- **Analytics & telemetry:** implement the funnel/latency dashboards outlined in the go-live plan to monitor play completion and approval throughput.
- **Documentation pass:** finish the public API reference outline and contributing guide once the above systems stabilize.

## 🔭 Future opportunities (longer-term)
- **Advanced game modes:** Assassin, Zombie Apocalypse, King of the Hill, Sudden Death, Battle Royale.
- **AI opponents:** staged rollout from basic random AI to personality-driven strategies with difficulty settings.
- **Tournament framework:** brackets, swiss/elim formats, rewards, and spectator overlays.
- **Theme experiments:** additional visual styles, accessibility presets, and a potential community theme creator.

## 🧹 Maintenance watchlist
- **Codebase cleanup:** track duplicate audio directories, outdated deployment scripts, and backup artefacts in [Codebase Cleanup Plan](./codebase-cleanup.md).
- **Queue & cache monitoring:** Bull workers + Redis metrics must land before scaling traffic; revisit once worker safety tasks above finish.
- **Automated coverage:** expand integration coverage for game actions, map editor auth, and socket join/broadcast flows prior to public launch.

---
For the detailed launch-blocker backlog, see [Go-Live Consolidated Backlog & Implementation Plan](./go-live-plan.md). Keep both documents in sync when priorities or statuses change.

---
Need to add or change priorities? Start by updating the table above, then archive completed items into "Recent milestones" so the active backlog stays concise.
