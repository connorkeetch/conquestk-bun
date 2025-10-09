# Unified Clan System Plan

*Last updated: Sept 20, 2025*

---

## 0) Snapshot & Intent

**Goal:** Merge the two submitted plans into a single, build-ready specification that matches the current stack (Express + PostgreSQL + Socket.io + Redis) and supports a staged launch with low risk.

**Baseline in prod today:**

* Community Hub shows leaderboards; **Clans tab is disabled** (placeholder only).
* Backend exposes users/profiles/player stats; Socket.io & Redis available; BullMQ workers scaffolded; feature flags exist.
* We will reuse existing user services/types to avoid duplicating account logic.

---

## 1) Product Objectives & Success Metrics

**North-star outcomes**

* Increase **weekly returning players** who are in clans by **≥25%**.
* Within 3 months, **≥40% of ranked games** include **≥2 clanmates** on the launch map pool.
* **Clan retention**: ≥60% of members retained across a 30‑day window.

**Supporting KPIs**

* Active clans per week; median/95p clan size.
* Join funnel conversion (view → apply → accepted → first match with clan tag).
* # clan‑coordinated matches / week; war participation rate; mission completion rate.
* Time to first social action post‑join (chat/announcement upvote/apply to war).

---

## 2) Personas (for UX acceptance criteria)

* **Casual Strategist**: low friction join, clear value via discovery & onboarding quests.
* **Competitive Captain**: recruiting tools, scrim/war scheduling, performance analytics.
* **Community Moderator**: roster curation, audit history, rapid removals.
* **Solo Player**: read‑only previews and obvious join criteria.

---

## 3) Feature Pillars (scope map)

1. **Clan Identity** — creation, branding (name, tag, crest/banner, description), privacy & recruitment policy, cosmetic unlocks.
2. **Membership Lifecycle** — apply/invite/approve, roles & permissions (Leader/Officer/Member/Recruit), probation, inactive cleanup.
3. **Progression & Stats** — clan XP & level, contribution tracking, seasonal ladders, shared quests/objectives.
4. **Competitive Play** — clan queues, scheduled wars/tournaments, war scoring & history.
5. **Communication** — announcements + optional real‑time chat; email/in‑app digests.
6. **Moderation & Safety** — reports, audit/event log, rate limits, permission guardrails.
7. **Discoverability** — Community Hub directory, filters (region, size, activity), featured modules.

---

## 4) UX Surfaces

* **Community Hub**: replace placeholder with discovery (search/filters, featured, recommended). If member, show personal clan summary.
* **Clan Detail (/clans/\:slug)**: overview stats, roster, recent activity, announcements, CTA (apply/join) + officer quick actions.
* **Management Console** (Leader/Officer): branding, requirements, invites/applications, roles, strike history, integrations.
* **Applications Queue**: filtered list, templated replies, optional interview match scheduling.
* **War Dashboard**: schedule, ruleset, scoreboard, match submissions.
* **Member Utilities**: contribution breakdowns, objectives progress, badges.
* **Notifications Panel**: invites, approvals, announcements, wars, reminders.
* **Responsive**: all pages mobile‑friendly.

---

## 5) Data Model (PostgreSQL, UUID PKs)

> **Naming merge:** We standardize on **snake\_case**; we keep both concepts where plans differed and map aliases (in parens) for clarity.

### 5.1 Core Tables

* **clans** — `id, owner_user_id, name, tag (unique, CI), slug (unique), motto, description, crest_asset_url, banner_asset_url, recruitment_policy (open|application|invite), recruitment_status (active|closed), minimum_rank, auto_accept_thresholds JSONB (e.g., min_elo), language, region, time_zone, privacy (public|hidden), total_xp, level, created_at, updated_at, deleted_at`
* **clan\_roles** *(optional/custom ranks supported)* — `id, clan_id (FK), name, permissions JSONB, hierarchy_rank, display_order`
* **clan\_members** — `id, clan_id, user_id, role_id (nullable if enum), joined_at, probation_until, last_active_at, status (active|banned|left|kicked), last_role_change_at, contribution_xp, contribution_matches`
* **clan\_applications** — `id, clan_id, user_id, status (pending|accepted|rejected|withdrawn), message, reviewed_by, reviewed_at, created_at`
* **clan\_invitations** (aka *clan\_invites*) — `id, clan_id, invited_user_id, invited_by, token, expires_at, status`
* **clan\_announcements** (aka *clan\_messages bulletin*) — `id, clan_id, author_user_id, title, body_markdown, pinned, created_at, expires_at`
* **clan\_activity\_log** (aka *clan\_events*) — `id, clan_id, actor_user_id, action_type (member_join|promotion|war_start|war_win|…), metadata JSONB, target_id, created_at`
* **clan\_wars** — `id, clan_id_a, clan_id_b, season_id, status (scheduled|active|completed), scheduled_start, scheduled_end, ruleset JSONB (ranked, map_pool, win_conditions), score_json, rewards JSONB`
* **clan\_war\_matches** — `id, clan_war_id, game_id, map_id, participants JSONB, result (win|loss|draw), points_awarded, replay_url`
* **clan\_objectives** (aka *clan\_weekly\_objectives|missions*) — `id, clan_id, objective_type, target_value, progress_value, start_at, end_at, reward JSONB`
* **clan\_chat\_messages** *(Phase 4+ if real‑time)* — `id, clan_id, user_id, body, created_at, edited_at, deleted_at, deleted_by`
* **user\_clan\_preferences** — `user_id, allow_auto_invites, notification_settings JSONB`

### 5.2 Indexing & Constraints

* Unique: `clans.tag` (CI), `clans.slug`.
* Search: trigram/FTS on `clans.name`, `clans.tag`, `clans.description`.
* Common: `clan_members (user_id)`, `clan_applications (status, clan_id)`, `clan_activity_log (clan_id, created_at DESC)`.
* Membership: **enforce single active clan per user** via partial unique index `(user_id) WHERE status='active'`.
* Deletion: soft‑delete most; retain logs; for logs set `clan_id` NULL on cascade.

---

## 6) Services & API Surface

### 6.1 Service Layer

* `clanService` — CRUD, branding, recruitment, stats aggregation (with `eloService`), caching.
* `membershipService` — apply/invite/accept/promote/demote/kick, probation, inactivity cleanup.
* `progressionService` — XP/level curves, contribution calculators, objective rotation.
* `warService` — schedule, scoring, match ingestion, outcomes, rewards.
* `announcementService` — bulletin CRUD, pin/unpin, expiry.
* `auditService` — append to `clan_activity_log` with actor & IP/UA.
* `clanChatService` (Phase 4+) — rooms, moderation, persistence.

### 6.2 REST Endpoints (merged)

> We standardize on **slug** in URLs; handlers accept id or slug via lookup.

* `GET /api/clans` — list & filters (search, region, min\_members, recruitment\_status, activity); cursor pagination.
* `POST /api/clans` — create (1 per account / 24h; verified email).
* `GET /api/clans/:slug` — details (roster, stats, announcements, recent wars, activity summary).
* `PATCH /api/clans/:slug` — update branding/settings (Leader/Officer).
* `DELETE /api/clans/:slug` — disband (Leader only; soft delete & notify).
* Applications: `POST/GET/PATCH /api/clans/:slug/applications`.
* Invitations: `POST /api/clans/:slug/invitations`, `POST /api/clans/invitations/:token/accept`, `DELETE /api/clans/:slug/invitations/:id`.
* Members: `POST /api/clans/:slug/members/:userId/{promote|demote|remove}`.
* Wars: `GET/POST/PATCH /api/clans/:slug/wars` (schedule, report, list).
* Objectives: `GET /api/clans/:slug/objectives`, `PATCH /api/clans/:slug/objectives/:id/progress` (system), `POST /api/clans/:slug/objectives/:id/claim`.
* Activity: `GET /api/clans/:slug/activity`.
* Users: `GET /api/users/me/clan`.
* Leaderboards: `GET /api/clans/leaderboard`.

### 6.3 Real‑time (Socket.io)

* Rooms per clan: `clan:{id}`.
* Events: `clan:joined`, `clan:left`, `clan:memberUpdated`, `clan:announcement`, `clan:chat:{new|edited|deleted}`, `clan:war:update`, `clan:objective:update`.

### 6.4 Background Jobs (BullMQ)

* Invitation expiry; probation checks; objective rotation & weekly resets; seasonal snapshots; war scheduling & timeouts; email/in‑app digests.

### 6.5 Security & Rate Limits

* Creation: max 1 clan / 24h / account; verified email required.
* Inputs: profanity & length limits (name ≤32, description ≤1024, announcement title ≤80).
* Chat: 5 msgs / 10s / user; announcement edit cooldown.
* Server‑side permission guards powered by `clan_roles.permissions`.

---

## 7) Game Integration

* **Match End Hook**: update clan XP, contribution, ELO; push objective progress; emit `clan:objective:update` and `clan:war:update`.
* **Lobby**: optional **Clan Queue** flag; enforce same‑clan slots; matchmaking uses clan‑MMR.
* **Season Resets**: align with ranked seasons; snapshot to seasonal tables.
* **Objectives**: generator ties to map metadata (e.g., "Win on naval maps").

---

## 8) Moderation, Safety & Compliance

* `clan_reports` table: reporter, target\_type (member|announcement|chat), reason, resolution\_status.
* Moderation UI: flag triage; escalate to global admins.
* Auto‑hide on N validated reports in time window.
* Log all admin actions to activity log with IP/UA.

---

## 9) Analytics & Telemetry

* Events: `ClanCreated`, `ClanApplied`, `ClanInviteSent`, `ClanJoined`, `ClanAnnouncementPosted`, `ObjectiveCompleted`, `WarScheduled`, `WarResultReported`.
* Daily snapshots for member counts, ELO, XP, war results.
* Expose leaderboards via API; internal dashboards for top clans & retention curves.

---

## 10) Notifications & Messaging

* In‑app inbox + toasts for invites, approvals, announcements, war updates.
* Email digests (opt‑in): weekly clan recap, war reminders, objectives.
* Transport‑agnostic design for future push/mobile.
* Optional Discord webhooks for leaders.

---

## 11) Operational Concerns

* **Caching**: Redis cache of clan profiles & leaderboards (TTL 5–10 min). Bust on updates.
* **Search**: Trigram/FTS on name/tag; consider a simple ranking by activity.
* **Media**: Reuse asset pipeline; size/type validation; S3/Railway; thumbnails.
* **Horizontal scale**: Socket.io Redis adapter already present.
* **Privacy/GDPR**: data export/delete; respect soft‑delete semantics.

---

## 12) Rollout Plan (merged milestones with acceptance criteria)

### Phase 0 — Foundations (Schema & Services)

**Deliverables**: Migrations for core tables; `clanService` + membership basics; CRUD endpoints; auth/session payload includes clan membership; unit/integration tests.
**AC**: Create → Apply → Approve cycle verified via API; clan appears in `/api/clans` with roster; cache warms; logs written.

### Phase 1 — Frontend MVP (Discovery & Detail)

**Deliverables**: Community Hub list + detail pages; creation wizard; applications & join/leave flows; announcements (bulletin only); responsive UI; accessibility pass.
**AC**: A new player can discover a clan, apply, get accepted, see announcements & roster on web & mobile widths.

### Phase 2 — Progression & Objectives

**Deliverables**: Clan XP & levels; contribution tracking; rotating objectives with scheduled resets; notifications/digests.
**AC**: Completing matches increments clan XP & objective progress; weekly reset rotates objectives; digests sent.

**Progress – Oct 18, 2025**

* Game archival now aggregates member contributions: `gameService.finalizeCompletedGame` calls into the clan progression service so finished matches automatically award XP, flag wins, and advance objective counters for every active clan member in the lobby.
* A new `clan:progress` socket event fans updates to `clan:{clanId}` rooms, keeping the React detail view in sync without forcing a refresh. Payload includes XP deltas, placement context, and objective tick marks for simple UI hydration.
* Frontend clan pages subscribe to the socket channel and patch the local clan state, bumping contribution totals, progression bars, and objective progress in real time.
* XP formula (v1): 400 base per match +250 for winners, +placement bonus (150/100/50 for top three) +5 per territory held (capped at +150). This keeps caps predictable while rewarding map control; tune once clan ladders expose real data.
* Follow-up: expose contribution history in the activity feed and surface the new websocket event in the shared SDK so mobile clients can subscribe once the app shells land.

### Phase 3 — Competitive Layer

**Deliverables**: Wars schema + APIs; match reporting pipeline; war dashboard; leaderboards; rewards distribution.
**AC**: Two test clans can schedule a war, submit/report matches, and see scores/leaderboards update.

### Phase 4 — Communication & Moderation

**Deliverables**: Real‑time clan chat (optional if deferred), pinned announcements, moderation dashboards, reporting workflow, enhanced audit trail.
**AC**: Rate‑limited chat with moderation actions logged; flagged content auto‑hides after threshold.

### Phase 5 — Polish & Scale

**Deliverables**: Custom roles/permissions; performance tuning; caching; recommended clans; cosmetics & sponsorship hooks; public widgets.
**AC**: P95 API latency on clan endpoints <200ms under expected QPS; discovery CTR up vs. baseline.

---

## 13) Engineering Notes & Patterns

* Prefer **cursor pagination** for lists.
* Expose **idempotent** endpoints for war result reporting.
* Consolidate permission checks in a helper mapping `role.permissions → action` to avoid drift.
* Use **partial unique indexes** to enforce business rules (e.g., single active membership).
* Contract tests for Socket.io events; load test chat & matchmaking.

---

## 14) Open Questions

1. Max clan size at launch (proposal: 50; levels could unlock higher caps).
2. War rulesets & matchmaking integration specifics.
3. Creation approval workflow (auto vs. admin‑review) and name/tag reservation policy.
4. Storage retention policies for chat and logs (90 days?).
5. Monetization hooks scope for v1 (cosmetics, boosts, sponsorships).

---

## 15) Next Steps (2‑week sprint plan)

* Break Phase 0 into tickets: schema migration, service scaffolding, API contracts, caching layer, tests.
* Feature flag scaffolding was used during rollout; clans are now generally available and no longer gated by `clans_enabled`.
* Design sprint for Community Hub & Clan Detail.
* Seed scripts for demo clans; fixtures for wars/objectives.
* Analytics taxonomy finalized before implementation.
