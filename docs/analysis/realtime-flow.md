# Real-time game update pipeline notes

This document walks through how a board update is supposed to flow from one
player's action to every other client, and calls out the likeliest breakpoints
for the current "refresh required" behaviour.

## 1. Socket authentication and room subscription

* The backend socket layer requires every client to connect with a JWT and then
  explicitly join the game room. On connection we hydrate `socket.userId` and
  stash `socket.data.userId` so that later fog filtering knows who the viewer
  is.【F:backend/src/services/socketService.ts†L200-L232】
* When the frontend calls `socketService.joinRoom(roomId)`, the server verifies
  membership, joins both the lifecycle room (`roomId`) and the delta room
  (`game:${roomId}`), emits a `player-joined` notification to peers, and sends
  the newest cached game state back to the joining socket.【F:backend/src/services/socketService.ts†L233-L324】
* On the client, `GameRoom` mounts `socketService.connect()` as soon as the page
  loads and, once it recognises the viewer as a room member, emits
  `join-room`. Leaving the page cleans up by calling `leave-room`. If the member
  check never flips to `true` (for example because `currentRoom` is stale), the
  client never subscribes to the game channel and will rely on manual refreshes
  instead of deltas.【F:frontend/src/pages/GameRoom.tsx†L734-L836】

## 2. Queueing and processing a gameplay action

* Every gameplay emit (`deployArmies`, `attack`, `endTurn`, etc.) is normalised
  into a `game-action` job and pushed to the Bull queue. If the queue service is
  unavailable (Redis down or worker not initialised) we currently just log and
  return `null`, meaning the action never reaches the game engine. This would
  manifest as other players never seeing updates until a full refresh pulls the
  persisted state again.【F:backend/src/services/socketService.ts†L363-L411】【F:backend/src/services/queueService.ts†L289-L339】
* The `WorkerManager` spins up `GameActionWorker`, which dequeues those jobs,
  rehydrates the cached game state, validates the move, and applies it via
  `GameService`. Any generated `GameDelta` is then dispatched through the fog
  filter helper.【F:backend/src/workers/gameActionWorker.ts†L30-L239】

## 3. Broadcasting deltas

* `emitFogFilteredDelta` looks up every socket joined to `game:${roomId}` and,
  using the cached state, filters the delta by viewer visibility before emitting
  a personalised `game-delta` event. If it cannot recover either the socket list
  or the game state it falls back to broadcasting the raw delta to the whole
  channel.【F:backend/src/services/fogService.ts†L96-L137】
* Because this relies on `socket.data.userId`, any regression during the
  handshake (for example, the JWT decode fails so we never set `socket.data`) or
  a Redis adapter bug that drops the per-socket metadata would prevent deltas
  from being sent to that viewer.

## 4. Frontend consumption of updates

* The frontend's singleton `socketService` registers a `game-delta` listener
  that handles notifications, runs several defensive desync checks, and finally
  dispatches `applyDelta` to patch the Redux store in place.【F:frontend/src/services/socketService.ts†L286-L380】
* `applyDelta` is a no-op until `currentGame` is populated. If a viewer receives
  deltas before `fetchGameState` finishes (or if the local state was cleared by
  navigation) the guard drops the update and sets the global `desync` flag. The
  UI then waits for a manual refetch, which matches the "refresh to see changes"
  symptom.【F:frontend/src/store/gameSlice.ts†L309-L359】
* The action creators issue optimistic updates for the acting player, but the
  authoritative state still depends on receiving the follow-up `game-delta` or
  `game-update`. Without that socket event, other players keep their old Redux
  state until the next full refresh.【F:frontend/src/store/gameActions.ts†L220-L300】

## What to check next

1. **Worker/queue health** – confirm the WorkerManager initialises and that the
   `game-actions` queue has active workers. If `queueService.addGameAction`
   keeps returning `null`, no real-time broadcast will ever happen.
2. **Room subscription race** – verify that `isMember` flips to `true` before
   the first delta arrives. If we drop the join because the room payload is
   delayed, the socket never enters `game:${roomId}` and will miss every emit.
3. **Desync guard trips** – inspect `uiRoom.desyncDetected` in Redux. If the
   guard fires, the delta is dropped and the UI reverts to waiting for a manual
   `fetchGameState` (which is why refresh temporarily fixes the view).
4. **Socket metadata** – double-check logs to ensure each connection logs
   "subscribed to game channel"; missing entries mean the handshake did not set
   `socket.data.userId`, so `emitFogFilteredDelta` has nobody to emit to.

Addressing those checkpoints should isolate whether this is a queue/worker
outage, a client subscription bug, or a desync guard that is a little too
aggressive.
