# ConquestK – Multiplayer Strategy Board Game

<div align="center">

[![Live Demo](https://img.shields.io/badge/live-conquestk.com-blue)](https://conquestk.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-19.1-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-purple)](LICENSE)

</div>

ConquestK is an open-source, real-time strategy game inspired by *Risk*. The project pairs a modern
React + TypeScript frontend with an Express/Socket.io backend to deliver multiplayer battles,
community-built maps, and rich administrative tooling.

---

## 🔗 Quick links

- **Live game:** [conquestk.com](https://conquestk.com)
- **Documentation index:** [docs/index.md](docs/index.md)
- **Architecture overview:** [docs/reference/architecture.md](docs/reference/architecture.md)
- **Roadmap & follow-up tasks:** [docs/planning/roadmap.md](docs/planning/roadmap.md)
- **Coding standards:** [docs/guides/coding-standards.md](docs/guides/coding-standards.md)

---

## 📈 Go-live snapshot

- Tentative launch remains October 1, 2025; the canonical backlog lives in `docs/planning/go-live-plan.md`.
- Core gameplay persistence, lifecycle transitions, sockets, map permissions, and truthful navigation all cleared their `P0` gates.
- Remaining pre-launch work: creator/moderator notification fan-out, map asset purge tuning, a follow-up security checklist, CI coverage gates, large-file safeguards, and telemetry baselines.
- Documentation has been updated to match the shipped feature set so beta notes and marketing copy stay truthful.

---

## 🚀 Getting started

### Prerequisites

- Node.js **22.12** or newer
- npm **10** or newer
- PostgreSQL **14+**
- Redis **6+** (recommended for sessions, rate limiting, and Socket.io scaling)
- Optional: Resend API key or SMTP credentials for transactional email

### Installation

```bash
git clone https://github.com/connorkeetch/risk-game.git
cd risk-game
npm install
npm run setup
```

### Environment configuration

1. Copy the backend example environment file and update the secrets:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Update `DATABASE_URL`, `JWT_SECRET`, and `SESSION_SECRET` with secure values.
3. Provide Redis credentials in `REDIS_URL` when running with real-time multiplayer or background
   workers.
4. Configure email settings (`RESEND_API_KEY` or SMTP fields) if you plan to test verification flows.

#### Local database quick start

- Using Docker (recommended):
  ```bash
  docker-compose up -d   # starts PostgreSQL (risk_game_local) and Redis
  cd backend && npm run migrate
  ```

- Using native Postgres (WSL/macOS/Windows):
  ```bash
  # Ensure Postgres is installed and running
  # Create user password and database (example shown for Linux/WSL)
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'localpassword123';"
  sudo -u postgres createdb risk_game_local

  # In backend/.env set:
  # DATABASE_URL=postgresql://postgres:localpassword123@127.0.0.1:5432/risk_game_local
  cd backend && npm run migrate
  ```

### Running the app locally

- `npm run dev` – launches the backend and frontend with the setup guard (requires PowerShell or
  pwsh).
- `npm run dev:manual` – cross-platform alternative that uses `concurrently` without PowerShell.
- `npm run dev:frontend` / `npm run dev:backend` – start either service independently.
- `npm run dev:quick` – skip the setup guard after the first successful run.

Cross‑platform env setup (WSL/macOS/Linux):

- `npm run setup:env` – creates `backend/.env.local` (local Postgres + Redis) and `frontend/.env` if missing.

The frontend is served at [http://localhost:5173](http://localhost:5173) and the backend at
[http://localhost:5001](http://localhost:5001).

#### Running inside the OpenAI sandbox

The OpenAI agent sandbox blocks outbound TCP traffic to the shared Railway database, so the backend
must target a local PostgreSQL instance instead. Follow the dedicated
[OpenAI sandbox deployment guide](docs/operations/openai-sandbox.md) to install PostgreSQL, copy the
workspace environment files, and run migrations before starting the servers.

### Useful workspace scripts

```bash
npm test                 # Run backend (Jest) then frontend (Vitest) tests
npm run test:backend     # Backend tests only
npm run test:frontend    # Frontend tests only
npm run lint             # Biome linting and formatting checks for every package
npm run format           # Apply formatting fixes (Biome)
npm run build            # Build backend and frontend bundles
npm start                # Run migrations and start the production backend server
cd backend && npm run migrate   # Apply database migrations
cd backend && npm run seed:users # Populate demo accounts
npm run check:services   # Check local Postgres/Redis health
npm run check:services:start  # Try to start via Docker Compose if not running
```

### Migrations (baseline + incremental)
- The project maintains a single baseline SQL schema plus incremental migrations.
- After generating the baseline (e.g. `backend/migrations/001_baseline_schema.sql`) and committing it, remove older migration files from the repo.
- New environments bootstrap from the baseline; existing DBs only apply future incrementals.
- For non‑prod resets you can `TRUNCATE schema_migrations;` and re‑apply the baseline to rebuild.

---

## 🧱 Project structure

```
risk-game/
├── backend/             # Express + Socket.io API, game engine, migrations, scripts
├── frontend/            # React 19 app (Vite, Redux Toolkit, Tailwind v4)
├── shared/              # Shared TypeScript types and utilities
├── docs/                # Architecture, deployment, and planning guides
├── scripts/             # PowerShell utilities for setup, deployment, and tooling
├── package.json         # npm workspace configuration
└── docker-compose.yml   # Local orchestration for PostgreSQL and Redis
```

---

## 🎮 Key features

### Gameplay
- Real-time multiplayer matches powered by Socket.io.
- Custom map workflow with an in-browser editor, approvals, and publishing tools.
- Lobby creation with private/public games, invite codes, and matchmaking filters.
- Ranked and casual queues with ELO tracking and player statistics.

### Platform & community
- Comprehensive admin dashboards for users, maps, and live games.
- Email verification, password reset, and session management flows.
- Installable PWA shell with gameplay push notifications; map approval and DM push fan-out are wrapping up.
- Leaderboards, profiles, and community pages surfaced directly in the UI.

### Launch readiness
- Creator/moderator push + in-app notifications (WebSocket + web push) are finalising fan-out logic.
- Background purge workers are live but failure thresholds are still being tuned for asset cleanup.
- Security checklist re-run, CI guardrails, large file protections, and telemetry dashboards remain on the polish backlog.

### Engineering & tooling
- End-to-end TypeScript across backend, frontend, and shared packages.
- PostgreSQL-first data model with migrations, seeding scripts, and schema export utilities.
- Redis integration for rate limiting, job queues (Bull), and socket scaling.
- Automated linting, testing, and build commands wired through npm workspaces.

---

## 🚢 Deployment notes

- Production and staging environments are hosted on Railway; `npm run build` prepares the frontend
  and backend bundles.
- `npm start` runs migrations before booting the backend server. Ensure environment variables match
  your target deployment before running this command.
- See [docs/reference/deployment.md](docs/reference/deployment.md) for the full promotion checklist.

---

## 📚 Documentation

All supporting guides, troubleshooting steps, and deep dives live in the `docs/` directory. Start
with the [documentation index](docs/index.md) for a curated map of available resources.

---

## 🤝 Contributing

1. Fork the repository and create a feature branch.
2. Follow the [coding standards](docs/guides/coding-standards.md) and ensure new work is typed.
3. Update or add documentation when behaviour changes.
4. Run `npm run lint` and the relevant test suites before opening a pull request.
5. Submit a PR targeting the `main` branch with a clear summary of your change.

---

## 📄 License

ConquestK is released under the [MIT License](LICENSE).

---

## 📬 Maintainer

Maintained by Connor Keetch · [support@conquestk.com](mailto:support@conquestk.com)
