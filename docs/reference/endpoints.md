# Service Endpoints

_Last updated: March 2026_

This document lists operational endpoints we use for health, queues, and admin tools across environments.

## Health
- Production (behind frontend proxy): `/api/health`
- Staging (direct backend): `/health`
- Local: `http://localhost:5001/health` and `http://localhost:5001/api/health`

Response shape:
```
{
  status: "OK",
  server: "running",
  database: "connected" | "disconnected",
  redis: "connected" | "disconnected",
  queues: "healthy" | "unhealthy" | "disabled" | "not-initialized",
  environment: "production" | "staging" | "development",
  databaseUrl: "configured" | "missing",
  redisUrl: "configured" | "missing",
  sentry: "configured" | "disabled",
  timestamp: "ISO-8601",
  // Present only on errors
  databaseError?: string,
  redisError?: string,
  queueError?: string
}
```

Notes:
- Production proxies only expose API routes. Use `/api/health` in prod.

## Queues (BullMQ)

- Public, unauthenticated ping: `/api/queues/ping`
  - Returns a minimal status and timestamp.
  - Example: `{ "status": "healthy", "timestamp": "2026-03-07T00:00:00.000Z" }`

- Detailed health (auth required): `/api/queues/health`
  - Includes worker initialization status, per-queue stats, Redis ping, and queue service init flag.
  - Returns HTTP 200 when both workerManager and queueService are healthy; otherwise 503.

Example payload (200):
```
{
  success: true,
  status: "healthy",
  details: {
    workers: { initialized: true },
    queues: {
      gameActions: { waiting: 0, active: 0, completed: 10, failed: 0, delayed: 1, isPaused: false, deadLetter: 0, stalled: 0, oldestWaitingMs: null, avgProcessingMs: 7, warnings: [] },
      gameCleanup: { ... },
      analyticsEvents: { ... }
    },
    redis: "PONG",
    queueServiceInitialized: true
  },
  timestamp: "2026-03-07T00:00:00.000Z"
}
```

- Admin UI (Bull Board): `/admin/queues` (auth: admin)
  - Lists `game-actions`, `game-cleanup`, and `analytics-events` queues.
  - Note: UI mounts after workers/queues initialize, to avoid a 404 during warm-up.

Queue naming
- Queue names avoid colon (`:`) characters. Dead-letter queues use a hyphen suffix: `-dead-letter` (for example, `game-actions-dead-letter`).

## AFK & Turn Timeout (reference)
- On game start or after each turn, the backend schedules a delayed job that triggers `handleTurnTimeout` when the deadline passes.
- Job id format: `turn-timeout:<roomId>:turn:<turnNumber>` in the `game-actions` queue.
- At expiry:
  - If the player has remaining time bank and `using_time_bank=false`, the bank is consumed and the deadline is extended (no strike yet).
  - Otherwise, the player’s `missed_turns` increments and `last_missed_turn_at` is set; the turn is force-advanced. On the 3rd miss, the player is kicked and neutralized.

## Quick Commands
```bash
# Production
curl -sS https://conquestk.com/api/health | jq
curl -sS https://conquestk.com/api/queues/ping | jq

# Staging
curl -sS https://risk-game-production-9935.up.railway.app/health | jq

# Local
curl -sS http://localhost:5001/health | jq
curl -sS http://localhost:5001/api/queues/ping | jq
```

