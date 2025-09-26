# AI Assistant Guide

## Audience & collaboration
- Connor Keetch owns ConquestK and is the sole developer; he is a data engineer rather than a full-time application coder, so spell out reasoning, risks, and next steps in plain language.
- Default to asynchronous-friendly updates: call out what changed, why it matters, and anything Connor should verify locally.
- Always use Context7 MCP and its tools when you are writing complex code or are unsure about the best approach.
- Keep this guide in lockstep with its twin (`AGENTS.md` and `CLAUDE.md`); whenever you change one, mirror the update and double-check for drift.

## Project snapshot
- ConquestK is a Risk-inspired strategy game with an Express/Node backend (`backend/`), a React 19 + Redux Toolkit frontend (`frontend/`), and shared types/utilities in `shared/`.
- Local development expects Node.js 22.12+, npm 10+, access to PostgreSQL, and Redis for socket scaling and sessions.
- Backend routes live under `backend/src/routes`, with services in `backend/src/services`. Frontend pages are in `frontend/src/pages` with reusable components in `frontend/src/components`.

## Architecture & stack
- Frontend: React 19, TypeScript, Redux Toolkit, Vite 7, Tailwind CSS v4, socket.io client.
- Backend: Node.js 22+, Express 5, TypeScript, Socket.io, PostgreSQL (Railway-hosted), Redis, Bull for background work.
- Testing: Vitest on the frontend, Jest on the backend. Biome handles linting/formatting (2 spaces, single quotes in TS, double quotes in JSX).

## Tooling requirements
- Node.js `>=22.12.0` and npm `>=10.0.0` (enforced via `engines` across packages).
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
- Staging: https://risk-game-production-9935.up.railway.app/ (dev branch)
- Railway configuration now lives entirely in the Railway dashboard; `railway.json` was removed after it caused deployment issues, so define services and environment variables via the GUI.

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
- TypeScript everywhere with strict typings—avoid introducing new `any` types; if you touch legacy `any`, prefer refactoring it to real types.
- Tailwind CSS v4 only; no inline styles or ad-hoc stylesheets unless a file already uses them.
- JSX uses double quotes; TS/JS uses single quotes and no semicolons.
- Use the shared path alias `@/` (mapped to each package’s `src/`) consistently across imports.
- Prefer extending existing abstractions rather than inventing new patterns.

## Backend notes
- Routes are mounted under `/api`; add to existing routers before creating new ones.
- Use `backend/src/middleware/auth.ts` for user context instead of decoding JWTs manually.
- Follow logging conventions in `backend/src/utils/logger.ts`.
- The database is **PostgreSQL-only**—write SQL with native PostgreSQL syntax and `$n` placeholders; avoid MySQL/SQLite idioms such as `?` parameters or `INSERT OR REPLACE`.
- Asset uploads go through `backend/src/utils/assetStorage.ts`, targeting Cloudflare R2 when the `ASSET_*` variables are configured and falling back to local `/uploads` storage in development.
- Core gameplay lives in `backend/src/game/gameEngine.ts`; keep socket interactions in sync with `backend/src/socket/gameHandlers.ts`.
- Migrations live in `backend/migrations`; create new files with the pattern `NNN_description.sql` and never edit existing migrations.

## Frontend notes
- Pages are under `frontend/src/pages`; shared components live in `frontend/src/components`.
- Hooks in `frontend/src/hooks` and slices in `frontend/src/store` provide canonical state logic—reuse them before adding new state containers.
- API calls flow through `frontend/src/services/api.ts` or high-level game/map helpers.
- Theme switching relies on CSS variables in `frontend/src/app.css`; toggle the `data-theme` attribute instead of inline styles.
- The map editor UI lives in `frontend/src/pages/MapEditorTokens.tsx` with detailed format docs in `docs/guides/map-format.md`.
- Resolve CDN assets through `resolveAssetPath` (`frontend/src/utils/assets.ts`); set `VITE_ASSET_BASE_URL` in every environment (including local dev) because the repo no longer ships audio or hero media.

## Database & admin utilities
- Always create a new numbered migration for schema changes and test with `cd backend && npm run migrate` before finishing.
- Stick to PostgreSQL features in migrations and ad-hoc queries—Postgres is the only supported runtime, so don't introduce vendor-specific SQL.
- Use `cd backend && npm run seed:users` to refresh demo users locally.
- Promote or diagnose accounts with the scripts in `backend/src/scripts` (see `make-admin`, `diagnose-admin`, and `ensureDeployAccounts`).
- The shared Railway connection string is `postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway`; treat it carefully even though the repo is private.

## Testing strategy
- Backend: Jest unit/integration tests alongside source files (`*.test.ts`).
- Frontend: Vitest + React Testing Library for components and hooks (`*.test.tsx`).
- Mock Socket.io connections in tests instead of hitting live servers.
- Prioritise coverage for gameplay logic, services, and reducers when you touch them.

## Common gotchas
- Port conflicts on 5001 (backend) or 5173 (frontend) will block startup.
- Ensure PostgreSQL and Redis are running before invoking background jobs or sockets.
- Path aliases differ per package—check each `tsconfig.json` if imports fail.
- Socket.io rooms namespace as `game:${gameId}`; keep emit/listen pairs consistent.
- Frontend should use relative API URLs (`/api`) so deployments work across origins.
- Email flows require `RESEND_API_KEY`; without it most email routes are disabled.

## Documentation reference
- `README.md` – project overview and onboarding.
- `docs/reference/architecture.md` – system architecture and data flow.
- `docs/reference/deployment.md` – deployment procedures.
- `docs/guides/coding-standards.md` – code quality principles.
- `docs/guides/theme-system.md` – theme architecture.
- `docs/guides/map-format.md` – map editor format specification.
- `docs/guides/email-verification.md` – email verification workflow.
- `docs/guides/hidden-treasures.md` – Hidden Treasures ruleset and configuration.
- `docs/operations/troubleshooting.md` – common operational fixes.
- `docs/planning/roadmap.md` & `docs/planning/go-live-plan.md` – active priorities and launch blockers.
- `docs/planning/codebase-cleanup.md` – technical-debt backlog.

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

## Syncing this guide
- `AGENTS.md` and `CLAUDE.md` carry the same content; review both after every edit.
- When you update one, update the other in the same commit and skim the diff to confirm parity.
- Call out in your summary that the guides stayed synchronized so Connor can trust the documentation.
