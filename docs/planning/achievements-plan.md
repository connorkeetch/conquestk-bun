> **Note:** This document outlines the original plan for the achievement system, which has since been implemented. It is preserved here as a historical reference for design decisions.
>
> ---
> last_reviewed: 2025-10-21
---

# Achievement System Plan

## Purpose & scope
- Define the first iteration of player achievements for the ConquestK profile experience.
- Cover requirements across backend services, frontend UI/UX, data modeling, operations, and analytics before implementation begins.
- Provide implementation phases so we can deliver value incrementally while keeping room for future badge art and live events.

## Product goals
1. Reward players for diverse play styles and long-term engagement.
2. Surface achievements on the profile page alongside the existing "Coming Soon" placeholder.
3. Enable future extensibility for seasonal or limited-time achievements without code redeploys.
4. Provide actionable telemetry that highlights which achievements drive retention.

## Success metrics
- 80% of active players unlock at least one achievement within their first three completed games.
- Daily active players view the profile achievements card with < 200 ms added render cost.
- Telemetry shows < 1% mismatch between recorded events and achievement unlocks after 30 days (data accuracy).

## Terminology
- **Achievement**: Player-facing reward with title, description, unlock condition, XP (optional), and badge asset.
- **Progress event**: Game or session metric emitted by the backend that contributes toward an achievement.
- **Badge**: Visual asset (SVG/PNG) shown when the achievement is unlocked. Initial version will use placeholder art.

## Achievement catalog (v1)
Organize achievements into categories for UI grouping. Provide slug identifiers and unlock conditions. Badge assets referenced as placeholder filenames (actual art to be delivered later).

### Core Gameplay
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `world-eater` | World Eater | Win first multiplayer game | `badge-world-eater.svg` |
| `loyal-opposition` | Loyal Opposition | Lose five games consecutively without abandoning | `badge-loyal-opposition.svg` |
| `cartographers-curse` | Cartographer's Curse | Complete matches on 10 distinct maps | `badge-cartographers-curse.svg` |
| `relentless-march` | Relentless March | Capture 20 territories in a single turn | `badge-relentless-march.svg` |
| `defender-free-ish` | Defender of the Free (ish) World | Win while holding exactly one territory for final three turns | `badge-defender-free-ish.svg` |

### Game Mode Specialists
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `crown-jewel` | Crown Jewel | Win a Capitals game while retaining your capital | `badge-crown-jewel.svg` |
| `coup-de-grace` | Coup de Grâce | Eliminate another player's capital in Capitals | `badge-coup-de-grace.svg` |
| `quiet-assassin` | Quiet Assassin | Win Assassination after eliminating only assigned target | `badge-quiet-assassin.svg` |
| `collateral-damage` | Collateral Damage | Win Assassination after eliminating non-target first | `badge-collateral-damage.svg` |
| `classic-conqueror` | Classic Conqueror | Achieve total domination in Normal mode | `badge-classic-conqueror.svg` |

### Strategic Styles
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `turtle-emperor` | Turtle Emperor | Win with ≤3 offensive actions per 10 turns | `badge-turtle-emperor.svg` |
| `speed-demon` | Speed Demon | Take three consecutive turns with decision time ≤2s | `badge-speed-demon.svg` |
| `backstabber-deluxe` | Backstabber Deluxe | Break alliance and gain territory same turn | `badge-backstabber-deluxe.svg` |
| `diplomat-of-doom` | Diplomat of Doom | Trigger two opponents to fight via diplomacy tools | `badge-diplomat-of-doom.svg` |

### Endurance & Absurdity
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `night-owl` | Night Owl | Finish game after 3 a.m. local time | `badge-night-owl.svg` |
| `marathoner` | Marathoner | Participate in game lasting ≥100 turns | `badge-marathoner.svg` |
| `button-masher` | Button Masher | Click End Turn 1000 times (career total) | `badge-button-masher.svg` |

### Humorous & Satirical
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `early-investor` | Early Investor | Be eliminated within first 10 minutes | `badge-early-investor.svg` |
| `strategic-consultant` | Strategic Consultant | Spectate more matches than won (career total) | `badge-strategic-consultant.svg` |
| `worlds-okayest-general` | World's Okayest General | Maintain exactly 50% win rate over 20 games | `badge-worlds-okayest-general.svg` |
| `collateral-beauty` | Collateral Beauty | Lose capital but still win Capitals game | `badge-collateral-beauty.svg` |

### Social & Community
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `friendly-fire` | Friendly Fire | Eliminate a tagged friend | `badge-friendly-fire.svg` |
| `influencer-of-anarchy` | Influencer of Anarchy | Recruit 5 players to custom lobby | `badge-influencer-of-anarchy.svg` |
| `mute-button-mvp` | Mute Button MVP | Get muted by three opponents in one match | `badge-mute-button-mvp.svg` |

### Dark Humor
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `democracy-delivered` | Democracy Delivered | Capture first sector via overwhelming attack | `badge-democracy-delivered.svg` |
| `peace-was-never-option` | Peace Was Never an Option | Make at least one attack every turn | `badge-peace-was-never-option.svg` |
| `collateral-management-specialist` | Collateral Management Specialist | Eliminate ally while "helping" them | `badge-collateral-management-specialist.svg` |

### Hidden / Ridiculous
| Slug | Title | Unlock condition | Badge placeholder |
| --- | --- | --- | --- |
| `404-strategy-not-found` | 404 Strategy Not Found | Lose without any successful conquest | `badge-404-strategy-not-found.svg` |
| `map-tourist` | Map Tourist | Play 50 unique maps without a win | `badge-map-tourist.svg` |
| `taxation-without-representation` | Taxation Without Representation | Hold a sector while owning ≤5 territories | `badge-taxation-without-representation.svg` |
| `ctrl-alt-del` | Ctrl+Alt+Del | Disconnect three times in one match but win | `badge-ctrl-alt-del.svg` |

## Data model considerations
- **Table: `achievement_definitions`**
  - `slug` (PK), `category`, `title`, `description`, `badge_asset`, `points`, `is_hidden`, `created_at`, `updated_at`.
  - Store in database to allow live updates without redeploys. Maintain seed script in backend migrations.
- **Table: `player_achievements`**
  - `player_id` (FK), `achievement_slug` (FK), `unlocked_at`, `progress_value`, `progress_max`, `source_match_id`.
  - Composite PK on (`player_id`, `achievement_slug`).
- **Table: `achievement_progress_events`** (optional for analytics/auditing)
  - `id`, `player_id`, `achievement_slug`, `event_type`, `event_payload` (JSONB), `created_at`.
  - Retention period 30 days; archive or aggregate nightly.
- Consider caching achievement definitions in Redis for faster lookup.
- Use shared types in `shared/src/achievements.ts` for cross-package consistency.

## Backend requirements
1. **Definition service**
   - Load definitions from DB on startup and expose typed interface.
   - Admin toggle to refresh definitions without restart (future CLI route).
2. **Progress engine**
   - Hook into game lifecycle events (match start/end, turn resolution, diplomacy changes).
   - Evaluate unlock conditions incrementally; update `player_achievements` within transactional boundaries.
   - Support incremental progress fields (e.g., Button Masher).
   - Emit socket.io events `achievement:progress` and `achievement:unlocked`.
3. **API endpoints**
   - `GET /api/players/:id/achievements`: summary list with progress and unlock dates.
   - `GET /api/achievements`: public definitions for frontend caching.
   - `POST /api/achievements/sync`: internal endpoint for admin refresh (protected).
4. **Telemetry**
   - Publish analytics events (Amplitude/Snowplow) when progress increments and unlocks occur.
5. **Rate limiting & fraud prevention**
   - Validate inputs, ensure server-authoritative unlock logic.
   - Flag suspicious patterns (e.g., repeated disconnect wins) via background job.

## Frontend requirements
1. **Profile page integration**
   - Replace "Coming Soon" area with Achievements card.
   - Sections by category with collapsible panels if >4 achievements per category.
   - Display badge placeholder (grayscale) until unlocked; animate color reveal when unlocked.
2. **Achievement detail modal**
   - Show description, unlock requirements, progress bar, and badge art.
   - Provide hint text for hidden achievements (optional toggle to reveal).
3. **Real-time updates**
   - Subscribe to socket events to update progress/unlocks without full refresh.
4. **Badge placeholders**
   - Use standard fallback icon component referencing `/assets/achievements/<slug>.svg`.
   - Provide skeleton loaders while fetching definitions.
5. **Accessibility**
   - Ensure badge images have descriptive alt text.
   - Use semantic heading structure and focus management for modal.

## Shared types & utilities
- Add `AchievementDefinition`, `PlayerAchievement`, and `AchievementProgressEvent` types under `shared/src/achievements.ts`.
- Provide helper enums for categories and event types.
- Export pure helper `calculateAchievementProgress` for deterministic evaluation in tests.

## Operations & content pipeline
- Store badge art in R2 or CDN path `achievements/<slug>.svg`.
- Add admin script to import new achievements from YAML/JSON manifest.
- Document process in `docs/guides/achievements.md` (future work).
- Placeholder art can be generated as simple monochrome SVGs with text; swap when final art ready.

## Testing strategy
- Unit tests for achievement evaluation rules per category.
- Integration tests covering key flows: unlock on win, progress accumulation, socket event emission.
- Frontend unit tests verifying UI states (locked/unlocked, progress bar).
- End-to-end test scenario for unlocking `world-eater` within Playwright smoke suite.
- Data migration test verifying seeds populate definitions.

## Analytics & reporting
- Track `achievement_progress` and `achievement_unlocked` events with properties: `player_id`, `achievement_slug`, `match_id`, `progress_pct`, `game_mode`, `map_id`.
- Create dashboard charting unlock rates and funnel for new players.
- Weekly job to compute top achievements by category.

## Rollout plan
1. **Phase 0 – Infrastructure**: finalize data model, create migrations, seed definitions, add shared types.
2. **Phase 1 – Backend MVP**: implement progress evaluation for Core Gameplay + Game Mode categories; expose APIs.
3. **Phase 2 – Frontend MVP**: profile UI with progress display, placeholder badges, and manual refresh.
4. **Phase 3 – Advanced categories**: implement Strategic Styles, Endurance, Humorous, Social achievements once telemetry validated.
5. **Phase 4 – Live badge art & admin tools**: integrate final art, add admin import, surface analytics dashboard.
6. **Phase 5 – Seasonal achievements**: extend data model for start/end dates, add feature flags, marketing hooks.

## Risks & mitigations
- **Complex evaluation logic**: centralize rules in dedicated service with exhaustive tests; consider DSL for future content creators.
- **Performance impact**: leverage Redis caching and batched DB writes post-match; avoid per-action writes when possible.
- **Abuse edge cases**: log suspicious patterns (e.g., intentional disconnects) and rate-limit lobby invites.
- **Time zone handling**: rely on player profile timezone for "Night Owl" style achievements; fallback to UTC if missing.
- **Data drift**: nightly job to reconcile `player_achievements` with analytics events.

## Open questions
- Should achievements grant XP or cosmetic rewards? (Placeholder fields ready.)
- Do we need prestige tiers (bronze/silver/gold) for repeated completions?
- What is the cadence for adding/removing achievements without invalidating player history?
- How will we present hidden achievements without spoilers but still hint at progress?

## Next steps
1. Review plan with design/product to confirm catalog scope and priority tiers.
2. Create migration tickets for new tables and seed data.
3. Align with art team on badge placeholder pipeline.
4. Schedule backend/ frontend pairing session once plan approved.
