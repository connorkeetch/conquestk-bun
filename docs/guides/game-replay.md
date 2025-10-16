# Game Replay (development)

## Backend
- The backend provides read-only replay endpoints under `/api/games/:id/replay/*`.
- These endpoints are built from the `game_logs` and `game_state_snapshots` tables.

## Frontend
- The frontend includes a `/replay/:gameId` route for viewing replays.
- An isolated `replaySlice` is used for scrubbing completed matches in read-only mode.

## Implementation Details
- Replays are chunked to ~25 turns per request.
- Diffs are computed on the client-side from pre/post snapshots plus lightweight deltas.
- Payloads are kept small and selectors are memoized.
- No live sockets are involved in the replay feature.
