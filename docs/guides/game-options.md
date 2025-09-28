# Create Game & Options Guide

Last updated: January 2026

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
  - Current status: UI-only. The server defaults to classic adjacent movement for now.
  - Roadmap: Persist selection and pass through to the engine’s movementType.

- Hidden Treasures (Payout Mode)
  - Status: Fully wired.
  - Configure in the “Hidden Treasures” panel:
    - Payout mode: Classic (default), Progressive, Fixed, Disabled
    - Diamond chance is fixed at 8%
    - Hand limit is fixed at 5
    - Diamond set bonus is fixed at +3
  - Engine behavior: Draws occur on conquest; redeem sets of 3 for troops; forced cash-in when at or above hand limit. See guides/hidden-treasures.md for full details.

- Fog of War (Off / Adjacent / Persistent)
  - Current status: UI-only from the Create Game page; not applied to engine yet.
  - Roadmap: Persist selection in game_rooms and filter visible territories server-side per mode.

- Turn Timer
  - Current status: UI-only from the Create Game page; server uses its default timer setting for now.
  - Roadmap: Persist and apply at game start to set per-turn deadlines.

- AI Opponents (feature-flagged)
  - Status: Wired in lobby management (host can add AI seats if allowed by feature flags and if not Ranked). Stored in room seats as AI players.
  - Difficulties: Recruit, Commander, Grandmaster.

- Territory Modifiers (feature-flagged)
  - Status: Toggle is wired.
  - Behavior: When enabled, games use map-defined territory modifiers only. No random distribution.

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

- Pending wiring checklist (UI-only before these commits):
  - [x] Fortification type → movementType in engine (classic_adjacent, adjacent_multi, path_single, path_multi)
  - [x] Fog of War → stored on room (UI still pending engine filters)
  - [x] Turn Timer → stored on room (UI still pending enforcement per turn)
  - [x] Territory Modifiers → persist toggle (map-defined only; no distribution)
  - [ ] Private Invite Code → persist code and allow code-based join

As items ship, check them off here so the guide stays accurate.

Tips for hosts
- For private matches, share the room URL with friends; that’s the most reliable way to join.
- Hidden Treasures pairs nicely with Capitals—forced cash-ins can reshape late-game pushes.
- Ranked games require at least 3 human players and no teams/AI; the “Ranked requirements” callout in the Create Game page summarizes constraints.

Links
- Hidden Treasures ruleset → [hidden-treasures.md](hidden-treasures.md)
- Architecture overview → [../reference/architecture.md](../reference/architecture.md)
