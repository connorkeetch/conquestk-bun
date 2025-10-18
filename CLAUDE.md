# AI Assistant Guide

> Development‑Only Status (Important for Agents)
>
> ConquestK is currently in an active development phase. The service is not publicly live; only Connor and test accounts use it. When choosing between a clean, breaking change and maintaining backwards compatibility, prefer the clean refactor. Migrations can be destructive, legacy shims are unnecessary, and we can reset data as needed during local or staging work.

Agent checklist (read before coding):
- Open and review `docs/guides/coding-standards.md` before writing or editing any code.
- Confirm we are operating in development‑only mode (no public users).
- Prefer deletion of deprecated sockets/routes and legacy code over long‑lived shims.
- Allow destructive/incompatible migrations; verify locally with `cd backend && npm run migrate` and reseed (`seed:users`) if needed.
- Prioritize clarity, type safety, and fewer abstractions over compatibility layers.
- Update this guide, `AGENTS.md`, and `GEMINI.md` together and call out that they stayed in sync.

### Timeline & Rollout
- Target soft launch (friends-and-family): October 24, 2025 — subject to change.
- First months after launch will be limited to Connor + close friends; expect a small cohort and no marketing push.
- Continue favoring clean transitions and destructive migrations during this period; coordinate FE/BE changes in the same PR.
- As we approach the date, avoid risky multi-step migrations immediately before planned play sessions and include short rollback notes in PRs.

## Audience & collaboration
- Connor Keetch owns ConquestK and is the sole developer; he is a data engineer rather than a full-time application coder, so spell out reasoning, risks, and next steps in plain language.
- Default to asynchronous-friendly updates: call out what changed, why it matters, and anything Connor should verify locally.
- Always use Context7 MCP and its tools when you are writing complex code or are unsure about the best approach.
- Keep this guide in lockstep with its twins (`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`); whenever you change one, mirror the update and double-check for drift.

## Project snapshot
- ConquestK is a Risk-inspired strategy game with an Express/Node backend (`backend/`), a React 19 + Redux Toolkit frontend (`frontend/`), and shared types/utilities in `shared/`.
- Local development expects Node.js 24+, npm 10+, access to PostgreSQL, and Redis for socket scaling and sessions.
- Backend routes live under `backend/src/routes`, with services in `backend/src/services`. Frontend pages are in `frontend/src/pages` with reusable components in `frontend/src/components`.

### Development Phase Policy (how this changes decisions)
- Breaking changes are acceptable. Prefer clean transitions over backward compatibility.
- Database migrations may be destructive and fast; data can be reseeded. Do not edit existing migration files—add new ones—but feel free to drop/rename tables/columns when it’s the right design.
- APIs and sockets: converge on the unified `game-action` path. Remove deprecated events rather than maintaining dual paths when changing behaviour.
- Feature flags and long‑term toggles are not required for most changes. Keep configuration light unless it provides clear development value.
- Documentation should be updated in the same PR when behaviour changes so future assistants (Codex/Claude) ingest the latest assumptions.

### Performance defaults (Lighthouse)
- Defer PWA registration until after `window.load`; avoid early injection.
- Load theme display fonts on-demand per theme; remove global font imports.
- Do not preload audio on boot; preload only after user interaction/unlock.
- Idle-load optional large data (e.g., precomputed odds) via `requestIdleCallback` or short timeout.
- Add resource hints for CDN (`dns-prefetch`/`preconnect`) and enable DNS prefetch in Helmet.

## Architecture & stack
The project uses a modern web stack: a React/Vite frontend, and a Node.js/Express backend. It uses PostgreSQL for the database, Redis for caching and queues, and Socket.io for real-time communication.

For a detailed breakdown of the architecture, see the [architecture documentation](docs/reference/architecture.md).

## Tooling requirements
- Node.js `>=24.0.0` and npm `>=10.0.0` (enforced via `engines` across packages).
- PostgreSQL reachable at `localhost:5432` (or the Railway connection string) and Redis at `localhost:6379` for local dev.
- pnpm/yarn are unsupported; use npm workspaces starting from repository root.

## Quick start
```bash
npm install          # install root + workspace dependencies
npm run setup        # optional environment guard + sanity checks
npm run dev          # PowerShell launcher: starts backend (5001) and frontend (5173)
```
If you are not on Windows, use `npm run dev:manual` or run `npm run dev:backend` and `npm run dev:frontend` in separate terminals. `npm run dev:quick` skips the environment guard during setup.

## Environments
- Production: https://conquestk.com (main branch)
- Staging: https://dev.conquestk.com/ (dev branch)
- Railway configuration now lives entirely in the Railway dashboard; `railway.json` was removed after it caused deployment issues.
- Use Railpack-style Build/Start commands in the Railway GUI. To enable the WASM odds engine in staging/production, set the Install/Build/Start commands as documented in `docs/reference/deployment.md` (Build installs Rust + wasm-pack and runs `npm run odds:build` before the normal build).

## Key commands
```bash
# Development
npm run dev                 # start both servers (PowerShell wrapper)
npm run dev:backend         # backend only
npm run dev:frontend        # frontend only
npm run dev:quick           # skip environment guard

# Testing
npm test                    # run backend then frontend tests
npm run test:backend        # Jest (backend)
npm run test:frontend       # Vitest (frontend)

# Code quality
npm run lint                # Biome check
npm run lint:fix            # auto-fix lint issues
npm run format              # format with Biome

# Build & production
npm run build               # build frontend + backend
npm start                   # run migrations then start backend in prod mode

# Database & admin
cd backend && npm run migrate      # apply migrations
cd backend && npm run seed:users   # seed demo/test users
cd backend && npm run make-admin   # promote an account interactively
```

## Release & PR expectations
- Run `npm run lint` and the relevant test suites before committing.
- Run `npm run build` if you change bundling or production behaviour.
- Keep commits focused and document notable behavioural changes inline (explain why, not what).

## Code style & patterns
The project uses TypeScript with strict typings, Tailwind CSS, and Biome for formatting. Follow the established code style and patterns.

For detailed information on coding standards, see the [coding standards guide](docs/guides/coding-standards.md).

## Backend notes
- Routes are mounted under `/api`; add to existing routers before creating new ones.
- Use `backend/src/middleware/auth.ts` for user context instead of decoding JWTs manually.
- Follow logging conventions in `backend/src/utils/logger.ts`.
- The database is **PostgreSQL-only**—write SQL with native PostgreSQL syntax and `$n` placeholders; avoid MySQL/SQLite idioms such as `?` parameters or `INSERT OR REPLACE`.
- Asset uploads go through `backend/src/utils/assetStorage.ts`, targeting Cloudflare R2 when the `ASSET_*` variables are configured and falling back to local `/uploads` storage in development.
- Core gameplay lives in `backend/src/game/gameEngine.ts`; keep socket interactions in sync with `backend/src/services/socketService.ts` (which wires chat handlers from `backend/src/socket/chatHandlers.ts`).
- Fog-aware game logs: alongside existing deltas and `log:append` events, the server emits `game-log:append` per viewer with short, single-tone text (fog-filtered). On completion, the server emits `game-log:reveal` so clients refetch full, unredacted history. See `backend/src/services/logEmitter.ts`.
- Migrations live in `backend/migrations`; create new files with the pattern `NNN_description.sql` and never edit existing migrations.
- Development note: during this phase, destructive migrations are acceptable. If local data needs to be reset to unblock a schema change, do so and reseed.

### Action routing & team utils
- Prefer the unified `game-action` socket for all gameplay actions. Specialized events (`deployArmies`, `attack`, `fortify`, `transferConquestArmies`, `undoFortify`, `endTurn`, `goBackToReinforcement`) are deprecated and routed internally through the same processor for now.
- New action type: `transfer_conquest` (use via `game-action`) replaces the legacy `transferConquestArmies` socket and is fully handled by the unified inline lockstep processor.
- Team checks are centralized in `backend/src/utils/gameTeams.ts` and used by both `GameEngine` and AI. Do not reimplement team logic elsewhere.
- Emit deltas first; snapshots are recovery-only for desyncs.
- Logs: textual `game-log:append` is additive and runs alongside structured `game_battle_logs` writes.

### Development norms for routing and compatibility
- Remove deprecated socket events and REST routes promptly after migrating to `game-action`.
- If an event or route name changes, update both backend and frontend in the same PR; no long deprecation windows are required right now.

## Frontend notes
- Pages are under `frontend/src/pages`; shared components live in `frontend/src/components`.
- Hooks in `frontend/src/hooks` and slices in `frontend/src/store` provide canonical state logic—reuse them before adding new state containers.
- API calls flow through `frontend/src/services/api.ts` or high-level game/map helpers.
- Theme switching relies on CSS variables in `frontend/src/app.css`; toggle the `data-theme` attribute instead of inline styles.
- The map editor UI lives in `frontend/src/pages/MapEditorTokens.tsx` with detailed format docs in `docs/guides/map-format.md`.
- Resolve CDN assets through `resolveAssetPath` (`frontend/src/utils/assets.ts`); set `VITE_ASSET_BASE_URL` in every environment (including local dev) because the repo no longer ships audio or hero media.
- For the Game Room, lobby, and phase UX flows, follow `docs/planning/game-room-plan.md`.

## Database & admin utilities
Database migrations are handled with SQL files in `backend/migrations`. Use the provided npm scripts for seeding and admin tasks.

For more details, see the [database management guide](docs/guides/database-management.md).

## Testing strategy
The project uses Jest for backend testing and Vitest for frontend testing. Mocking is used for external services like Socket.io.

For more details, see the [testing strategy guide](docs/guides/testing-strategy.md).

## Common gotchas
Be aware of common issues like port conflicts, database connectivity, and correct configuration of environment variables.

For a detailed list of common issues and fixes, see the [troubleshooting guide](docs/operations/troubleshooting.md).

## Documentation reference
- `README.md` – project overview and onboarding.
- `docs/reference/architecture.md` – system architecture and data flow.
- `docs/reference/deployment.md` – deployment procedures.
- `docs/guides/coding-standards.md` – code quality principles.
- `docs/guides/theme-system.md` – theme architecture.
- `docs/guides/game-options.md` – Create Game options and how they map to gameplay.
- `docs/guides/map-format.md` – map editor format specification.
- `docs/guides/email-verification.md` – email verification workflow.
- `docs/guides/hidden-treasures.md` – Hidden Treasures ruleset and configuration.
- `docs/operations/troubleshooting.md` – common operational fixes.
- `docs/planning/roadmap.md` & `docs/planning/go-live-plan.md` – active priorities and launch blockers.
- `docs/planning/codebase-cleanup.md` – technical-debt backlog.
- `docs/planning/game-room-plan.md` – canonical Game Room UI/UX plan; consult when implementing room, lobby, phases, and timers.

## Game Replay (development)
The application includes a game replay feature that allows users to watch completed matches. The feature is implemented with read-only endpoints and a dedicated Redux slice.

For more details, see the [game replay guide](docs/guides/game-replay.md).

## Environment configuration
### Core variables (`backend/.env`)
```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your_32_char_secret
SESSION_SECRET=your_32_char_secret
PORT=5001
NODE_ENV=development
```

### Email setup (Resend)
```bash
RESEND_API_KEY=re_YOUR_API_KEY_HERE
EMAIL_FROM=noreply@updates.conquestk.com
EMAIL_ENABLED=true
REQUIRE_EMAIL_VERIFICATION=true
```

Set `PUBLIC_ASSET_BASE_URL` in `backend/.env` when the frontend runs on a different origin (e.g. staging) so map asset URLs resolve correctly.

### Asset storage (Cloudflare R2)
```bash
ASSET_BUCKET=conquestk
ASSET_ENDPOINT=https://84ad0307fb40b859de005c18c9c76f2a.r2.cloudflarestorage.com
ASSET_ACCESS_KEY_ID=...
ASSET_SECRET_ACCESS_KEY=...
ASSET_REGION=auto
PUBLIC_ASSET_BASE_URL=https://assets.conquestk.com
VITE_ASSET_BASE_URL=https://assets.conquestk.com
```
If the `ASSET_*` variables are omitted locally, uploads fall back to `backend/uploads/**`. Static audio/background assets still require `VITE_ASSET_BASE_URL` to point at the CDN.

### Lockstep development mode
- Set `LOCKSTEP_DEV=true` in `backend/.env` to emit `game-action:frame-committed`/`game-action:checksum` events and persist frames in `match_frames`; gameplay now always runs inline, so no queue bypass is required.
- Set `VITE_LOCKSTEP_DEV=true` in `frontend/.env` to disable optimistic client updates and consume the new lockstep feeds alongside legacy deltas.
- Use `npm run replay:match -- <matchId>` (backend) to re-sim recorded frames and compare checksums whenever you suspect drift; the script exits non-zero on mismatches.

## Syncing this guide
- `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` carry the same content; review all three after every edit.
- When you update one, update the other two in the same commit and skim the diff to confirm parity.
- Call out in your summary that the guides stayed synchronized so Connor can trust the documentation.
