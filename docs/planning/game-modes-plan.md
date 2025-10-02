# Game Modes Expansion Plan

## Purpose & scope
- Capture detailed product and technical requirements for the next wave of ConquestK game modes.
- Document gameplay rules, UX expectations, telemetry, and rollout sequencing so backend and frontend teams can work in parallel.
- Cover five priority modes: Assassination, Battle Royale, King of the Hill, Zombies (co-op variant included), and Diploma Risk.

## Product goals
1. Broaden replayability by supporting at least three distinct win conditions beyond Classic by end of phase 1.
2. Enable quick experimentation with balance parameters through config-driven settings (no redeploy for numeric tuning).
3. Preserve existing matchmaking/lobby flows while introducing clear onboarding and tutorial affordances for each mode.
4. Provide analytics hooks to compare retention and win/loss trends per mode.

## Success metrics
- ≥35% of custom lobbies launched within three months use at least one new mode.
- Player survey CSAT ≥4/5 for clarity of rules after first match in any new mode.
- Telemetry confirms <1% desync/rollback events caused by mode-specific logic.
- Zombie co-op completion rate ≥20% with two or more human players (tracks whether balance is approachable).

## Shared requirements
- **Game configuration**: extend `GameRuleset` schema with `mode` enum and mode-specific config payloads. Ensure backward compatibility for Classic/Capitals.
- **Lobby UX**: add mode picker with tooltips summarizing objectives; flag modes that disable teams or support co-op scoring.
- **Tutorial surface**: show rule summary modal on first playthrough per mode (track via player profile flag).
- **Match summary**: update post-game screen to highlight mode-specific stats (e.g., assassin eliminated target, hill turns held).
- **Telemetry**: emit `mode_started`, `mode_completed`, and mode-specific events (detailed in each section). Add `mode` tag to existing retention funnels.
- **Config management**: store tunable values (e.g., zombie conversion rates) in database JSON or feature flag service; expose admin UI toggle later.
- **QA**: create regression test harness with deterministic seeds per mode to simulate edge cases (e.g., simultaneous eliminations).

## Mode overview & rollout
| Phase | Mode | Target release | Dependencies |
| --- | --- | --- | --- |
| Phase 1 | Assassination, King of the Hill | Launch +1 month | Requires elimination event hooks and scoring overlay |
| Phase 2 | Battle Royale | Launch +2 months | Needs territory attrition engine and map metadata updates |
| Phase 3 | Zombies (PvE / co-op) | Launch +4 months | Requires AI turn controller and new diplomacy contracts |
| Phase 4 | Diploma Risk | Launch +6 months | Needs simultaneous order resolution engine and UX overhaul |

## Implementation progress
- **Assassination (complete)**: Backend assigns hidden targets during game initialization, disables team play automatically, and resolves instant victories when a hunter's target is eliminated. Socket filtering keeps contracts private, UI surfaces contract HUD/toasts, telemetry captures assignments and eliminations, and lobby copy explains the mode pre-match.

---

## Assassination

### Core rules
- Each player receives a hidden target (another player). Targets form a closed loop to guarantee everyone is hunted.
- Objective: eliminate your assigned target. First player whose target is eliminated wins immediately (even if another player delivered the finishing blow).
- Teams are disabled; alliances still function socially but have no shared victory.
- If the final two players are one another's targets, the next elimination ends the match normally.

### Setup & distribution
- Shuffle live players; assign `targetId` so no one targets themselves. Re-assign dynamically if players abandon before the first elimination.
- Show modal at match start indicating "Your contract" with optional flavor text. Provide reminder icon on HUD.
- Spectators see public eliminations but not target pairings.

### Gameplay flow
1. **Reveal**: After placement phase, display target card to each player.
2. **Elimination**: When a player loses their last territory, trigger win check:
   - If eliminator matches pursuer, show instant victory screen.
   - If someone else eliminated the target, the pursuer still wins but call out "Collateral Victory".
   - Remaining players exit to summary; log final board state.
3. **Edge cases**: If two eliminations happen during simultaneous attack resolution (future-proof for Diploma Risk), evaluate in timestamp order; first successful elimination ends match.

### UI/UX
- Add HUD element with target avatar, territory count, and quick ping to map location (censored for Fog of War if implemented later).
- When target loses territory, show toast updates "Target weakened".
- Post-game card: "How it ended" with eliminator, turn number, armies used.

### Technical implementation
- **Backend**: Extend elimination logic to call `checkAssassinationVictory(gameState, eliminatedPlayerId, eliminatingPlayerId)`.
- **Frontend**: Add `AssassinationPanel` component subscribed to socket updates `assassination:update`.
- **Security**: Ensure sockets only send target info to owning player; sanitize logs.

### Telemetry
- `assassination_assignment` (playerId, targetId, turnNumber=0).
- `assassination_elimination` (playerId, targetId, eliminatorId, turnNumber).
- Track quits before first elimination to gauge frustration.

### Testing & balance
- Simulate 2–6 player games with random dice outcomes to confirm fairness of target loop.
- Verify persistence when reconnection occurs mid-match.

### Implementation progress
- ✅ Backend initialization now distributes one-to-one target assignments and ends the match as soon as a target dies (even via third-party elimination).
- ✅ Socket payload filtering exposes only the viewing player's target to prevent leaks while spectators receive empty mappings.
- ✅ Resignation and neutralization flows now call into the backend to award instant victories when a target is removed outside of combat.
- ✅ HUD contract bar in the in-game header surfaces your active target, supports quick pings to their last known territory, and fires toasts when contracts change or targets fall.
- ✅ Telemetry now emits `assassination_assignment` and `assassination_elimination` counters when contracts are dealt and when a target falls, including resignations.
- ✅ Lobby view surfaces an assassination rules callout so players understand the win condition before the match starts.

---

## Battle Royale

### Core rules
- Standard rules for first three turns. Starting on turn 4, a "shrinking zone" attrition mechanic activates.
- Territories outside the safe zone lose 1 army per turn; every two turns the safe zone shrinks inward one ring (defined per map).
- Elimination by attrition counts as defeat by neutral forces; last surviving player/team wins.

### Map & safe zone definition
- Precompute "rings" per territory using breadth-first distance from map centroid or designated safe zone center.
- Store per-map JSON: `{ territoryId, ringIndex }`. Ring 0 is always safe; attrition starts with highest ring indices.
- Allow designers to override center for asymmetric maps.

### Attrition cadence
- Turn 4: rings with max index begin losing 1 army/turn (minimum 0; cannot go negative).
- Turn 6, 8, ...: decrement `maxRingActive -= 1`, expanding attrition inward.
- When attrition removes last army from a territory owned by player, territory becomes neutral with 1 zombie army (thematic) unless occupied by defending player who can reinforce before attrition tick.
- Attrition occurs after reinforcement phase but before player attacks to encourage movement.

### UI/UX
- Display shrinking circle overlay on map; highlight territories that will attrit next turn.
- Show timeline banner "Ring 3 collapsing in 2 turns".
- Provide attrition log in event feed.

### Technical implementation
- **Backend**: Add `applyAttrition(gameState, turnNumber)` executed at start of each global turn. Hook into scheduler before first player's reinforcement.
- **Frontend**: Map overlay using map metadata. Provide toggles in legend for colorblind compatibility.
- **Data**: Extend map schema in `docs/guides/map-format.md` with optional `battleRoyaleRing` property.

### Telemetry & balancing
- Metrics: `attrition_damage` (territoryId, ownerId, armiesLost), `ring_advance` (turn, newRingIndex).
- Track average turns to victory and number of players eliminated by attrition vs combat.
- Balance levers: initial safe radius, attrition damage per tick, grace period length.

### Testing
- Automated tests verifying attrition stops when only one player/team remains.
- Simulate maps without ring metadata to ensure fallback disables mode (guardrails).

---

## King of the Hill

### Core rules
- A designated "Hill" territory (static or rotating) awards 1 victory point to its controller at the end of each turn.
- First player/team to reach target points (default 10) wins. Alternatively, highest points when turn limit reached.
- Hill starts neutral with elevated defenders (configurable, e.g., 8 armies).

### Variants
- **Static Hill**: same territory all match.
- **Rotating Hill**: new hill announced X turns in advance (default 2). Rotation order defined per map or randomly from eligible list.

### Gameplay flow
1. Hill revealed during setup. If rotating, show upcoming hill queue in sidebar.
2. During each end-of-turn phase, award points to controlling player (after all attacks). Announce via toast and scoreboard.
3. If tie at end of game (turn limit), highest army count on hill breaks tie; otherwise share victory (teams only).

### UI/UX
- Add scoreboard widget with victory points and progress bars.
- Highlight hill territory with golden outline; show countdown when rotation imminent.
- Provide mini-log: "Blue Team held the hill (Turn 5)".

### Technical implementation
- **Backend**: Maintain `hillState { currentTerritoryId, upcomingTerritoryId, pointsMap }`. Update during end-turn resolution.
- **Frontend**: Extend scoreboard to display points; map overlay for hill territory.
- **Data**: For rotating mode, store `eligibleHillTerritories` per map to avoid unreachable locations.

### Telemetry & balancing
- Track `hill_control` (turn, controllerId, durationHeld), `hill_rotation` events.
- Balance parameters: starting neutral armies, victory point target, rotation cadence.

### Testing
- Unit tests ensuring points award once per global turn only.
- Integration test covering rotation notice and actual swap.

### Implementation progress
- ✅ Backend now normalizes hill configuration, seeds neutral defenders, awards points at the end
  of each round, and rotates hills while preventing duplicate scoring.
- ✅ Frontend surfaces a dedicated hill scoreboard with toasts and lobby guidance so players know
  when the objective moves and how close everyone is to victory.

---

## Zombies (PvE & Co-op)

### Core premise
- Neutral territories become the "Zombie Horde" controlled by AI. Players can cooperate or play solo against zombies while still competing for victory points or survival milestones.
- Default victory: survive X turns (e.g., 15) **or** wipe out all zombies. Optional co-op truce allows shared victory and ELO split if all humans agree.

### Zombie behavior
- Zombies take their own turn after all human players.
- At start, each neutral territory gains `zombieArmies` (config: base 3 + continent modifier).
- **Infection attack**: For each zombie territory with ≥5 armies, AI selects adjacent human territory prioritizing weakest defense. Attack resolves like normal combat, but defeated defending armies become zombies (conversion rate 50% of surviving attackers rounded down).
- **Spread mechanic**: At end of zombie turn, each zombie territory with ≥10 armies spawns 1 zombie army on each adjacent neutral/zombie territory (capped to prevent runaway growth).

### Player interaction
- Attacking zombies carries infection risk: each battle roll has `infectionChance` (default 15%) to convert 1 attacking army to zombies immediately (removed from attacker, added to defender if defender is zombie).
- When player territory is fully converted, player loses those armies but retains ownership until zombies fully conquer territory.
- Introduce `Research Lab` card/diplomacy option granting temporary infection immunity (e.g., for 3 attacks) costing reinforcement or card set.

### Co-op truce mechanic
- Humans can call for "Evacuation Protocol" vote when only zombies remain as opponents or after predefined turn. Requires unanimous consent among surviving humans.
- On success, match ends with shared victory; ELO distributed evenly among voters. Record `co_op_victory` telemetry.

### UI/UX
- Zombie territories tinted green; infection risk indicator shown on attack panel.
- Add zombie turn log summarizing attacks and spreads.
- Co-op vote UI similar to diplomacy agreements with countdown timer.

### Technical implementation
- **Backend**: Introduce AI turn processor `runZombieTurn(gameState)` triggered after last human. Use deterministic RNG for fairness and replays.
- **Conversion logic**: Extend combat resolution to accept `onInfection` callback adjusting armies based on probability.
- **Diplomacy**: Add new agreement type `co_op_victory_vote` with socket flow for vote status and resolution.
- **Difficulty scaling**: Config object `zombieConfig` with fields: `baseArmies`, `infectionChance`, `aiAggression`, `spreadThreshold`, `victoryTurnRequirement`.

### Telemetry & balancing
- Events: `zombie_attack`, `zombie_infection`, `co_op_vote_cast`, `co_op_vote_result`.
- Track human survival rate, average infection casualties, number of co-op victories.
- Provide admin console to tweak config live for limited time events.

### Testing
- Simulate AI turns to ensure conversions don't exceed total armies.
- Verify co-op vote handles disconnects (default vote = abstain; fails if unanimity not reached before timer).

---

## Diploma Risk (Simultaneous Turns)

### Core concept
- Hybrid of Diplomacy and Risk: players submit orders in simultaneous phases, resolved collectively each turn.
- Phases per global turn: **Reinforcement Planning**, **Attack Orders**, **Fortify / Support Orders**.
- Orders lock when timer expires or player manually confirms. Unsubmitted orders default to "hold" actions.

### Turn structure
1. **Reinforcement Planning (Phase 1)**
   - Players allocate reinforcements to owned territories simultaneously. Reinforcements are revealed and applied once phase completes.
   - UI: drag-and-drop reinforcements; show order summary panel.
2. **Attack Orders (Phase 2)**
   - Players select source territory, target territory, and number of attacking armies. Orders hidden until resolution.
   - Support options: choose allied support (if teams enabled) to add modifiers.
3. **Fortify / Support (Phase 3)**
   - Move remaining armies or assign defense boosts. Optional "Support Hold" order to bolster defense if anticipating attacks.

### Order resolution logic
- Process attacks simultaneously using initiative rules:
  - Determine conflicts where multiple players attack same territory. Resolve by comparing attack strength (armies + support modifiers). If tie, both fail and lose a proportion of armies.
  - If defender also issues "Counter-Attack" order (new order type), treat as contested with both sides suffering losses.
- Dice mechanics: maintain Risk-style randomness but roll after aggregating attack strength. Example: highest attacker uses up to 3 dice, defender up to 2; apply sequentially.
- After attacks resolved, apply fortify moves for surviving territories.
- Handle circular moves (A->B, B->C, C->A) by staging results then applying in consistent order to avoid duplication.

### UX considerations
- Introduce "Orders" sidebar listing submitted commands with ability to edit before lock-in.
- Countdown timer per phase; allow host to configure durations (e.g., 60s/90s/60s).
- Combat resolution playback: after orders reveal, animate conflicts sequentially with highlight of chosen dice results.
- Provide summary log accessible post-match for replay.

### Technical implementation
- **Backend**:
  - Expand game state machine with new phases (`SIM_REINFORCE`, `SIM_ATTACK`, `SIM_FORTIFY`, `RESOLUTION`).
  - Store pending orders per player in structured format: `{ phase, orderType, payload, submittedAt }`.
  - Create resolution engine that ingests all orders, runs deterministic conflict resolution, updates board, and emits event timeline for frontend.
  - Ensure sockets broadcast phase transitions and order confirmations.
- **Frontend**:
  - Implement multi-phase UI using state machine; reuse existing attack dialogs but allow queueing orders.
  - Add `orderHistory` component for spectator replay.

### Edge cases & safeguards
- If player disconnects, auto-fill "hold" orders. Provide grace reconnect window.
- When alliances exist, allow optional shared vision toggle; block direct targetting if allied? (design decision).
- Handle stale orders if territory lost between phases: automatically cancel attack and notify player.
- Ensure order timestamps used to break ties if identical strength and dice results (first submit wins to reduce randomness) or coin flip configurable.

### Telemetry
- `order_submitted` (phase, orderType, armies, timestamp).
- `order_conflict` (territoryId, participants, outcome).
- Track average decision time per phase to tune timers.

### Testing strategy
- Unit tests for resolution engine covering conflicts, circular moves, and cancellations.
- Integration tests verifying UI transitions and order submissions via socket mocks.
- Load testing to ensure simultaneous submissions don't overload server (expect spike near phase deadlines).

---

## Team coordination & operations
- **Documentation**: Update `docs/guides/game-options.md` with new mode descriptions and config tables once implemented.
- **Localization**: Prepare strings for tooltips, tutorials, and event logs.
- **Support**: Draft FAQ entries addressing zombie conversions, assassination fairness, and simultaneous turns.
- **Community testing**: Run private beta weekends for each phase; gather metrics and qualitative feedback.
- **Live ops**: Consider rotating featured mode weekly to spotlight new mechanics.

## Next steps
1. Validate technical feasibility for attrition engine and simultaneous resolution with quick prototypes.
2. Prioritize backend API changes for mode configuration to unblock UI work.
3. Schedule design review for Zombies infection rates and co-op scoring.
4. Create engineering tickets per mode aligned with rollout phases.
