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

* Actions using the queue today: `deployArmies` and `attack` enqueue a
  `game-action` job. `fortify` and `endTurn` are processed synchronously in the
  socket handler (no queue) and broadcast immediately.
* If the queue service is unavailable (Redis down or worker not initialised),
  `queueService.addGameAction` returns `null`. Our socket handlers currently
  only log in that case and do not apply the action directly — so those actions
  won’t process at all until queues are healthy. This is a gap to fix.【F:backend/src/services/queueService.ts†L289-L339】【F:backend/src/services/socketService.ts†L397-L444】
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
  from being sent to that viewer. To avoid silent drops, we now fall back to
  sending the raw delta to sockets missing `data.userId`.

## 4. Frontend consumption of updates

* The frontend's singleton `socketService` registers a `game-delta` listener
  that handles notifications, runs several defensive desync checks, and finally
  dispatches `applyDelta` to patch the Redux store in place.【F:frontend/src/services/socketService.ts†L286-L380】
* `applyDelta` is a no-op until `currentGame` is populated. If a viewer receives
  deltas before `fetchGameState` finishes (or if local state was cleared), the
  handler triggers a one-off refetch for that room and returns. Desync flags are
  set only when entity ids in a delta don’t exist in local state.
  【F:frontend/src/services/socketService.ts†L409-L468】【F:frontend/src/store/gameSlice.ts†L309-L359】
  
## 5. Reconnect and rejoin

* On reconnect, clients must rejoin the game room to resume broadcasts. The
  previous implementation didn’t auto-rejoin, which can explain “no updates
  until refresh” after transient disconnects. We now auto-rejoin the active
  room on `connect` based on Redux state.
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
3. **Reconnect rejoin** – after any reconnect, ensure the server logs “subscribed
   to game channel …” again for that user/room. Without rejoining, no deltas
   will arrive until a page refresh.
4. **Desync guard trips** – inspect `uiRoom.desyncDetected` in Redux. If entity
   IDs referenced in a delta aren’t in local state, the delta is dropped and a
   refetch is triggered.
5. **Socket metadata** – ensure handshake sets both `socket.userId` and
   `socket.data.userId` so fog filtering can personalise deltas.

Addressing those checkpoints should isolate whether this is a queue/worker
outage, a client subscription bug, or a desync guard that is a little too
aggressive.

## Targeted fixes applied

* Frontend: auto rejoin active room on socket `connect` to restore subscriptions.
* Backend: fog emitter now falls back to unfiltered delta if `userId` metadata
  is missing, preventing silent drops.
* Backend (degraded mode): inline processing for `deployArmies` and `attack`
  when queues are unavailable, emitting the same fog-filtered deltas so players
  see updates without refreshing.

## Follow-ups (recommended)
* Consider a read-only spectator join path with fog filtering if spectators
  should see live board changes.
* Surface queue health in the admin panel and a subtle client warning when
  queues are unhealthy.

## Reliability gaps raised by field testing

Connor's "moves disappear until refresh" report suggests more than one weak
link. The notes below expand on the highest-risk areas uncovered while tracing
the live code paths.

1. **Room join confirmation is fire-and-forget.** The frontend simply emits
   `join-room` and assumes success; there is no acknowledgement and no retry if
   the server rejects the request or the socket disconnects between emit and
   join.【F:frontend/src/services/socketService.ts†L118-L120】 On the backend we
   accept the join, add the socket to the channel, and emit a `game-update`, but
   likewise never confirm to the client that the subscription is active.【F:backend/src/services/socketService.ts†L520-L616】 If
   `isMember` is stale when the reconnect logic runs (for example, Redux has not
   yet rehydrated the room players list), the client also skips rejoining
   entirely.【F:frontend/src/services/socketService.ts†L557-L571】 These races line
   up with the observed "no updates until refresh" behaviour.
2. **Queued actions can stall when workers are offline.** Every gameplay action
   is enqueued first; the socket handler only falls back to inline execution if
   queueing fails altogether.【F:backend/src/services/socketService.ts†L706-L820】
   When Redis is reachable but the worker is down, `addGameAction` still returns
   a job id, we `ack({ ok: true, queued: true })`, and then nothing processes.
   The inline fallback in `GameActionProcessor` never runs because it only triggers
   when we deliberately skip queueing.【F:backend/src/services/gameActionProcessor.ts†L35-L88】 That perfectly explains turns that
   "hang" until a manual refresh or until someone restarts the worker. We need a
   worker-health guard before acking.
3. **Notifications do not cover every path that flips the turn.** Turn-start
   pushes fire only when `processEndTurn` advances into reinforcement and when
   the phase actually changes.【F:backend/src/services/gameService.ts†L1226-L1253】
   AI turns, resigned players, and other lifecycle shortcuts can skip the push
   entirely. Connor will therefore miss "your turn" alerts even when realtime is
   otherwise healthy.
4. **Client-side convergence depends on seeing a delta quickly.** Optimistic
   updates clear once the follow-up `game-delta` arrives; if the delta never
   appears, the optimistic state sticks and the local timer fetch runs only after
   ~600 ms.【F:frontend/src/services/socketService.ts†L291-L321】 When the backend
   silently drops a delta (fog metadata missing, stale cache read, etc.) the user
   sees the board freeze until the watchdog fetch completes or they refresh.
5. **Reconnect UX surfaces status but not auto-repair.** We flag the socket as
   disconnected and show UI banners, but there is no self-healing beyond the
   optimistic rejoin attempt. If the join fails or stalls, we never escalate to a
   forced refetch, toast, or full reconnect loop.【F:frontend/src/services/socketService.ts†L552-L620】

## Hardening plan (prioritised)

1. **Add acknowledgements and retries for room joins.** Extend the `join-room`
   handler to accept an acknowledgement callback. Return `{ ok: true, joinedAt }
   ` when subscription succeeds, bubble up meaningful errors for auth or access
   issues, and retry from the client until confirmed. Log the attempt with
   socket id and room id so we can correlate field reports. This alone should
   stop the "silent failure" mode where the client never actually enters the
   room.【F:backend/src/services/socketService.ts†L520-L616】【F:frontend/src/services/socketService.ts†L118-L120】
2. **Guard against missing workers before acking gameplay actions.** Teach the
   socket handler to call `queueService.hasActiveWorkers('gameActions')` after
   enqueuing. If no worker is active, immediately remove the job and invoke the
   inline processor so the action still emits deltas. Record a metric/toast so we
   can see degraded mode in real time.【F:backend/src/services/socketService.ts†L706-L820】【F:backend/src/services/gameActionProcessor.ts†L35-L169】
3. **Instrument join + delta latencies.** We already capture ack/process timing
   in `realtimeMetrics`; extend that to include `game-update` round-trip (emit to
   Redux application) and publish the p95 in Admin Health. That will highlight
   where deltas are slow or absent.【F:backend/src/services/socketService.ts†L724-L746】【F:frontend/src/services/socketService.ts†L553-L575】
4. **Emit turn notifications for every phase transition.** When `advancePhase`
   chooses the next actor (including AI skips, resignations, and reconnect
   resumes) call `notifyTurnStart` with the resolved player id so Connor always
   gets a push or in-app toast. Consider mirroring the event over the socket so
   open tabs show "it's your turn" immediately.【F:backend/src/services/gameService.ts†L1226-L1253】
5. **Build a client watchdog for delta starvation.** Track `lastDeltaAt` in
   Redux; if no delta arrives within, say, 2 seconds while our optimistic timer
   is running, automatically emit `fetchGameState` and display a one-off toast
   advising the player that we are resyncing. This keeps the UI lively even if a
   single delta gets lost.【F:frontend/src/services/socketService.ts†L291-L321】
6. **Expose queue + socket health to the lobby.** Surface queue-worker status and
   socket connection state directly in the game header so players see "Realtime
   degraded" instead of guessing. The metrics already exist; we just need a thin
   API to surface them.【F:backend/src/services/queueService.ts†L260-L348】【F:frontend/src/services/socketService.ts†L553-L620】

Following this roadmap means even if Redis hiccups or the worker dies we still
process the move inline, confirm the subscription, and nudge the client back to a
fresh state without requiring a manual refresh. That is the Slack-grade
experience we are aiming for.
