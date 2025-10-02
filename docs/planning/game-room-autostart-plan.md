# Game Room Auto-Start & Phase Flow Plan

## Goals
- Remove the user-facing "Setup" phase so games begin in Reinforcement immediately after initialization.
- Ensure player turn order is randomized once per game and, when teams are active, players are spaced evenly by team.
- Start games automatically when all configured players (including AI) have joined, without a manual Start button, and broadcast lifecycle updates so all clients transition in real time.
- Keep existing reinforcement calculations, timers, and lifecycle payloads working with the new flow.

## Backend Tasks
1. **Initial Phase & Reinforcements**
   - Update the game engine to initialize the state in the reinforcement phase.
   - Factor out helper logic to prepare reinforcement baselines, treasure state, and reinforcement counts for the current player so it can run during initialization and on turn transitions.
   - Remove or guard any remaining `setup` checks in phase transitions, validations, and AI decision helpers.

2. **Turn Order Randomization**
   - Adjust `randomizePlayerOrder` to shuffle players while rotating between teams when `teamId` values are present (e.g., Team 1 → Team 2 → Team 3 → repeat).
   - Preserve random order for free-for-all matches and keep the resulting array stable after initialization.

3. **Automatic Game Start**
   - Extend `GameLifecycleService` with a `maybeAutoStart` helper that acquires the existing ready-state lock, checks room capacity/status, and triggers `startGame` when the lobby is full (all human/AI players present).
   - Call this helper from `GameRoomService.joinRoom` and AI auto-fill flows after successful joins so the lifecycle transitions without manual input.
   - Ensure lifecycle broadcasts still fire for all clients.

## Frontend Tasks
1. Remove the Start Game button (and any ready-state related messaging) from the Game Room header.
2. Confirm the room & game slices already react to `lifecycle:update`; if not, subscribe or force a refresh when `triggeredStart` is emitted.
3. Perform a quick smoke test locally (joining enough players should flip the room to active automatically).

## Risks & Follow-ups
- Validate that removing the `setup` phase does not break legacy queues or tests expecting a begin-turn action.
- Ensure AI players (auto-filled or replacements) still get queued actions when the game starts automatically.
- ✅ Follow-up: removed the unused `begin_turn` action now that reinforcement starts automatically.

## Status Update (2024-02-15)
- Backend and frontend changes landed to satisfy every launch goal above: matches enter the reinforcement phase immediately,
  the randomized turn order now spaces out teammates, and lobbies auto-start once seats fill.
- Lifecycle updates reach connected clients without manual refresh thanks to the Game Room's auto-fetch loop, and the manual
  Start control has been retired from the header UI.
- Test coverage confirmed with `npm run lint` and `npm run test:backend`; no regressions observed in existing suites.
- Recommended follow-ups: add dedicated tests for the new lifecycle auto-fetch behaviour on the frontend and schedule a manual
  multiplayer smoke test to observe team interleaving across a full match.
