# Match Service (matchsvc)

_Last updated: March 9, 2026_

A minimal Go microservice that owns matchmaking queues, presence (online state and room membership), and ratings/ELO updates. Node/Socket.IO remains the realtime transport; this service exposes HTTP/JSON (gRPC planned) and Redis pub/sub for signals.

- Binary: `services/matchsvc/cmd/matchsvc`
- Port: `8085` (config `MATCHSVC_PORT`)
- Redis channel: `matchsvc:events`
- Node status proxy: `/api/matchsvc/status`

## Responsibilities
- Presence: track per-user connections and room membership; publish presence/roster changes
- Matchmaking: queue per mode, simple 1v1 grouping (expansion by ELO bands is scaffolded)
- Ratings: idempotent result ingestion and rating storage (math TBD)
- Status aggregation: `/api/matchsvc/status` on the Node backend folds service health, Redis reachability, HMAC auth checks, subscriber state, and Prometheus metrics into a single payload consumed by the admin dashboard.

## Data keys
- `presence:{userId}` JSON: `{ status, lastSeen, connectionIds[], roomId? }`
- `room:{roomId}:members` set of userIds
- `lobby:queues:{mode}:{bucketKey}` list of ticket IDs (bucketKey=`any` or ELO band `100-199`)
- `ticket:{ticketId}` JSON ticket state
- `match:{matchId}` JSON match doc (TTL 2m)

## HTTP endpoints
- POST `/v1/presence/online`, `/offline`, `/move`
- GET `/v1/rooms/{roomId}/roster`
- POST `/v1/queue/enqueue`, POST `/v1/queue/dequeue`, GET `/v1/queue/{ticketId}`
- GET `/v1/match/{matchId}`
- GET `/v1/ratings/{mode}/{userId}` (requires Postgres)
- POST `/v1/results` (requires Postgres)

Auth: provide `X-MatchSvc-Signature` header as HMAC-SHA256 hex of the raw JSON body using `MATCHSVC_HMAC_SECRET`. Set `MATCHSVC_DISABLE_AUTH=true` for local dev. The backend’s `/api/matchsvc/status` route performs a no-op dequeue to validate HMAC configuration whenever a secret is present.

## Events
Published to `matchsvc:events` (JSON):
- `{ "type": "presence.changed", "userId": "...", "status": "online|offline", "roomId": "..." }`
- `{ "type": "match.found", "matchId": "...", "mode": "...", "players": ["..."], "seed": 123456 }`
- `{ "type": "room.roster.updated", "roomId": "...", "members": ["..."] }`

## Local development
- Start Redis and Postgres from `docker-compose.yml` at repo root
- Run service: `cd services/matchsvc && MATCHSVC_DISABLE_AUTH=true REDIS_URL=redis://localhost:6379 go run ./cmd/matchsvc`
- Metrics at `/metrics` (exposes `matchsvc_queue_depth`, `matchsvc_matches_formed_total`, `matchsvc_presence_online_total`); health at `/healthz`
- Node integration: `npm run dev:backend` automatically boots the Redis subscriber and surfaces readiness in `/api/matchsvc/status` once connected.

## Deployment
Build a static image from `services/matchsvc/Dockerfile`. For Railway, add a separate service or integrate to a dedicated container runner. Configure:
- `REDIS_URL` (required)
- `DATABASE_URL` (optional: enables ratings)
- `MATCHSVC_HMAC_SECRET` (required in production)

### Ratings tables (PostgreSQL)
Create once via a new migration under `backend/migrations`:
```
CREATE TABLE IF NOT EXISTS players_ratings (
  player_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  rating INT NOT NULL,
  deviation INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, mode)
);

CREATE TABLE IF NOT EXISTS results_idempotency (
  result_id TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Node integration
- Use `@conquestk/match-client` (workspace `shared/match-client`) from the backend to send presence and queue mutations and poll matches.
- Subscribe to Redis channel `matchsvc:events` in the backend; on `match.found` create/join a private Socket.IO room and notify clients. Presence/roster payloads mirror the service schema. `backend/src/routes/matchsvc.ts` exposes `/api/matchsvc/status`, which the Admin Dashboard renders as the Match Service card (health, subscriber state, queue depths, matches formed, presence online).

## Roadmap
- gRPC + Connect/OpenAPI generation under `services/matchsvc/api`
- Proper ELO/Glicko multi-player rating updates
- Expansion search across ELO buckets and party matching
- Rate limiting and janitor for stale connections
