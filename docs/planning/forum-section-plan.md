# Forum Section Implementation Plan

## Goal
Create a scalable, well-moderated forum experience inside the ConquestK web app that allows players to collaborate, report bugs, and share strategies without overwhelming the existing gameplay experience.

## Guiding Principles
- **Player-first UX:** fast paths to find discussions tied to regions, matches, or patch notes.
- **Moderation & safety:** integrate reporting tools, escalation workflows, and analytics to spot abuse early.
- **Incremental delivery:** ship in vertical slices so we can test assumptions with a subset of users before a full launch.
- **Reuse platform primitives:** extend existing authentication, notifications, and theming systems instead of forking one-off logic.

## Phase 0 – Discovery & Requirements
1. **Stakeholder interviews**
   - Connor (product/tech direction)
   - Moderation team (if/when staffed) and community volunteers
   - Sample of active players from Discord/Slack to validate needs
2. **Competitive & inspiration review**
   - Analyze forum UX from games with similar scale (e.g., Supercell, Riot) for best practices.
3. **Define use cases & success metrics**
   - Use cases: strategy sharing, bug reports, clan recruiting, dev announcements, patch feedback.
   - Metrics: daily active contributors, moderation turnaround, retention of forum users, NPS of forum experience.
4. **Information architecture draft**
   - Map categories (Announcements, Strategy, Support, Clans, Off-topic, etc.).
   - Decide on tags vs. subcategories for finer filtering.
5. **Technical constraints**
   - Confirm PostgreSQL sizing for expected post volume.
   - Ensure Redis/Sockets strategy for live updates aligns with existing infra.
   - Document required environment variables, caching strategy, and content storage limits.

## Phase 1 – Data Modeling & Backend Foundations
1. **Schema design**
   - Tables: `forum_categories`, `forum_threads`, `forum_posts`, `forum_reactions`, `forum_moderation_actions`, `forum_watchlist`.
   - Define indexes for search and chronological access.
   - Draft migration files with rollback plans.
2. **Shared types & validation**
   - Update `shared/` package with TypeScript interfaces and zod validators for forum DTOs.
3. **API surface**
   - REST endpoints under `/api/forum` for categories, threads, posts, reactions, subscriptions.
   - Admin/moderation endpoints with RBAC checks using existing auth middleware.
4. **Real-time updates**
   - Socket.io namespace `forum` with events for new posts, edits, and moderation actions.
5. **Testing foundations**
   - Unit tests for services and repositories.
   - Integration tests covering thread creation, pagination, permissions, and rate limits.

## Phase 2 – Frontend Experience (MVP)
1. **UX flows & design**
   - Wireframe main forum index, thread view, post composer, and user profile integration.
   - Ensure mobile responsiveness and keyboard accessibility.
2. **State management**
   - Add Redux slices/selectors for categories, threads, and posts.
   - Handle optimistic updates for posting while capturing errors gracefully.
3. **Pages & components**
   - `ForumHomePage`: categories list, latest activity widgets.
   - `ForumThreadPage`: breadcrumb, post list, reply composer, quick actions.
   - Reusable components: `ForumPostCard`, `ForumComposer`, `ForumSidebar`.
4. **Routing**
   - Add `/forum` and `/forum/:threadId` routes with lazy loading.
5. **SEO & metadata**
   - Configure dynamic `<title>` and meta tags for shareability.
6. **MVP acceptance criteria**
   - Authenticated users can create threads, reply, and edit/delete their own posts.
   - Guests can browse but must log in to post.
   - Moderators can lock threads and hide posts from the UI.

## Phase 3 – Moderation & Safety Enhancements
1. **Role-based tools**
   - Moderator dashboard with queues for reports and flagged content.
   - Bulk actions (lock, delete, shadowban) with audit logs.
2. **Reporting workflow**
   - Allow users to flag posts/threads; rate limit to prevent spam.
   - Build notification loop to alert moderators via email/Discord webhook.
3. **Automated checks**
   - Integrate content filtering (e.g., Perspective API or internal keyword lists).
   - Add throttling per user/IP for posting.
4. **Player reputation**
   - Track helpful marks, upvotes, or badges to encourage constructive content.
5. **Escalation path**
   - Document manual escalation to Connor and outline SLA targets (e.g., P0 < 1 hour, P1 < 24 hours).

## Phase 4 – Discovery & Engagement Features
1. **Search & filtering**
   - Full-text search (Postgres `tsvector` or external service like Algolia/Meilisearch).
   - Filters by category, tags, popularity, resolved status.
2. **Subscriptions & notifications**
   - Allow users to follow threads/categories; send real-time and email notifications.
   - Integrate with existing in-app notification center.
3. **Personalization**
   - Show recommended threads based on clans, recent matches, or map interests.
4. **Gamification**
   - Tie forum achievements to in-game cosmetics or titles.
5. **Localization**
   - Prepare copy strings for translation; consider language-specific subforums.

## Phase 5 – Launch & Operationalization
1. **Beta rollout**
   - Soft launch to a closed group; capture feedback via surveys and analytics dashboards.
   - Monitor performance metrics, error rates, and moderation load.
2. **Performance & scaling**
   - Load testing for high-concurrency posting.
   - Caching strategies (Redis, CDN for assets) to keep the experience snappy.
3. **Documentation & training**
   - Update player guides, support docs, and internal runbooks.
   - Train moderators/community managers on tools and policies.
4. **General availability**
   - Public announcement, cross-promotion in Discord, email, and in-game banners.
5. **Post-launch review**
   - 30-day retrospective to evaluate metrics, gather qualitative feedback, and prioritize follow-up improvements.

## Dependencies & Cross-Team Alignment
- **Backend:** schema migrations, new services, socket events, moderation tooling.
- **Frontend:** forum pages/components, notification integration, accessibility QA.
- **Shared:** types, validation schemas, API client updates.
- **Ops/Infra:** monitoring dashboards, log storage for moderation actions, content backup strategy.
- **Community:** define moderation policies, recruit moderators, create onboarding materials.

## Risks & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| High moderation load | Burnout, slow response | Invest in tooling, recruit volunteers, set clear SLA |
| Content toxicity | Drives players away | Automated filters, proactive moderation, clear code of conduct |
| Performance issues | Poor UX, server strain | Incremental load testing, caching, scaling policies |
| Feature creep | Delayed launch | Strict MVP scope and phased roadmap |
| Data privacy concerns | Compliance issues | Review ToS/privacy policy, implement GDPR delete/export workflows |

## Open Questions
- Do we need anonymous posting or alt accounts for sensitive topics?
- How do we handle integration with existing clan system or game events?
- Should we expose forum data via public APIs for community tooling?
- What analytics events are required for product insights?

## Next Steps
1. Review and refine requirements with Connor; confirm scope and success metrics.
2. Create engineering tickets per phase, aligning with sprint cadence.
3. Schedule design sprint for UX wireframes and visual language updates.
4. Kick off Phase 1 once requirements and resourcing are locked.
