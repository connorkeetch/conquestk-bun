# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 Quick Start
```bash
npm install        # Install dependencies
npm run setup     # Configure environment and database
npm run dev       # Start development servers
```
Frontend: http://localhost:5173 | Backend: http://localhost:5001 

### Live Environments
- **Production**: [conquestk.com](https://conquestk.com) (main branch)
- **Staging**: [risk-game-production-9935.up.railway.app](https://risk-game-production-9935.up.railway.app/) (dev branch)

### 📁 Documentation
- **README.md** - User-facing overview
- **CLAUDE.md** - This file (AI assistant guide)
- **TODO.md** - Feature & task tracking
- **docs/DEPLOYMENT.md** - Complete deployment, monitoring, emergency procedures
- **docs/** - Additional technical documentation

## ⚡ Essential Commands
```bash
# Development
npm run dev                    # Start both frontend (5173) and backend (5001)
npm run dev:frontend           # Frontend only
npm run dev:backend            # Backend only
npm run dev:quick              # Skip setup check (faster startup)

# Testing
npm test                       # Run all tests (backend + frontend)
npm run test:backend           # Jest backend tests only
npm run test:frontend          # Vitest frontend tests only
# Run single test file (backend): cd backend && npx jest src/game/gameEngine.test.ts
# Run single test file (frontend): cd frontend && npx vitest src/store/gameSlice.test.ts

# Code Quality
npm run lint                   # Biome check for issues
npm run lint:fix               # Auto-fix linting issues
npm run format                 # Format code with Biome

# Build & Production
npm run build                  # Build both frontend and backend
npm start                      # Start production server

# Database & Admin
cd backend && npm run migrate      # Run database migrations
cd backend && npm run seed:users   # Seed test users
cd backend && npm run make-admin   # Make user admin (interactive)
```

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: React 19 + TypeScript + Redux Toolkit + Vite 7 + Tailwind CSS v4
- **Backend**: Node.js + Express + TypeScript + Socket.io + PostgreSQL (Railway-hosted)
- **Testing**: Jest (backend) + Vitest (frontend)
- **Code Style**: Biome (2 spaces, single quotes JS, double quotes JSX)

### Key Files & Components
```
backend/
├── src/game/gameEngine.ts         # Core game logic, turn phases
├── src/game/worldMap.ts           # Territory definitions and adjacencies  
├── src/services/GameService.ts    # Game state management
├── src/socket/gameHandlers.ts     # Real-time event handling
└── migrations/                    # Database migrations

frontend/
├── src/components/game/            # GameBoard, PhaseControls, DiceModal
├── src/store/gameSlice.ts          # Redux game state
├── src/services/socket.ts          # Socket.io client
└── src/types/game.ts               # TypeScript game types
```

### Real-time Game Flow
1. Client action → Socket.io event → `gameHandlers.ts`
2. Handler validates → Updates `GameService` state
3. State change → Broadcast to room participants
4. Redux store update → React re-render

### Database Schema
- **maps** - Custom map definitions
- **map_territories** - Territory polygons and metadata
- **territory_adjacencies** - Connection graph
- **games** - Active game sessions
- **users** - Player accounts with ELO ratings

### Database Connections
- **Production**: Railway PostgreSQL (yamanote.proxy.rlwy.net:46553)
- **Staging**: Railway PostgreSQL (yamanote.proxy.rlwy.net:59752)
- **Development**: Railway PostgreSQL (yamabiko.proxy.rlwy.net:25470)
- **SQL Format**: PostgreSQL placeholders ($1, $2, etc) - NOT MySQL (?)

## 🔴 Critical Rules
1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **Prefer editing existing files** - Create new files ONLY for clear architectural needs
3. **Path aliases**: Frontend uses `@/`, Backend uses `@/` (both map to src/)
4. **Error handling**: Always handle async errors properly
5. **Socket events**: Validate all incoming data before processing
6. **Type safety**: Avoid TypeScript `any` type
7. **Database changes**: ALWAYS create a migration file when adding/modifying tables
8. **Migration naming**: Use format `XXX_description.sql` (e.g., `004_add_user_preferences.sql`)
9. **Test migrations locally** before pushing to production
10. **Follow docs/CODING-STANDARDS.md** - Apply all 10 core principles

## 📊 Monitoring & Error Tracking
- **Sentry**: Integrated for error tracking (configured via SENTRY_DSN env var)
- **Health endpoint**: `/health` returns server, database, and Sentry status
- **Test Sentry**: `/debug-sentry` endpoint (non-production only)
- **Performance**: 10% transaction sampling in production

## 🛠️ Development Environment
- **Node.js**: v20+ required (check with `node -v`)
- **npm**: v9+ required (check with `npm -v`)
- **IDE**: VS Code on Windows (PowerShell for dev scripts)
- **Linter**: Biome 2.2.2 (2 spaces, single quotes JS, double quotes JSX)

## 🎮 Game Implementation Patterns

### Adding a New Game Feature
1. Update game engine in `backend/src/game/gameEngine.ts`
2. Add Socket.io handler in `backend/src/socket/gameHandlers.ts`
3. Update types in both `backend/src/types/game.ts` and `frontend/src/types/game.ts`
4. Implement UI component in `frontend/src/components/`
5. Add Redux state management in `frontend/src/store/gameSlice.ts`
6. Write tests for both backend logic and frontend components

### Socket.io Event Pattern
```typescript
// Client emit
socket.emit('game:action', { gameId, action, data })

// Server handler (gameHandlers.ts)
socket.on('game:action', async (data) => {
  // Validate
  if (!validateAction(data)) return socket.emit('error', { message })
  
  // Update state
  const newState = await gameService.processAction(data)
  
  // Broadcast
  io.to(gameId).emit('game:state', newState)
})

// Client listener
socket.on('game:state', (state) => {
  dispatch(updateGameState(state))
})
```

## 🎯 Current Focus Areas
1. **UI Consistency** - Tailwind-only styling (no DaisyUI)
2. **Production** - Railway deployment at conquestk.com
3. **Staging** - Dev branch at risk-game-production-9935.up.railway.app
4. **Map Editor** - Canvas-based territory creation with ImageProcessor
5. **PostgreSQL** - All queries must use $1, $2 format (not ? placeholders)
6. **Database Schema** - Comprehensive tables for all features (game rooms, achievements, tournaments, etc.)

## 💾 Database Management

### Migration Best Practices
1. **Before ANY database changes**:
   - Check existing migrations in `backend/migrations/`
   - Create new migration file with next number (e.g., `004_your_change.sql`)
   - Use `CREATE TABLE IF NOT EXISTS` for safety
   - Include indexes and triggers in the same migration

2. **Testing migrations**:
   ```bash
   cd backend && npm run migrate  # Test locally first
   ```

3. **Production deployment**:
   - Migrations auto-run on Railway deployment
   - Monitor logs for migration success
   - Verify schema with `npm run check:schema`

### Current Database Tables (as of migration 003)
- **Core**: users, game_rooms, room_players, game_states, game_moves
- **Maps**: maps, map_territories, custom_maps, map_submissions, map_reviews
- **Stats**: player_stats, player_game_stats, game_history, game_analytics
- **Social**: friendships, user_blocks, user_profiles, chat_messages
- **Achievements**: achievements, user_achievements, achievement_progress
- **Tournaments**: tournaments, tournament_participants, tournament_matches
- **Admin**: admin_roles, user_admin_roles, admin_activity_logs, user_bans
- **Support**: notifications, user_reports, territory_modifiers, territory_events

## 📁 Environment Configuration
Backend requires `.env` file with:
```bash
DATABASE_URL=postgresql://...      # Railway PostgreSQL URL
JWT_SECRET=...                      # JWT signing secret (min 32 chars)
SESSION_SECRET=...                  # Session secret (min 32 chars)
PORT=5001                           # Backend port
NODE_ENV=development               # or production

# Email Service (Required for password reset & verification)
RESEND_API_KEY=...                     # From Resend dashboard
EMAIL_FROM=noreply@updates.conquestk.com  # Updates subdomain verified in Resend
EMAIL_FROM_NAME=ConquestK              # Display name in emails
EMAIL_ENABLED=true                     # Set to false to disable

# Optional
SENTRY_DSN=...                     # Error tracking
REDIS_URL=...                      # Redis cache
```

Frontend proxies `/api` requests to backend port 5001 (configured in `vite.config.ts`).
See `backend/.env.example` for complete configuration template.

## 🧪 Testing Strategy
- **Unit Tests**: Core game logic, utility functions
- **Integration Tests**: API endpoints, Socket.io handlers
- **Component Tests**: React components with Redux
- Test files alongside source files (`*.test.ts`, `*.test.tsx`)
- Mock Socket.io connections for frontend tests
- Use test database for backend integration tests

## 📏 Code Quality Standards

**ALWAYS follow these principles** (see CODING-STANDARDS.md for details):
1. **Follow specifications** - TypeScript/React best practices
2. **Document WHY, not WHAT** - Explain reasoning in comments
3. **Handle errors robustly** - Try-catch, validate inputs
4. **Apply SOLID principles** - Single responsibility, proper abstractions
5. **Write testable code** - >70% coverage, AAA pattern
6. **Appropriate abstraction** - Not too much, not too little
7. **Use patterns wisely** - Don't over-engineer
8. **Avoid global state** - Use dependency injection
9. **Refactor continuously** - Keep tech debt low
10. **Security first** - Validate, sanitize, authenticate

## 🚨 Common Gotchas
- **Port conflicts**: Backend (5001) or frontend (5173) - check with `netstat -ano | findstr :PORT`
- **PostgreSQL connection**: Railway-hosted, check DATABASE_URL in `.env`
- **TypeScript paths**: Frontend and backend have different tsconfig setups
- **Socket.io rooms**: Game rooms use format `game:${gameId}`
- **Redux DevTools**: Available in development mode only
- **CORS**: Configured for localhost in dev, specific domains in production
- **Windows paths**: Use forward slashes in imports, backslashes for file system operations
- **PowerShell scripts**: May need `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- **npm workspaces**: Root `npm install` installs all dependencies for frontend/backend
- **API URLs in production**: Frontend MUST use relative URLs (`/api`) not localhost
- **Staging NODE_ENV**: Set to 'staging', code must check for both 'production' and 'staging'
- **Frontend serving**: Backend serves built frontend from `backend/public` in production/staging
- **Email verification**: Requires RESEND_API_KEY configured in Railway environment

## 📚 Documentation Files

### Root Level (Core Instructions)
- **CLAUDE.md** - This file (AI assistant instructions)
- **README.md** - Project overview and quick start
- **CODING-STANDARDS.md** - 10 core coding principles
- **CODEBASE-MAP.md** - Complete project structure reference
- **TODO.md** - Development task list  
- **CODEBASE-HEALTH-CHECK.md** - Project health status
- **DEPLOYMENT.md** - Deployment guide (duplicate - should be removed)

### /docs (Technical Documentation)
- **ARCHITECTURE.md** - System design and architecture
- **DEVELOPMENT.md** - Development environment setup
- **DEPLOYMENT.md** - Deployment instructions (canonical version)
- **PROJECT-STATUS.md** - Feature completion status
- **TROUBLESHOOTING.md** - Common issues and solutions
- **UPGRADE-LOG.md** - Version upgrade history
- **MAP-FORMAT.md** - Map file format specification
- **AUDIO-IMPLEMENTATION.md** - Sound system documentation
- **SECURITY-AUDIT.md** - Security review checklist
- **LEGAL_REVIEW_CHECKLIST.md** - Legal compliance checklist
- **LEGAL_IMPLEMENTATION_PLAN.md** - Legal features roadmap
- **PLAYWRIGHT-MCP.md** - Playwright testing setup

### /backend
- **MIGRATION_INSTRUCTIONS.md** - Database migration guide

### /frontend/src/data
- **MAP_SCHEMA.md** - Map data structure specification