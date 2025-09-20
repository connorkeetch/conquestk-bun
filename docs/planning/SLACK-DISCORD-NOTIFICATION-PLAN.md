# Slack & Discord Notifications — Unified Plan
_Last updated: September 20, 2025_

## 🎯 Objectives
Provide a clear, incremental path to deliver automated notifications from ConquestK into Slack channels and Discord servers without disrupting existing workflows. Centralize channel delivery logic so future surfaces (email, SMS, in-game inbox, web push) plug in with minimal friction. Keep configuration environment-driven and secrets out of the codebase.

## ✅ Use Cases
- Alert Connor/admins when production errors exceed a threshold.
- Post key community events (e.g., new map published, tournament starting).
- Enable ad-hoc operational announcements via scripts or an admin UI.

## 🧭 Current State & Gaps
- **Web push only:** `backend/src/services/notificationService.ts` handles browser push (VAPID) and stores subscriptions in memory.
- **Admin alerts:** `mapWorkflowService` writes to Postgres but real-time delivery remains TODO.
- **No reusable abstraction:** there are no external channel integrations or config schema yet.
- **Operational risk:** moderators rely on polling dashboards for incidents.

## 🧱 Architecture
### 1. Dispatcher & Channel Interface
Create `backend/src/services/NotificationDispatcher.ts` that orchestrates multiple channels through a shared interface.

```ts
interface NotificationChannel {
  send(event: NotificationEvent): Promise<NotificationResult>;
  readonly name: 'webpush' | 'slack' | 'discord' | string;
}
```

The dispatcher fans out events based on `NOTIFICATION_CHANNELS` and per-channel enable flags. One channel’s failure must not block others—apply graceful degradation and structured logging.

### 2. Canonical Event Schema
Create `shared/notifications.ts` with shared types.

```ts
type Severity = 'info' | 'warning' | 'critical';

export interface NotificationEvent {
  id: string;                // uuid
  type: string;              // e.g., 'game.turn_started'
  title: string;
  body: string;              // markdown-safe
  severity: Severity;
  context?: Record<string, unknown>;
  recipients?: {
    userIds?: string[];
    roles?: string[];
  };
  cta?: Array<{ label: string; url: string }>;
  createdAt?: string;        // ISO
}

export interface NotificationResult {
  channel: string;
  ok: boolean;
  id?: string;               // provider message id
  error?: string;
  retryAfterMs?: number;
}
```

### 3. Channel Implementations
Add `backend/src/services/channels/`:
- `WebPushChannel` — wrap existing logic to preserve backwards compatibility.
- `SlackBotChannel` — preferred, uses `chat.postMessage` with Blocks.
- `SlackWebhookChannel` — fallback for simple text.
- `DiscordWebhookChannel` — supports embeds and optional `thread_id`.

Outbound HTTP calls should use native `fetch` (Node 22+) or `node-fetch`, include retries with jittered exponential backoff (up to three attempts), respect `Retry-After` on 429s, and implement a circuit breaker per channel (`open` after N failures, half-open after cooldown). Log with `logger.child({ channel, eventId, type, severity })`.

### 4. Configuration & Secrets
Configuration is environment-driven (Railway + local `.env.*`). Example variables:

```
NOTIFICATION_CHANNELS=webpush,slack,discord
ENABLE_EXTERNAL_NOTIFICATIONS=false

# Slack (choose one or both, bot preferred)
SLACK_NOTIFICATIONS_ENABLED=true
SLACK_BOT_TOKEN=xoxb-***
SLACK_DEFAULT_CHANNEL=#operations
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Discord
DISCORD_NOTIFICATIONS_ENABLED=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
DISCORD_USERNAME=ConquestK Bot
DISCORD_THREAD_ID=optional

# Optional: multiple destinations
SLACK_ADDITIONAL_CHANNELS=#community,#devops
DISCORD_WEBHOOK_URLS=https://...1,https://...2
```

Principles: least privilege, rotation runbook, never log secrets, and per-environment isolation (different webhooks per environment).

### 5. Formatting Helpers
- `formatSlackMessage(event)` → Slack blocks and thread support with `<@U123>` mentions.
- `formatDiscordMessage(event)` → Discord embeds with severity-based colour.
- Provide shared fallbacks for plain text when rich formatting fails.

### 6. Trigger Points (Producers)
Start with CLI/manual hooks and expand over time.
- Error handler (critical alerts).
- `mapWorkflowService` (submission/approval/rejection).
- Gameplay events (season start, turn start, eliminations).
- Socket/server events as needed.

### 7. Optional Queueing
- **Phase 1:** fire-and-forget in the background (non-blocking).
- **Phase 4+:** Redis-backed queue or the existing job runner for burst control and at-least-once retries.

## 🔧 Implementation Plan
- **Phase 0 — Discovery (0.5–1 day):** confirm priority events and monitoring pipeline, decide Slack auth path (bot vs webhook), audit script/CI paths for safe manual triggers.
- **Phase 1 — Foundations (Backend only, 1–2 days):** add shared types, implement dispatcher and channel interface, wrap WebPush, implement Slack/Discord channels, add retries/backoff/circuit breakers, introduce `ENABLE_EXTERNAL_NOTIFICATIONS=false` for dark launch, add structured logs.
- **Phase 2 — Event Wiring (1–2 days):** refactor `notificationService` to delegate to the dispatcher, emit typed events from `mapWorkflowService`, `gameService`, and key socket handlers, provide CLI (`npm run notify:test -- --channel=slack|discord|all --message="..."`), create unit tests with `nock`, and an integration test using a local webhook receiver.
- **Phase 3 — Preferences & Admin UI (1–2 days):** add `/admin/settings/notifications` to show configured channels, last deliveries, and a Send Test button; toggle providers per environment; extend `user_preferences` for future per-user routing (disabled initially); update frontend settings copy to mention Slack/Discord feed.
- **Phase 4 — Deployment, Monitoring, & Scale (1–2 days):** update docs and `.env.example`, add a health endpoint (`GET /api/notifications/status`), expose metrics (deliveries, failures, latency, breaker state), and optionally move to a queue if volume increases.

## 🧪 Testing Strategy
- **Unit:** mock HTTP, verify formatting, headers, retries, and rate-limit handling plus breaker transitions.
- **Integration:** end-to-end flow from event producers to a local webhook sink.
- **Manual QA:** CLI smoke tests ensuring staging webhooks render correctly (Slack blocks, Discord embeds).
- **Load:** burst 100–500 events, confirm no request blocking and rate-limit compliance.

## 🚀 Rollout Steps
- Merge foundation work with the feature flag disabled.
- Deploy to staging with test webhooks; validate dispatch and formatting.
- Enable the flag for internal/admin events and observe for 48 hours.
- Gradually enable gameplay events; monitor Slack/Discord rate limits and noise.
- After stabilization, expose admin UI toggles and document runbooks.

## 🔐 Security & Compliance
- Store tokens/webhooks in Railway; use least privilege (Slack scopes `chat:write`, `chat:write.public` if required).
- Rotate credentials quarterly and document owner/process.
- Never log secrets; scrub URLs (keep host plus last four characters).
- Respect provider rate limits (HTTP 429 `Retry-After`).
- Separate webhooks per environment to prevent cross-environment leakage.
- Restrict CLI usage to trusted CI or authenticated local developers.

## 📚 Documentation & Handoff
- Update `docs/DEPLOYMENT.md` with setup steps, env vars, rotation, rate limits, and troubleshooting.
- Update `docs/LOGGING-STANDARDS.md` with escalation paths and severity mapping.
- Add README quickstart, CLI usage, and examples.
- Extend `.env.example` with all relevant variables and commentary.

## ⚠️ Risks & Mitigations
- **Webhook leakage:** rely on secrets management, URL redaction, and rotation drills.
- **Rate limiting or format drift:** channel-specific formatters plus retries and breakers; consider canary channels in staging.
- **Fan-out failures:** per-channel isolation ensures the dispatcher never throws upstream; rely on logs and metrics for follow-up.
- **Message noise:** start with high-signal events, add filters/thresholds, and plan for digesting/scheduling later.

## 🔭 Future Enhancements
- Message templates and localization.
- Digest mode and scheduling to reduce noise.
- Slack interactivity (buttons, slash commands).
- Additional channels (email/SMS) via the shared channel interface.
- Per-user or role routing tied to notification preferences.

## ❓ Open Questions
- Do we want per-game Discord channels versus a single community feed?
- Should moderators control event→channel mapping without redeploys (DB-configured routing)?
- Which gameplay events are Phase-1 must-haves versus Phase-2 nice-to-haves?

## 🗂 Suggested File/Directory Layout
- `shared/notifications.ts`
- `backend/src/services/NotificationDispatcher.ts`
- `backend/src/services/channels/WebPushChannel.ts`
- `backend/src/services/channels/SlackBotChannel.ts`
- `backend/src/services/channels/SlackWebhookChannel.ts`
- `backend/src/services/channels/DiscordWebhookChannel.ts`
- `backend/src/scripts/notify.ts`
- `docs/DEPLOYMENT.md`
- `docs/LOGGING-STANDARDS.md`
- `.env.example`

Next step: confirm Slack auth path (bot vs webhook) and prioritize the event list, then begin Phase 1.
