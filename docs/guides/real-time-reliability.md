# Real-Time Reliability

_Last updated: October 21, 2025_

This document summarizes the implementation of real-time reliability features, including idempotency, optimistic UI, latency monitoring, and client-side metrics.

## Completed Work

### Critical Fixes (Implemented)

1.  **Automatic Room Re-subscription**: Fixed ghost connections by ensuring clients automatically rejoin game rooms after reconnecting, triggering a full state refetch.
2.  **WebSocket-First Transport**: Reduced latency by prioritizing WebSocket connections over polling.
3.  **Heartbeat Monitoring**: Detects zombie connections with 5-second pings and a 3-second timeout, triggering auto-reconnection on failure.
4.  **Enhanced Desync Detection**: Provides user-facing toast messages during resync operations.
5.  **Lockstep Resync Flow**: Implemented deterministic frame sequence numbers and checksums for gap detection and recovery.

### Code Consolidation (Implemented)

Refactored `socketService.ts` to eliminate ~200 lines of duplicate code by:

1.  Enhancing `sendActionWithAck` to support idempotency keys, throttling, optimistic updates, and rollback callbacks.
2.  Refactoring action methods (`deployArmies`, `attack`, `fortify`) to use the unified `sendActionWithAck`.
3.  Removing redundant tracking mechanisms in favor of a centralized approach.

## Key Features & Implementation Guides

### 1. Idempotency Keys

**Purpose**: Prevents duplicate action processing when clients retry failed requests.

**Status**: Frontend ready (keys are generated), backend integration pending.

**Implementation Details**:

*   **Backend**: An `IdempotencyService` with Redis-backed deduplication will be integrated into `gameActionWorker.ts` to skip duplicate actions.
*   **Frontend**: The `socketService.ts` generates UUID-based keys and includes them in action payloads.

### 2. Optimistic UI with Rollback

**Purpose**: Applies UI changes immediately before server confirmation for instant feedback.

**Status**: Partially complete. Core pattern is implemented for `deployArmies` and `fortify`.

**Implementation Details**:

*   **Flow**:
    1.  Apply optimistic UI update.
    2.  Send action to server.
    3.  On success, commit the change.
    4.  On failure, roll back to a snapshot and show an error.
*   **Rollbacks**: Handled on a per-action basis. A full `OptimisticUpdateManager` is designed but not yet implemented.

### 3. Connection Latency Indicator

**Purpose**: A visual indicator of real-time connection quality.

**Status**: Documented, awaiting implementation.

**Implementation Details**:

*   A `ConnectionBadge` React component will display latency in color-coded states (green, yellow, orange, red, gray).
*   A details popup will show metrics like latency, reconnects, and action success rate.
*   Metrics will be gathered by a `getReliabilityMetrics()` method on `socketService`.

### 4. Client-Side Metrics Tracking

**Purpose**: To monitor real-time system health and debug issues.

**Status**: Documented, awaiting implementation.

**Implementation Details**:

*   A `MetricsService` class will track actions, deltas, and reconnects.
*   Metrics will be uploaded to a backend endpoint (`/api/metrics/client`) every 30 seconds.
*   Data will be stored in a `client_metrics` database table.

## Next Steps

1.  **Backend Idempotency**: Implement the `IdempotencyService` and integrate it with the `gameActionWorker`.
2.  **Connection Latency Indicator**: Build the `ConnectionBadge` component and associated UI.
3.  **Client-Side Metrics**: Implement the `MetricsService`, backend endpoint, and database table.
