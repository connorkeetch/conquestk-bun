# 🧭 ConquestK Roadmap

_Last updated: March 9, 2026_

## How to use this document
- **Purpose:** capture the active product strategy so we are not maintaining scattered TODO files.
- **Scope:** highlights the initiatives that are underway or committed for the next milestones. Anything speculative lives under "Future Opportunities" so we can trim the backlog without losing context.
- **Updates:** refresh this file whenever we finish a milestone, change ownership, or reprioritise major workstreams.

## ✅ Recent milestones
Highlights from the Winter 2026 cycle that are live in production:
- **Match Service observability:** `/api/matchsvc/status` aggregates health, Redis, subscriber state, and Prometheus metrics so the Admin Dashboard can display queue depth, matches formed, and live presence without leaving the app.
- **Admin dashboard uplift:** BullMQ stats, match service health, and odds verification now surface in one view with refresh actions and CTA links to queue tools.
- **AI evaluator hardening:** Grandmaster difficulty exclusively uses the Rust/WASM evaluator with persistent handles and typed-array bulk odds while Recruit/Commander stick with the fast TypeScript heuristics for throughput.
- **Exact optional typing rollout:** shared clients (including `@conquestk/match-client`) now satisfy `exactOptionalPropertyTypes`, keeping the repo type-clean with stricter TS compiler settings.

## 🔄 In progress (Spring 2026 focus)
| Stream | Owner | Key deliverables |
| --- | --- | --- |
| **Creator/moderator notifications** | Connor | Finish socket + push fan-out for map approvals/DMs and document the operational runbook. |
| **Telemetry dashboards** | Connor | Ship the Prometheus/Grafana deck that covers queue depth, matchsvc, AI divergence, and battle latency. |
| **Accessibility presets** | Connor | Finalize the colorblind theme presets, document them, and wire the toggle into settings before early access. |
| **Match Service rollout guardrails** | Connor | Harden alerting, subscriber health detection, and the emergency disable path before exposing matchmaking in production. |

## 🎯 Next-up backlog (ready for sprint planning)
- **Map asset lifecycle:** finish the R2 purge flow, add recovery tooling, and expose run metrics so failures page operators.
- **Audio polish:** prune duplicate legacy files, lazy-load infrequent SFX, and add accessibility cues for key gameplay beats.
- **Public API reference:** publish the REST + socket docs draft once matchsvc and notification contracts settle.
- **Clan progression follow-through:** expose the `clan:progress` socket contract to lightweight clients and surface contribution deltas in the clan activity feed with live XP multipliers.
- **Queue automation smoke tests:** add Jest/Playwright coverage that exercises matchsvc queue/dequeue and verifies admin dashboard signals.

## 🔭 Future opportunities (longer-term)
- **Advanced game modes:** Zombie Apocalypse, Sudden Death, Battle Royale, Fog of War enhancements.
- **AI opponents:** staged rollout from basic random AI to personality-driven strategies with difficulty settings.
- **Tournament framework:** brackets, swiss/elim formats, rewards, and spectator overlays.
- **Theme experiments:** additional visual styles, accessibility presets, and a potential community theme creator.

## 🧹 Maintenance watchlist
- **Codebase cleanup:** track duplicate audio directories, outdated deployment scripts, and backup artefacts in [Codebase Cleanup Plan](./codebase-cleanup.md).
- **Queue & cache monitoring:** BullMQ workers + Redis metrics must land before scaling traffic; revisit once worker safety tasks above finish.
- **Automated coverage:** expand integration coverage for game actions, map editor auth, and socket join/broadcast flows prior to public launch.

---
For the detailed launch-blocker backlog, see [Go-Live Consolidated Backlog & Implementation Plan](./go-live-plan.md). Keep both documents in sync when priorities or statuses change.

---
Need to add or change priorities? Start by updating the table above, then archive completed items into "Recent milestones" so the active backlog stays concise.
