# 🧭 ConquestK Roadmap

_Last updated: February 15, 2025_

## How to use this document
- **Purpose:** capture the active product strategy so we are not maintaining scattered TODO files.
- **Scope:** highlights the initiatives that are underway or committed for the next milestones. Anything speculative lives under "Future Opportunities" so we can trim the backlog without losing context.
- **Updates:** refresh this file whenever we finish a milestone, change ownership, or reprioritise major workstreams.

## ✅ Recent milestones
These initiatives shipped during the January 2025 cycle and no longer require tracking:
- **VIP & Premium foundation:** database migrations, admin tooling, and UI badges for premium states.
- **Theme system overhaul:** consolidated theme definitions with zero-flash loading, darker palettes, and updated documentation.
- **Map pipeline improvements:** staging → draft → review workflow, quota enforcement, and capital assignment tooling.
- **Auth improvements:** email verification, account management UX, and preference syncing.
- **Continent bonuses:** reinforcement logic on both the backend game engine and frontend helpers now awards continent armies.

## 🔄 In progress (Q1 2025 focus)
| Stream | Owner | Key deliverables |
| --- | --- | --- |
| **VIP gameplay gating** | Connor | Map browser badges, join-time checks, socket/API enforcement, unlock messaging. |
| **Premium tier perks** | Connor | Tier-specific quotas, premium lobby options, extended analytics panels. |
| **Design system phase 2** | Connor | Migrate legacy pages to the shared Tailwind component tokens, finish navigation/footer pass, document reusable patterns. |
| **Bull worker activation** | Connor | Enable the existing Bull queue workers (Battle, GameAction, Cleanup), add monitoring, wire into deployment pipeline. |

## 🎯 Next-up backlog (ready for sprint planning)
- **Audio polish:** replace placeholder SFX, lazy-load infrequent clips, add accessibility cues.
- **Card trading phase:** complete infantry/cavalry/artillery set bonuses with wild cards and UI affordances.
- **Statistics dashboard:** player overview page with win/loss ratios, map performance, and session history.
- **Friends & lobby social features:** friend list, invites, and lobby chat groundwork.
- **Documentation pass:** finish API reference outline and public contributing guide.

## 🔭 Future opportunities (longer-term)
- **Advanced game modes:** Assassin, Zombie Apocalypse, King of the Hill, Sudden Death, Battle Royale.
- **AI opponents:** staged rollout from basic random AI to personality-driven strategies with difficulty settings.
- **Tournament framework:** brackets, swiss/elim formats, rewards, and spectator overlays.
- **Theme experiments:** additional visual styles, accessibility presets, and a potential community theme creator.

## 🧹 Maintenance watchlist
- **Codebase cleanup:** see [Codebase Cleanup Plan](./CODEBASE-CLEANUP.md) for specific file and script follow-ups.
- **Performance roadmap:** Bull workers + Redis tuning remain prerequisites before scaling traffic; review after worker activation.
- **Testing:** expand automated coverage for game actions and map editor flows prior to public launch.

---
Need to add or change priorities? Start by updating the table above, then archive completed items into "Recent milestones" so the active backlog stays concise.
