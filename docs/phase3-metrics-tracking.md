# Phase 3: Client-Side Reliability Metrics Guide

## Overview
Track client-side metrics to monitor real-time system health, debug issues, and identify patterns in connection/action failures.
> **Status (2025-10-16):** Client reliability metrics are live. The frontend streams telemetry via `reliabilityMetricsService`, the backend persists snapshots in `client_metrics`, and admins can review summaries. The remaining to-dos are richer dashboards/alerting and broadening the tracked fields.

## Metrics to Track

### Connection Metrics
- `reconnect_count`: Number of disconnects/reconnects
- `connection_latency_avg`: Average ping latency
- `connection_latency_p95`: 95th percentile latency
- `connection_uptime_percent`: % of time connected

### Action Metrics
- `actions_attempted`: Total actions sent
- `actions_succeeded`: Actions acknowledged successfully
- `actions_failed`: Actions that failed/timed out
- `actions_retried`: Actions retried after failure
- `action_success_rate`: % of successful actions

### Delta Metrics
- `deltas_received`: Total deltas processed
- `deltas_duplicates`: Duplicate deltas filtered
- `delta_gaps_detected`: Sequence gaps found
- `delta_gap_recoveries`: Successful gap recoveries

### Desync Metrics
- `desync_detections`: Times desync was detected
- `desync_recoveries`: Successful full state refetches
- `desync_recovery_time_avg`: Average recovery time

## Implementation

### 1. Reliability Metrics Service (frontend)

- **File:** `frontend/src/services/reliabilityMetricsService.ts`
- Responsibilities:
  - Track reconnects, uptime/downtime, latency samples, action outcomes, delta gaps, and desync recoveries.
  - Generate snapshots (`getSnapshot`, `getStats`, `getDisplaySnapshot`) for uploads and UI.
  - Flush metrics to the backend every 30 seconds via `api.post('/metrics/client', payload)`.
  - Expose a subscription API so the Admin Health screen can show live stats.

Key usage:
```ts
reliabilityMetrics.recordActionAttempt()
reliabilityMetrics.recordActionSuccess()
reliabilityMetrics.recordDeltaGap()
reliabilityMetrics.start() // kicked off on import
```

### 2. Socket Service Integration

- **File:** `frontend/src/services/socketService.ts`
- `sendActionWithAck` records attempts/success/failure/retry with `reliabilityMetrics`.
- Heartbeat latency samples call `reliabilityMetrics.recordLatencySample`.
- Delta sequencing + gap recovery invoke the delta metrics helpers.
- Desync detection/resolve flows call `recordDesyncDetection` and `recordDesyncRecovery`.
- `connect` / `disconnect` events update uptime/downtime and reconnect counters.

### 3. Backend ingestion & summary

- **Routes:** `backend/src/routes/metricsRoutes.ts`
  - `POST /metrics/client` (auth required) stores snapshots using `insertClientMetrics`.
  - `GET /metrics/client/summary` (admin only) returns 24h aggregates via `getClientMetricsSummary`.
- **Service helpers:** `backend/src/services/clientMetricsService.ts`
- **Migration:** `backend/migrations/017_create_client_metrics.sql`

The `client_metrics` table stores raw `metrics` + `stats` JSON along with optional `user_id` / `game_id` for segmentation.

### 4. Admin surfaces

- **Admin Health screen:** `frontend/src/pages/AdminHealth.tsx` hits `/metrics/client/summary` to show the latest session count, average latency, success rate, and reconnect totals.
- Further dashboards/alerting are still outstanding (see “Monitoring Dashboard” below for suggested queries).
## Monitoring Dashboard

### Sample Queries

```sql
-- Average latency over time
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  AVG((metrics->>'avgLatency')::numeric) as avg_latency
FROM client_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Users with high reconnect rates
SELECT
  user_id,
  COUNT(*) as sessions,
  AVG((metrics->>'reconnectCount')::integer) as avg_reconnects
FROM client_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING AVG((metrics->>'reconnectCount')::integer) > 3
ORDER BY avg_reconnects DESC;

-- Action success rates by game
SELECT
  game_id,
  AVG((stats->>'actionSuccessRate')::numeric) as avg_success_rate,
  COUNT(*) as sample_count
FROM client_metrics
WHERE game_id IS NOT NULL
GROUP BY game_id
HAVING COUNT(*) >= 5
ORDER BY avg_success_rate ASC;
```

## Alerting Rules

Set up alerts for critical metrics:

1. **Action Success Rate < 90%**: Investigate connection issues
2. **Average Latency > 500ms**: Check server or network
3. **Reconnect Count > 5/session**: Investigate stability
4. **Desync Rate > 1%**: Check delta sequencing logic

## Key Benefits

1. **Proactive Monitoring**: Detect issues before users complain
2. **Data-Driven Optimization**: Identify bottlenecks with real data
3. **User Segmentation**: Find patterns (e.g., mobile users have higher latency)
4. **A/B Testing**: Compare metrics between feature flags

## Performance Notes

- Metrics stored in memory until upload
- Upload every 30s (batched, not per-action)
- Database insertion is async/non-blocking
- Negligible client-side overhead (<1ms per metric)
