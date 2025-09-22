# Unified Site-wide Messaging Plan
_Last updated: September 22, 2025_

## Status snapshot (September 22, 2025)
- **Backend:** `backend/migrations/031_create_conversations_schema.sql` now includes the ULID generator, `conversation_*` tables keyed by `CHAR(26)` ULIDs, the `user_messaging_settings` view, and a new `user_blocks` table scaffold. Fresh services (`messagingPolicyService`, expanded `conversationService`, `/api/messages` routes) enforce DM policy + blocks, create DMs/groups, and emit initial `conversation.*` socket events while the legacy stack continues to serve production traffic.
- **Socket layer:** `setupChatHandlers` continues to broker `'chat:*'` events for send/history/read/edit/delete operations and emits per-room payloads instead of the planned `conversation.*` rooms.
- **Frontend:** The in-game `ChatContainer` consumes the legacy socket events and keys Redux state by `conversationType:conversationId`, so nothing is normalized around conversation IDs yet.

## Gap analysis & focus
- Storage work is staged but not deployed: the new `conversations` family of tables exists in migration form, yet runtime still reads and writes the legacy `chat_messages` + `unread_message_counts` schema until we execute and backfill.
- Socket namespaces/events remain under the legacy `'chat:*'` contract rather than the `/chat` namespace with `conversation.*` events outlined below.
- Frontend UX is limited to contextual chat drawers; the global drawer and `/messages` workspace are untouched, and no new slices/selectors exist for conversation normalization.

## Immediate next step (Phase 1 setup)
_Action taken:_ Audited the live implementation, drafted `031_create_conversations_schema.sql`, then expanded it to add the `generate_ulid()` helper, swap message identifiers to ULIDs, and create the `user_blocks` table alongside the messaging settings view.

_Next tasks:_
1. Add regression coverage (Jest) for `generate_ulid()`, `messagingPolicyService`, and the new conversation create/send paths before promoting to staging.
2. Build the `/api/messages/conversations` reader endpoints plus unread aggregation so the frontend can hydrate the inbox without legacy tables.
3. Wire `conversation.*` socket handlers on the server (and begin frontend listeners) while mirroring legacy `chat:*` events for compatibility.

## 1) Objectives & Scope
**Goals**
- Unify game, direct, and group chat behind one conversation model and API.
- Expose messaging everywhere via a global drawer and a full `/messages` workspace.
- Enforce privacy, blocking, and moderation on the server.
- Migrate legacy game chat and DMs with zero data loss while maintaining compatibility during rollout.
- Ship iteratively with feature flags and measurable acceptance criteria.

**Non-goals (for this project)**
- Mobile-native clients.
- Email or push digests beyond what already exists.
- Replacing the profanity filter or redesigning notifications outside chat needs.
- A new attachment pipeline (we only scaffold metadata).

## 2) System Overview (final choices)
- **Transport:** Socket.io (namespace `/chat`) with Redis adapter; rooms `conversation:{id}`.
- **API:** Express routes under `/api/messages` with `express-validator`, existing auth, and current rate limiting helpers.
- **Store:** PostgreSQL with a canonical conversation schema (defined below). Use ULIDs for message identifiers so ordering is stable.
- **Frontend:** Global chat drawer plus `/messages` split-pane UI. Redux normalized by conversation ID.
- **Privacy/Blocking:** Centralized service. Policies derived from `user_preferences` exposed through a view today with space to migrate into a table later.
- **Backwards compatibility:** Continue mirroring legacy `chat:*` events until cleanup in the final rollout phase. Legacy tables remain readable via views.

## 3) Data Model (finalized)
### Key merge decisions
- Keep the table name `conversation_messages` (versus `messages`) to avoid collisions.
- Surface privacy controls with a `user_messaging_settings` view built over `user_preferences` for now.
- Retain reactions and link previews in their existing tables and update their foreign keys.

### Tables
- **conversations** — `id` UUID PK, `kind` ENUM(`'game'|'direct'|'group'`), `title` (nullable), `created_by`, timestamps, `is_archived`, `is_read_only`, `game_id` (nullable), and `metadata` JSONB. Indexes on `(game_id)` and `(kind, created_at DESC)`.
- **conversation_members** — UUID PK plus `conversation_id`, `user_id`, `role` ENUM(`'owner'|'admin'|'member'`), `joined_at`, `last_read_message_id` (ULID `CHAR(26)`), `last_read_at`, `is_muted`, `is_pinned`, `shadow_muted`. Unique `(conversation_id, user_id)` and index `(user_id, is_pinned DESC, joined_at DESC)`.
- **conversation_messages** — ULID `CHAR(26)` PK, `conversation_id`, `sender_id` (nullable for system events), `body`, `json_metadata`, timestamps, `deleted_at`, `edited_at`, `shadow_muted`. Index `(conversation_id, created_at DESC)`, `(sender_id, created_at DESC)`, and GIN on `json_metadata`.
- **message_read_receipts** — Composite PK `(message_id, user_id)` plus `read_at`. Index on `(user_id, read_at DESC)`.
- **user_messaging_settings** — SQL view exposing `dm_policy`, `allow_group_invites`, and `show_online_status` derived from `user_preferences`. Start with direct-messaging defaults that mirror existing behaviour.
- **user_blocks** — Ensure unique `(blocker_id, blocked_id)` with timestamp `created_at`.
- **Existing tables** — `message_reactions` and `message_link_previews` keep their structure and simply rename the FK to `conversation_message_id`.

## 4) Migration Strategy (safe & reversible)
### Phase A — Schema & backfill (idempotent scripts)
- Create new tables and supporting view.
- Game chat backfill: create one conversation per historical room with `kind='game'` and copy membership from `game_players` and historical senders. Copy messages into `conversation_messages`, preserving IDs when possible or mapping otherwise.
- DM backfill: deterministically group by sorted sender/recipient pair, create `kind='direct'` conversations, and attach both members.
- Read state: when `unread_message_counts.unread_count` is zero, set `last_read_message_id` to the latest conversation message; otherwise leave it null so clients compute unread counts.
- Update reactions and link preview foreign keys to reference `conversation_message_id`.
- Maintain compatibility views for legacy unread counts during the rollout window.

### Phase B — Write switch (shadow mode)
- `chatService.sendMessage` delegates to the new `conversationService` while writing through to legacy `chat_messages` to keep analytics stable.
- Continue emitting legacy `chat:*` events in parallel with the new events until the frontend migration completes.

### Rollback plan
- Provide a reversible script that copies rows back into the legacy tables and restores original foreign keys. Ship it behind a feature flag and use it only in staging or emergencies.

## 5) Backend Services & API
### Services
- `conversationService.ts` — create DMs and groups, send messages (ULID IDs + optional metadata hooks), mark read (`last_read_message_id` + receipts), manage membership (invite/leave/kick/promote), and emit early `conversation.*` socket events alongside idempotent send via `clientMessageId`.
- `messagingPolicyService.ts` — central `assertCanStartDirectConversation`, `assertCanSendDirectMessage`, and `assertCanInviteToGroup` checks (blocks via `user_blocks`, `dm_policy`, group invite rules). Stubs remain for future relationship checks (friends/clans).
- `userBlockService.ts` — create/remove blocks, audit trails for admins, and cached lookups (Redis) for policy checks.

### REST (Express, `/api/messages`)
- `POST /conversations` — `{ kind, title?, memberIds[], metadata? }` (currently limited to `kind='group'`; policy + limit checks gate invites).
- `GET /conversations` — cursor pagination with filters (`unread`, `groups`, `kind:game|direct|group`).
- `GET /conversations/:id` — metadata + latest unread state.
- `POST /conversations/:id/members` — owner/admin can append members (`memberIds[]`), enforcing block/group invite policies and capacity caps.
- `POST /conversations/:id/leave` — self-serve exit for non-owners.
- `POST /conversations/:id/messages` — `body`, optional `replyToId`, optional `clientMessageId`, optional `metadata` blocks (link previews later).
- `GET /conversations/:id/messages` — keyset pagination on `(created_at, id)` with `before` and `limit=50`.
- `POST /conversations/:id/read` — `{ lastReadMessageId }` with receipts fan-out.
- `POST /typing` — `{ conversationId, state: 'start' | 'stop' }`.
- `POST /dm` — `{ targetUserId }` returning existing or newly created DM conversation (idempotent).
- `GET /search` — optional `q` and `conversationId` parameters; uses Postgres FTS or trigram search scoped to conversations the user can access.
- `GET`/`PUT /settings` — maps to `user_messaging_settings` and underlying preferences.
- `POST /blocks` and `DELETE /blocks/:blockedUserId` for block management.
- `GET /blocks` — current user’s block list for settings surfaces.
- `GET /blocks/admin` — admins only with pagination/filters to review block records when mediating disputes.

### Rate limiting
- Per conversation: 10 messages per 10 seconds per user.
- Global: 60 messages per minute per user.
- Reuse the existing rate limiter with keys `chat:${conversationId}:${userId}` and `chat:global:${userId}`.
- Hard cap message body length at 2 000 characters (reject with `{ code: 'MESSAGE_TOO_LONG' }`).
- Limit group conversations to 50 active members during Phase 1; emit `{ code: 'GROUP_LIMIT' }` when full.

## 6) Realtime (Socket.io)
- **Namespace:** `/chat`.
- **Rooms:** `conversation:{id}`; lazy join on conversation open, eager join on connect allowed for small conversation counts.
- **Server → Client events:** `message.new`, `message.updated`, `message.deleted`, `receipt.read`, `typing.start`, `typing.stop`, `conversation.created`, `conversation.updated`, `conversation.members.changed`, `conversation.members.added`, `presence.update` (includes `userId`, `state`, `lastActive`).
- **Client → Server events:** `message.send`, `message.edit`, `message.delete`, `typing.start`, `typing.stop`, `receipt.read`, `conversation.create`, `conversation.members.update` (new `conversation:*` sockets still to be wired up; legacy `chat:*` remains active during transition).
- **Compatibility:** keep emitting and handling legacy `chat:*` events until the rollout reaches the cleanup phase.

## 7) Privacy, Blocking, Moderation (server-enforced)
- Reject self-DMs (HTTP 400).
- Check bi-directional blocks before creating or sending DMs (HTTP 403). Blocks mute traffic both directions (DM + shared group visibility) until the blocker or an admin removes the record.
- Enforce `dm_policy` (`everyone`, `friends_only`, `no_one`). If `friends_only`, require verified friendship or the interim mutual-follow rule and document behaviour.
- Respect `allow_group_invites`; return structured errors `{ code: 'INVITE_BLOCKED', policy: 'friends_only' }` when constraints fail.
- Honor read-only conversations by restricting posting to owners/admins.
- Reuse the current profanity filter and store `{ flagged: true }` in `json_metadata` when triggered.
- `shadow_muted` members send messages that only echo to themselves.
- Blocks do not expire automatically. Use admin tooling for overrides; log admin unblock actions to `audit_logs`.

## 8) Frontend
### State (Redux)
- `entities.conversations` keyed by conversation ID with metadata, unread counts, pinned/muted state.
- `entities.messages` keyed by message ID plus per-conversation ordered arrays.
- `ui` slice for `activeConversationId`, `drawerOpen`, `filters`.
- Thunks: `fetchInbox`, `fetchMessages`, `sendMessage`, `updateReadReceipt`, `searchMessages`.

### Global Chat Drawer
- Launcher in global navigation with aggregated unread badge.
- Drawer contains `ConversationList` (All/Unread/Groups, virtualized) and `QuickThread` (last 50 messages, `Shift+Enter` for newline).
- Show presence dots and typing indicators inline.
- Mobile experience is full-screen slide-over with focus trap and respect for `prefers-reduced-motion`.

### `/messages` Workspace
- Split-pane layout (sidebar list plus thread) with mobile toggles.
- Thread view supports grouped bubbles, day separators, infinite scroll upwards, reactions, copy link, edit, delete.
- Members panel shows roles, invite/remove actions, per-conversation settings (mute, pin, leave, archive).
- Supports in-thread search and jump-to-hit navigation.
- Deep links `/messages/:conversationId?` open specific threads.

## 9) Notifications & Unread
- Server includes unread deltas on each `message.new` event, computed against `last_read_message_id`.
- `receipt.read` updates `conversation_members` and echoes to participants to power read receipts.
- Keep current push notifications for DMs and generalize to any conversation after launch.

## 10) Testing, Load, Observability
### Backend (Jest)
- Conversation creation (DM/group) and policy matrix coverage (blocks, privacy).
- Message send/edit/delete flows, unread math, and receipts.
- REST validation for authorization errors (403/404) and rate limiting (429).
- Socket handlers with mocked Redis and idempotent `clientMessageId`.

### Frontend (Vitest/RTL)
- Reducers/selectors for unread counts and message insertion.
- Drawer and `/messages` flows, including search and jump behaviours.

### Integration (Playwright)
- Cross-tab realtime validation: send in one tab, receive in another, verify receipts and unread counts.

### Monitoring
- Structured logs include `conversationId` and `userId`.
- Optional Prometheus metrics for message send rate, error rate, and policy rejections.

## 11) Rollout (feature-flagged)
- **Phase 1 — Schema & Services (Backend):** apply migrations, ship `conversationService` behind `MESSAGING_V2`, backfill game and DM conversations in staging, validate counts.
- **Phase 2 — Socket Upgrade:** add new events while emitting legacy `chat:*`, connect presence/typing via Redis with TTL keys.
- **Phase 3 — Policy Enforcement:** enable DM policy and block rules server-side, track rejection reasons.
- **Phase 4 — Frontend Groundwork:** Redux normalization plus basic drawer listing (no compose).
- **Phase 5 — Full Drawer:** compose, send, unread, typing, receipts; enable for staff first.
- **Phase 6 — `/messages` Workspace:** thread view, search, member management, settings; broaden beta.
- **Phase 7 — Cleanup:** remove legacy `chat:*`, drop `unread_message_counts` (maintain compatibility view if external readers remain), retire write-through to `chat_messages`.

## 12) Open Questions (resolve early)
- Source of truth for friendships/clans used in `friends_only` policies.
- Final decision on ULID vs. UUID for messages (proposal: ULID) while keeping conversations/members on UUID.
- Migration window strategy: short maintenance window vs. batched resumable backfill (recommended: batched with progress markers).
- Presence source of truth: confirm Redis adapter operates in production and define fallback behaviour for single-node environments.

## 13) Acceptance Criteria (per phase)
- **P1:** DB migrations apply cleanly; staging backfill yields the same message counts per room (±0); `GET /conversations` returns conversations for seeded users.
- **P3:** DM to a user with `dm_policy='no_one'` is rejected with `{ code: 'DM_POLICY' }`; block tests pass in CI.
- **P5:** Drawer sends and receives in real time; unread badge increments/decrements correctly in multi-tab testing.
- **P6:** `/messages` loads 1k-message threads with <200 ms incremental fetch and <60 ms Redux reduce time on a mid-spec laptop.

## Progress log
- **2025-02-21:** Catalogued the current backend service, socket handlers, and frontend chat container that power the legacy experience, then captured the schema/service tasks needed to kick off Phase 1 of the unified messaging rollout.
- **2025-09-22:** Drafted the Phase-1 database migration and preference view (`031_create_conversations_schema.sql`) so schema work can move into execution once ULID generation and blocklist compatibility decisions land.
- **2025-09-22:** Added the `generate_ulid()` helper, migrated message identifiers to ULIDs, and created the `user_blocks` table scaffold so policy enforcement has backing storage.
- **2025-09-22:** Landed `messagingPolicyService`, group-capable `conversationService`, and initial `/api/messages/conversations` routes with `conversation.*` socket emissions to start phasing in the new messaging backend.
- **2025-09-22:** Implemented backend scaffolding for blocks (`/api/messages/blocks*`) and bootstrapped `conversationService` with DM creation plus initial message send/list endpoints.
