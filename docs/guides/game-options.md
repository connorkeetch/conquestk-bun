# Create Game & Options Guide

Last updated: 30 September 2025

This guide explains every option on the Create Game page, what it does in the game today, and any items that are planned but not yet wired to the backend. The goal is plain-language clarity so hosts know exactly how their choices affect a match.

Quick start
- Open “Create Game” from the Lobby.
- Choose Public or Private, pick a map, set the player count, and configure gameplay options.
- Click “Create & Join Game” to open the lobby for others.

Gameplay options

- Visibility (Public / Private)
  - Public: Appears in the Lobby’s public list.
  - Private: Hidden from public list; share the room link to invite friends.
  - Note: The “Invite Code” box is UI-only today. Joining by code uses the room’s ID; sharing the URL is the reliable path.

- Game Type (Casual / Ranked)
  - Casual: No restrictions.
  - Ranked: Enforced server-side (room creation fails if invalid):
    - Must be Public (not Private)
    - Minimum 3 players
    - Team play disabled
    - No AI opponents

- Game Mode (Classic / Capitals / Random)
  - Classic: Conquer the map to win.
  - Capitals: Each player has a capital; keep yours alive.
  - Random: Picks Classic or Capitals at game start.

- Teams (Free-for-all or Fixed teams)
  - Free-for-all: Everyone vs everyone.
  - Teams: Pick 2–6 teams; only valid sizes that evenly divide the max players are allowed (e.g., 6 players → 2 or 3 teams).
  - Enforced server-side; invalid setups are rejected with an error.

- Fortification (Adjacent / Adjacent Multi / Chained / Unlimited / Random)
  - Status: Persisted end-to-end. The selected option is translated into the room’s `movementType`, saved with the room record, and injected into the engine so fortify rules follow the host’s choice every turn.【F:frontend/src/pages/CreateGamePage.tsx†L629-L647】【F:backend/src/controllers/gameController.ts†L110-L145】【F:backend/src/services/gameLifecycleService.ts†L298-L338】
  - Random selects one of the supported fortification styles before the request is sent.

- Hidden Treasures (Payout Mode)
  - Status: Fully wired.
  - Configure in the “Hidden Treasures” panel:
    - Payout mode: Classic (default), Progressive, Fixed, Disabled
    - Diamond chance is fixed at 8%
    - Hand limit is fixed at 5
    - Diamond set bonus is fixed at +3
  - Engine behavior: Draws occur on conquest; redeem sets of 3 for troops; forced cash-in when at or above hand limit. See guides/hidden-treasures.md for full details.

- Fog of War (Off / Adjacent / Persistent)
  - Status: Persisted. Non-off selections are stored with the room and currently normalize to the server’s supported `adjacent` fog mode while persistent filtering is finalized.【F:backend/src/controllers/gameController.ts†L110-L145】【F:backend/src/services/gameLifecycleService.ts†L298-L338】

- Turn Timer
  - Status: Fully enforced. Hosts can choose between 10 seconds and 24 hours; the backend clamps the value, persists it, and seeds game start deadlines plus AFK enforcement jobs from the stored timer. Unset timers fall back to a 24-hour lobby default.【F:backend/src/controllers/gameController.ts†L110-L145】【F:backend/src/services/gameRoomService.ts†L586-L629】【F:backend/src/services/gameLifecycleService.ts†L40-L148】【F:backend/src/services/gameLifecycleService.ts†L388-L448】
  - UI exposes presets in minutes and converts them to seconds before submission.【F:frontend/src/pages/CreateGamePage.tsx†L629-L647】

- Time Bank
  - Status: Live. When enabled, the UI mirrors the turn timer to set a shared reserve; the backend persists the per-room capacity and seeds each player’s remaining bank from that figure when the game starts.【F:frontend/src/pages/CreateGamePage.tsx†L392-L404】【F:frontend/src/pages/CreateGamePage.tsx†L629-L647】【F:backend/src/services/gameRoomService.ts†L586-L629】【F:backend/src/services/gameLifecycleService.ts†L338-L356】

- AI Opponents (feature-flagged)
  - Status: Wired in lobby management (host can add AI seats if allowed by feature flags and if not Ranked). Stored in room seats as AI players.
  - Difficulties: Recruit, Commander, Grandmaster.

- Territory Modifiers (feature-flagged)
  - Status: Toggle pending backend support. The Create Game payload includes `useTerritoryModifiers`, but the controller’s create-room contract does not accept or persist it yet, so games only load modifiers when configuration is supplied out-of-band (e.g. admin overrides or default map settings).【F:frontend/src/pages/CreateGamePage.tsx†L629-L647】【F:backend/src/controllers/gameController.ts†L600-L632】【F:backend/src/services/gameService.ts†L400-L520】

Map selection
- Choose a specific map or “Random Map” (picks at game start).
- Map details show territory count, continents, rating, and creator.

What’s applied vs pending

- Applied now (persisted + used in game):
  - [x] Public/Private
  - [x] Casual/Ranked (with server validation)
  - [x] Map
  - [x] Game Mode (Classic/Capitals)
  - [x] Teams (validated on server)
  - [x] AI Opponents (feature-flagged)
  - [x] Hidden Treasures (full ruleset; see linked guide)

- Pending wiring checklist (still to finish):
  - [ ] Private Invite Code → persist code and allow code-based join
  - [ ] Territory Modifiers toggle → persist `useTerritoryModifiers` and honor the host’s selection without manual intervention

As items ship, check them off here so the guide stays accurate.

Tips for hosts
- For private matches, share the room URL with friends; that’s the most reliable way to join.
- Hidden Treasures pairs nicely with Capitals—forced cash-ins can reshape late-game pushes.
- Ranked games require at least 3 human players and no teams/AI; the “Ranked requirements” callout in the Create Game page summarizes constraints.

Links
- Hidden Treasures ruleset → [hidden-treasures.md](hidden-treasures.md)
- Architecture overview → [../reference/architecture.md](../reference/architecture.md)
