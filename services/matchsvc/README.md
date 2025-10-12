# matchsvc (Go)

Minimal matchmaking, presence, and ratings microservice for ConquestK.

- Language: Go 1.22+
- Transport: HTTP/JSON (gRPC planned via Connect)
- Storage: Redis (required) for presence/queues; Postgres (optional) for ratings
- Observability: Prometheus metrics under `/metrics`; health at `/healthz`, readiness at `/readyz`

## Run locally

```bash
cd services/matchsvc
export REDIS_URL=redis://localhost:6379
export MATCHSVC_DISABLE_AUTH=true  # disable HMAC locally
go run ./cmd/matchsvc
```

## Config

- `MATCHSVC_PORT` (default `8085`)
- `REDIS_URL` (e.g. `redis://localhost:6379`)
- `DATABASE_URL` (optional; enables ratings endpoints)
- `LOG_LEVEL` (`debug|info|warn|error`)
- `MATCHSVC_HMAC_SECRET` (required in prod for HTTP auth)
- `MATCHSVC_DISABLE_AUTH` (`true` for local dev)
- `MATCHSVC_MATCH_INTERVAL_MS` (default `250`)
- `MATCHSVC_DEFAULT_TICKET_TTL` (default `120` seconds)

## Endpoints

- POST `/v1/presence/online|offline|move`
- GET `/v1/rooms/{roomId}/roster`
- POST `/v1/queue/enqueue`, POST `/v1/queue/dequeue`, GET `/v1/queue/{ticketId}`
- GET `/v1/match/{matchId}`
- GET `/v1/ratings/{mode}/{userId}` (requires `DATABASE_URL`)
- POST `/v1/results` (requires `DATABASE_URL`)

All mutation endpoints require `X-MatchSvc-Signature` HMAC-SHA256 of the raw JSON body using `MATCHSVC_HMAC_SECRET` unless `MATCHSVC_DISABLE_AUTH=true`.

## Docker

```bash
docker build -t conquestk/matchsvc:dev .
docker run --rm -p 8085:8085 -e REDIS_URL=redis://host.docker.internal:6379 -e MATCHSVC_DISABLE_AUTH=true conquestk/matchsvc:dev
```

## Notes

- Matchmaker currently forms 1v1 matches per `mode` from the `any` ELO bucket. Bucketing by ELO bands exists but expansion/backfill is TBD.
- Ratings API is idempotent via `results_idempotency` table; rating math is placeholder (no-op) and should be replaced with a proper algorithm.
- Events are published to Redis channel `matchsvc:events`.

