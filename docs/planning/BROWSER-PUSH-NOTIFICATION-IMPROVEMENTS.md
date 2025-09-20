# ✅ Browser Push Notification Hardening Plan

_Last updated: February 19, 2025_

## 🎯 Objectives
- Make browser push reliable across deploys and multiple devices.
- Provide accurate UI feedback that reflects backend availability and subscription status.
- Ensure gameplay events actually trigger timely notifications for players.
- Improve observability so failures and stale subscriptions are surfaced early.

## 📋 TODOs

### Persistence & Subscription Lifecycle
- [x] Replace the in-memory `Map<number, PushSubscription>` with a durable table keyed by `(user_id, endpoint)` so subscriptions persist across restarts and support multiple browsers per user.
- [ ] Add a maintenance job or admin endpoint to prune expired/invalid subscriptions once persistence exists.
- [x] Guard `pushManager.subscribe()` with `getSubscription()` checks to reuse existing registrations and avoid `InvalidStateError` crashes when the toggle is re-enabled.

### Client UX & Error Handling
- [x] Read the `{ enabled }` flag from `/api/notifications/vapid-public-key` and disable the toggle with an explanatory message when the backend has push disabled.
- [x] Treat non-2xx responses from `/api/notifications/subscribe` and `/unsubscribe` as failures, reverting the toggle and surfacing errors to the user.
- [x] Bubble up or log errors thrown during `initialize()`, `subscribe()`, and `unsubscribe()` so permission or network issues are visible in the console/logs.
- [x] Replace missing notification assets (e.g., `/badge-72.png`) with existing icons in `frontend/public` so badges render correctly in push notifications.

### Service Worker Behaviour
- [x] Update click-handling logic to target windows based on `self.location.origin` or the notification payload URL instead of hard-coded hostnames, covering staging and future domains.
- [x] Audit background-sync TODOs in the service worker—either implement the intended offline delivery flow or remove the placeholder to avoid confusion.

### Backend Delivery & Reliability
- [x] Wrap `webpush.sendNotification` with retry/backoff for transient 5xx/429 responses and record failures for later inspection.
- [ ] Integrate structured logging (`logger.child({ channel: 'webpush', eventId })`) around subscription saves, sends, and errors.
- [ ] Extend the notification service to fan out gameplay events (`notifyTurnStart`, `notifyGameStart`, eliminations, invitations) so pushes are emitted without manual testing. _(Game start/turn/end pushes now wired via `gameService`; eliminations & invites remain TODO.)_

### Future Integration Work
- [ ] Once the dispatcher from `NotificationDispatcher` is ready, hook the web push channel into that abstraction for consistent multi-channel delivery.
- [ ] Expose a health/status endpoint (e.g., `/api/notifications/status`) that reports configured channels, last successful send, and failure counts for monitoring dashboards.

## 🧪 Suggested Testing
- Unit tests for the subscription persistence layer and retry logic.
- End-to-end flow verifying the Settings toggle accurately reflects backend state, including disabled scenarios.
- Manual QA of push delivery across at least two browsers and both localhost + staging domains.

