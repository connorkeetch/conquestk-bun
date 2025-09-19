# AGENTS.md

## Project overview
- ConquestK is a Risk-inspired strategy game with an Express/Node backend (`backend/`), a React 19 + Redux Toolkit frontend (`frontend/`), and shared types/utilities in `shared/`.
- The repo expects Node.js 22+, npm 9+, PostgreSQL access (Railway in hosted envs), and Redis for socket scaling and sessions.
- Backend routes live under `backend/src/routes`, with services in `backend/src/services`. Frontend pages are in `frontend/src/pages` with components in `frontend/src/components`.

## Tooling expectations
- Always use Context7 MCP and its tools whenever you are writing complex code or if you are unsure about the best approach.

## Quick start
- Install deps: `npm install`
- Prepare local database/seeds (optional for quick start): `npm run setup`
- Run both servers: `npm run dev` (frontend on http://localhost:5173, backend on http://localhost:5001)
- Need a faster boot? `npm run dev:quick` skips the environment guard

## Environments
- Production: https://conquestk.com (main)
- Staging: https://risk-game-production-9935.up.railway.app/ (dev)

## Setup commands
- Install deps: `npm install`
- Prepare local database/seeds (optional for quick start): `npm run setup`
- Start dev servers (frontend + backend): `npm run dev`
- Quick dev without setup check: `npm run dev:quick`
- Backend only: `npm run dev:backend`
- Frontend only: `npm run dev:frontend`

## Testing instructions
- Run all tests: `npm test`
- Backend Jest suite: `npm run test:backend`
- Frontend Vitest suite: `npm run test:frontend`
- Lint and format checks: `npm run lint` (Biomes), `npm run format`
- Auto-fix linting issues: `npm run lint:fix`
- If you touch SQL migrations, run `cd backend && npm run migrate` against a local database before finishing.

## Code style
- TypeScript everywhere with strict typings; avoid `any`.
- JavaScript/TypeScript files use single quotes and no semicolons (Biome enforces).
- JSX uses double quotes per project conventions.
- Favor functional, compositional patterns and existing abstractions instead of introducing new ones.
- Tailwind CSS v4 only for styling; no inline styles or external stylesheets unless they already exist.
- Shared path alias `@/` resolves to each package's `src/`; keep imports consistent.
- Legacy areas still contain `any` from earlier iterations. Whenever you are touching one of those files, plan to refactor the surface you modify to use real types instead of leaving new `any`s behind.

## Database & admin utilities
- Run migrations: `cd backend && npm run migrate`
- Seed demo users: `cd backend && npm run seed:users`
- Promote accounts: `cd backend && npm run make-admin`
- Enforce owner + test users on any environment:
  - `cd backend`
  - `ENFORCE_DEPLOY_ACCOUNT_CHECK=true NODE_ENV=production DATABASE_URL="postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway" TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/scripts/ensureDeployAccounts.ts`
  - Script adapts to older schemas (missing `is_verified`, array permissions, etc.) and normalizes the `connorkeetch@gmail.com` owner plus twelve `test#@test.com` accounts (`Password123!`).
- New migrations must follow `NNN_description.sql`, never modify existing files, and should be tested locally before PRs.

## Backend notes
- Routes automatically mounted under `/api`; prefer adding to existing routers before creating new ones.
- To access user context, use middleware from `backend/src/middleware/auth.ts`—manually decoding JWTs should be limited to read-only helpers.
- Follow logging conventions using `backend/src/utils/logger.ts`.
- Game engine lives in `backend/src/game/gameEngine.ts`; align new gameplay rules with socket handlers in `backend/src/socket/gameHandlers.ts`.

## Frontend notes
- Use hooks from `frontend/src/hooks` and Redux store slices under `frontend/src/store`.
- API calls go through the Axios instance in `frontend/src/services/api.ts` or the game/map service helpers.
- Maintain tailwind utility ordering consistent with project examples.
- Theme switching relies on CSS variables in `frontend/src/app.css`; prefer toggling `data-theme` attributes over inline styles.

## Release & PR expectations
- Before committing: `npm run lint` and whichever test suites cover your change.
- Keep commits focused; migrations require corresponding service/tests updates.
- Document notable behaviour changes in `docs/` or inline comments sparingly (explain why, not what).
- Run `npm run build` before release when you change bundling or production behaviour.

## Environment configuration
- Required variables live in package-specific `.env` files; critical backend keys include `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `PORT`, and email settings when `EMAIL_ENABLED=true`.
- Email via Resend needs `RESEND_API_KEY`, `EMAIL_FROM`, and `REQUIRE_EMAIL_VERIFICATION=true` in `backend/.env`.
- Shared Railway Postgres (dev/staging) lives at `postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway`; private repo so credential can stay committed, but treat it carefully.
- When the frontend runs on a different origin, set `PUBLIC_ASSET_BASE_URL` in `backend/.env` (e.g. `https://risk-game-production-9935.up.railway.app`) so map image URLs resolve correctly.

## Documentation pointers
- Architectural overview: `docs/ARCHITECTURE.md`
- Theme details: `docs/THEME-SYSTEM.md`
- Map editor format: `docs/MAP-FORMAT.md`
- Coding standards: `docs/CODING-STANDARDS.md`
- Troubleshooting common issues: `docs/TROUBLESHOOTING.md`
