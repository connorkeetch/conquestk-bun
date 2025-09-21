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

### Running the app locally

- `npm run dev` – launches the backend and frontend with the setup guard (requires PowerShell or
  pwsh).
- `npm run dev:manual` – cross-platform alternative that uses `concurrently` without PowerShell.
- `npm run dev:frontend` / `npm run dev:backend` – start either service independently.
- `npm run dev:quick` – skip the setup guard after the first successful run.

The frontend is served at [http://localhost:5173](http://localhost:5173) and the backend at
[http://localhost:5001](http://localhost:5001).

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
```

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
- Progressive Web App support with push notifications and installable client.
- Leaderboards, profiles, and community pages surfaced directly in the UI.

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
