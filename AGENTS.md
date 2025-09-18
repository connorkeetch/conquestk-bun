# AGENTS.md

## Project overview
- ConquestK is a Risk-inspired strategy game with an Express/Node backend (`backend/`), a React 19 + Redux Toolkit frontend (`frontend/`), and shared types/utilities in `shared/`.
- The repo expects Node.js 22+, npm 9+, PostgreSQL access (Railway in hosted envs), and Redis for socket scaling and sessions.
- Backend routes live under `backend/src/routes`, with services in `backend/src/services`. Frontend pages are in `frontend/src/pages` with components in `frontend/src/components`.

## Setup commands
- Install deps: `npm install`
- Prepare local database/seeds (optional for quick start): `npm run setup`
- Start dev servers (frontend + backend): `npm run dev`
- Backend only: `npm run dev:backend`
- Frontend only: `npm run dev:frontend`

## Testing instructions
- Run all tests: `npm test`
- Backend Jest suite: `npm run test:backend`
- Frontend Vitest suite: `npm run test:frontend`
- Lint and format checks: `npm run lint` (Biomes), `npm run format`
- If you touch SQL migrations, run `cd backend && npm run migrate` against a local database before finishing.

## Code style
- TypeScript everywhere with strict typings; avoid `any`.
- JavaScript/TypeScript files use single quotes and no semicolons (Biome enforces).
- JSX uses double quotes per project conventions.
- Favor functional, compositional patterns and existing abstractions instead of introducing new ones.
- Tailwind CSS v4 only for styling; no inline styles or external stylesheets unless they already exist.

## Backend notes
- Routes automatically mounted under `/api`; prefer adding to existing routers before creating new ones.
- To access user context, use middleware from `backend/src/middleware/auth.ts`—manually decoding JWTs should be limited to read-only helpers.
- Follow logging conventions using `backend/src/utils/logger.ts`.

## Frontend notes
- Use hooks from `frontend/src/hooks` and Redux store slices under `frontend/src/store`.
- API calls go through the Axios instance in `frontend/src/services/api.ts` or the game/map service helpers.
- Maintain tailwind utility ordering consistent with project examples.

## Release & PR expectations
- Before committing: `npm run lint` and whichever test suites cover your change.
- Keep commits focused; migrations require corresponding service/tests updates.
- Document notable behaviour changes in `docs/` or inline comments sparingly (explain why, not what).

