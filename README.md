# ConquestK — Bun + Colyseus snapshot

A historical TypeScript implementation of a **Risk-inspired multiplayer strategy board game**, with a React/Vite frontend, an Express API, PostgreSQL persistence, custom maps, and real-time matches.

> **Maintenance status — November 11, 2026:** This is an inactive personal project, shared for reference and experimentation. No ongoing feature work, releases, or support response times are planned. Issues and pull requests may go unanswered.

This is the **conquestk-bun** repository, on branch **`main`**. It is separate from the later [Elixir/Phoenix ConquestK project](https://github.com/connorkeetch/conquestk) and from the [conquestk-typescript snapshot](https://github.com/connorkeetch/conquestk-typescript). The live ConquestK website is not a demo or deployment of this snapshot.

## Which version is this?

| Repository | Runtime and transport | Default branch |
|---|---|---|
| [conquestk-typescript](https://github.com/connorkeetch/conquestk-typescript) | Node.js / Express / Socket.io; React frontend | `master` |
| [conquestk-bun](https://github.com/connorkeetch/conquestk-bun) | Bun / Express / Colyseus; React frontend | `main` |
| [conquestk](https://github.com/connorkeetch/conquestk) | Later Elixir/Phoenix implementation | Separate project; consult its own documentation |

The two TypeScript snapshots share historical documentation, but their real-time transports and backend/test scripts differ. Use the package manifests and entry point in **this** repository rather than mixing setup instructions.

Bun runs the backend and its isolated tests. Node.js and npm are still required by the frontend and workspace tooling; the presence of Bun does not replace all npm scripts.

## What is preserved?

- Multiplayer gameplay, lobby/room flows, custom-map editing and import formats.
- User accounts, profiles, community/chat interfaces, notifications, and administrative tooling.
- Shared game types, deterministic/lockstep logic, and TypeScript plus Rust/WebAssembly combat-odds code.
- Database migrations, optional Redis integrations, and a separate Go matchmaking/presence service.
- Architecture notes, operational guides, experiments, and unfinished plans.

These are source areas to explore, rather than a promise that every feature or old roadmap item is complete. See [documentation](docs/index.md) and the limitations below.

## Local setup

The instructions below follow the checked-in scripts and configuration. A complete fresh installation, multiplayer session, and production build were **not** rerun for this documentation update.

### Requirements

- **Node.js 24+ and npm 10+**, matching [package.json](package.json) and [.nvmrc](.nvmrc).
- **Bun 1.3.14**, pinned in [.bun-version](.bun-version).
- PostgreSQL and Redis. [docker-compose.yml](docker-compose.yml) provides PostgreSQL 17 and Redis 7.
- Docker Compose for the commands below, or equivalent local services you manage yourself.
- Rust and `wasm-pack` only when rebuilding the Rust/WASM odds engine. The default odds mode is TypeScript.
- Go tooling only if developing [matchsvc](services/matchsvc/README.md); it can otherwise run through Docker.

### Install and create local configuration

```bash
git clone https://github.com/connorkeetch/conquestk-bun.git
cd conquestk-bun
npm ci
npm run setup:env
```

`npm ci` is the install path used by the checked-in CI workflow. A historical `bun.lock` is also preserved, but the workspace recipe above uses the npm lockfile. If the lockfile and your platform's dependencies disagree, investigate the install error instead of assuming a clean build has been verified.

`setup:env` creates `backend/.env.local` and `frontend/.env` if absent. **The backend entry point and migration script explicitly load `backend/.env`**, so on a fresh clone also copy the generated local file:

```bash
# Bash / macOS / Linux
cp backend/.env.local backend/.env
```

```powershell
# Windows PowerShell
Copy-Item backend/.env.local backend/.env
```

Do not overwrite an existing environment file. Review the generated `backend/.env` and replace `JWT_SECRET` and `SESSION_SECRET` with separate random values of at least 32 characters. One way to generate each value is:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The generated database URL matches the Compose development database. It is a disposable **local** setup; use your own credentials for any hosted installation. Existing shell variables take precedence over values loaded from the file.

| Backend setting | Local purpose |
|---|---|
| `DATABASE_URL` | Your PostgreSQL database; generated defaults target `conquestk_local` on loopback |
| `JWT_SECRET`, `SESSION_SECRET` | Your own signing/session secrets |
| `PORT` | `5001` |
| `FRONTEND_URL`, `CORS_ORIGIN` | `http://localhost:5173` |
| `REDIS_URL` | Local Redis, normally `redis://127.0.0.1:6379` |
| `EMAIL_ENABLED`, `REQUIRE_EMAIL_VERIFICATION` | Keep `false` for the initial local setup |
| `ODDS_ENGINE` | `ts` for TypeScript odds; advanced modes are documented separately |
| `USE_MATCHSVC` | Keep `false` unless intentionally enabling the separate Go service |

`frontend/.env` uses `VITE_API_URL=http://localhost:5001/api` and `VITE_SOCKET_URL=http://localhost:5001`. All `VITE_*` values are public browser configuration; never put a secret there.

The longer [backend environment example](backend/.env.example), [frontend example](frontend/.env.example), and [environment validation code](backend/src/config/validateEnv.ts) explain additional integrations. Historical examples contain old deployment domains and placeholder values; they are not credentials or infrastructure supplied to new users.

### Start services and apply migrations

From the repository root:

```bash
docker compose up -d postgres redis
npm run check:services
npm run build:shared
npm --prefix shared/match-client run build
npm --prefix backend run migrate
```

Use an empty local database you own. Migrations and seed/admin utilities write to the configured database; do not point them at the live ConquestK installation. Compose uses fixed container and volume names, so the two snapshots should not be run side by side against the same local services without deliberately separating their configuration.

### Start the backend and frontend

Run in separate terminals from the repository root:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Open <http://localhost:5173>; the API uses <http://localhost:5001>. The combined `npm run dev` launcher requires Windows PowerShell; `npm run dev:manual` is the alternative shell-based combined script. Separate terminals make setup errors easier to locate.

## Assets and optional services

**Uploads require your own R2/S3-compatible storage configuration.** The current Bun asset uploader throws when remote storage is absent; older guides claiming uploads always fall back to the filesystem are stale.

For your own remote asset storage, configure `ASSET_BUCKET`, `ASSET_ENDPOINT`, `ASSET_ACCESS_KEY_ID`, `ASSET_SECRET_ACCESS_KEY`, and `ASSET_REGION` on the backend. `PUBLIC_ASSET_BASE_URL` and the frontend's `VITE_ASSET_BASE_URL` are public delivery URLs. Do not reuse another installation's bucket or keys.

The full audio/background/hero media set is not bundled with this source snapshot. Some screens can therefore have missing media until you supply an asset base you control. Public URLs in old docs are historical references, not an included asset service or a statement of media reuse rights.

Email delivery, browser push, external notifications, Sentry, and remote storage need your own configuration if enabled. Keep them disabled or unconfigured while first exploring locally. The Go service and Rust/WASM engine have their own instructions:

- [matchsvc](services/matchsvc/README.md)
- [WASM odds package](shared/wasm-odds/README.md)
- [Odds engine notes](docs/tech/odds-engine.md)

## Development commands

| Command | Purpose |
|---|---|
| `npm run lint` | Biome checks |
| `npm run typecheck` | Workspace type checks |
| `npm run test:backend` | Bun isolated backend tests |
| `npm run test:frontend` | Vitest frontend tests |
| `npm test` | Backend then frontend tests |
| `npm run build` | Shared packages, frontend, and backend build |
| `npm --prefix backend run migrate` | Apply database migrations |
| `npm --prefix backend run seed:users` | Write development users; inspect the script before using it |
| `npm run odds:build` | Rebuild the WASM package; requires Rust/wasm-pack |

Check [root scripts](package.json), [backend scripts](backend/package.json), and [frontend scripts](frontend/package.json) for exact behavior. Startup also attempts database migrations. Frontend build hooks generate assets and can publish them when remote-storage credentials are supplied; run builds in an isolated environment with your own services.

## Common questions and limitations

| Question | Answer |
|---|---|
| Is this the version running at conquestk.com? | No. This is an earlier source snapshot; the later Elixir/Phoenix codebase is a separate project. |
| Is it actively maintained or production ready? | It is inactive, with no support/release commitment. A secrets cleanup or public repository does not certify runtime security, dependency health, or production readiness. |
| Why do old guides say “active development,” mention a launch date, or name different servers? | They preserve the project's earlier development history. This README is the current statement of this snapshot's status. Planning documents do not promise future work. |
| Does a clone include accounts, maps, all media, or cloud access? | It contains source and tracked examples, not a live database, private uploads, account access, or credentials. Supply your own data and services. |
| Why do migrations report missing database settings after setup? | Confirm `backend/.env` exists. The scaffold creates `.env.local`, while the Node/dotenv entry points expect `.env`; check shell overrides and working directory too. |
| Can I mix the Bun and Socket.io client/server versions? | No compatibility is promised. Keep each snapshot's backend, frontend, and shared packages together. |
| Why do images or uploads fail? | Check the asset configuration above. Bun uploads require remote storage. |
| Can I deploy under my own domain? | Expect additional configuration and code review. Historical canonical-host, CORS, CDN, and Railway assumptions remain; the old deployment guide is not a generic turnkey recipe. |
| How do I report a problem or propose a change? | Search [issues](https://github.com/connorkeetch/conquestk-bun/issues). Include OS/runtime versions, commands, reproduction steps, and redacted errors. PRs target `main`; review or replies are not guaranteed. |
| What license applies? | `package.json` declares MIT, but no root `LICENSE` file is included. This discrepancy remains unresolved; this documentation update does not add or change licensing. Ask the owner to clarify reuse terms, including media. |

Do not post private credentials, databases, messages, or deployment logs containing secrets. If you retained a clone from before the public-source cleanup, use a fresh clone so old private history is not pushed back.

## Find the code and deeper documentation

| Path | Contents |
|---|---|
| [backend/src/server.ts](backend/src/server.ts) | Bun + Colyseus backend entry point |
| [backend](backend) | API, game services, migrations, authentication, and admin utilities |
| [frontend](frontend) | React UI, state, maps, and browser integration |
| [shared](shared) | Types, game/lockstep utilities, odds engines, and match client |
| [services/matchsvc](services/matchsvc) | Optional Go service |
| [docs/index.md](docs/index.md) | Curated historical reference, guides, operations, and planning |

Start with [architecture](docs/reference/architecture.md), [game options](docs/guides/game-options.md), [map format](docs/guides/map-format.md), or [troubleshooting](docs/operations/troubleshooting.md). Check source when a historical guide conflicts with this snapshot.
