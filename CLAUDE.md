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
- **docs/MAP-FORMAT.md** - Map Editor documentation with tabbed interface guide
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

### 🎨 Theme Architecture
**Pure CSS Variable System** - Zero-flash theme switching with no JavaScript overhead:
- **CSS-First**: All themes defined in `app.css` using `[data-theme="name"]` selectors
- **Semantic Variables**: `--color-primary`, `--color-secondary`, `--color-accent` (not color-specific)
- **Available Themes**: default, red, violet, blue, green, black, highcontrast, halloween
- **Theme Switching**: `document.setAttribute('data-theme', 'red')` changes entire app instantly

**Key Files:**
- `src/app.css` - Theme definitions (CSS variables for each theme)
- `src/config/themes.config.ts` - Theme metadata and switching logic
- `src/constants/colors.ts` - Player/rank colors only (theme objects deprecated)

**Full Documentation**: See `/docs/THEME-SYSTEM.md` for complete theme architecture, migration guide, and best practices.

### Key Files & Components
```
backend/
├── src/game/gameEngine.ts         # Core game logic, turn phases
├── src/game/worldMap.ts           # Territory definitions and adjacencies  
├── src/services/GameService.ts    # Game state management
├── src/socket/gameHandlers.ts     # Real-time event handling
└── migrations/                    # Database migrations

frontend/
├── src/pages/MapEditorTokens.tsx   # Map Editor with tabbed interface
├── src/components/game/            # GameBoard, PhaseControls, DiceModal
├── src/store/gameSlice.ts          # Redux game state
├── src/services/socket.ts          # Socket.io client
└── src/types/game.ts               # TypeScript game types
```

### 🗺️ Map Editor
The Map Editor (`/map-editor-tokens`) features a modern tabbed interface:
- **Properties Tab**: Map metadata and validation
- **Image Tab**: Background upload and processing
- **Territories Tab**: Token placement with drag-and-drop
- **Continents Tab**: Continent configuration
- **Connections Tab**: Territory adjacency linking
- **Capitals Tab**: Starting position setup

See `docs/MAP-FORMAT.md` for complete Map Editor documentation.

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
11. **Feature Flags**: All new features MUST use feature flags (see docs/ARCHITECTURE.md#feature-flag-system)

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

## 🎯 Current Project Status (September 2025)

### ✅ Recently Completed Major Upgrades
1. **Node.js 24 Migration** - Error handling, regex security, resource cleanup
2. **React 19.1 + Vite 7.1** - Latest stable with performance improvements  
3. **PostgreSQL-Only** - Removed SQLite complexity, Railway-hosted everywhere
4. **VIP & Premium System** - Complete user tier system with VIP flags and premium subscriptions
5. **Admin Panel Restructure** - Enhanced admin UI with inline editing, filtering, and streamlined navigation
6. **31 Backend Services** - Comprehensive service architecture built out

### 🔄 Ready for Integration
- **Bull.js Worker System** - BattleWorker, GameActionWorker, CleanupWorker (.disabled)
- **Performance Monitoring** - Real-time metrics with automated alerting
- **Advanced Audio Features** - Spatial audio, dynamic music, voice announcements

### 🎯 Current Development Focus
- **VIP Maps Implementation** - Enable VIP-only maps using new database flags
- **Premium Tier Features** - Implement premium-gated content and features
- **Worker Integration** - Enable Bull.js background processing
- **Audio System Enhancement** - Advanced features and performance optimization

## 💾 Database Management

### Direct Database Access (Production)
```bash
# Connection string (Railway PostgreSQL)
postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway

# Quick database inspection scripts
npx ts-node src/scripts/checkProductionDb.ts   # Check all tables/columns
npx ts-node src/scripts/checkUserPrefs.ts      # Check user_preferences specifically

# Using pgAdmin or other tools
Host: yamanote.proxy.rlwy.net
Port: 46553
Database: railway
Username: postgres
Password: QZCDzahSSRUZLYUERywzrSMJvUWmgbor
SSL: Required
```

### Migration Best Practices
1. **Before ANY database changes**:
   - Check existing migrations in `backend/migrations/`
   - Create new migration file with next number (e.g., `015_your_change.sql`)
   - Use `CREATE TABLE IF NOT EXISTS` for safety
   - Include indexes and triggers in the same migration

2. **Testing migrations**:
   ```bash
   cd backend && npm run migrate  # Test locally first
   cd backend && npm run migrate:status  # Check what's been applied
   ```

3. **Production deployment**:
   - Migrations auto-run on Railway deployment (Sept 2025+)
   - Monitor logs for migration success
   - Verify schema with `npm run check:schema`

4. **Emergency fixes**:
   ```sql
   -- If column is missing in production, add directly:
   ALTER TABLE table_name 
   ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;
   
   -- Example: Theme column fix
   ALTER TABLE user_preferences 
   ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default';
   ```

### Current Database Tables (as of migration 016)
- **Core**: users (with VIP/premium fields), game_rooms, room_players, game_states, game_moves
- **Maps**: maps (with VIP-only flags), map_territories, custom_maps, map_submissions, map_reviews
- **Stats**: player_stats, player_game_stats, game_history, game_analytics
- **Social**: friendships, user_blocks, user_profiles, chat_messages
- **Achievements**: achievements, user_achievements, achievement_progress
- **Tournaments**: tournaments, tournament_participants, tournament_matches
- **Admin**: admin_roles, user_admin_roles, admin_activity_logs, user_bans
- **Support**: notifications, user_reports, territory_modifiers, territory_events
- **Views**: admin_user_overview (aggregated user data with stats)

## 📁 Environment Configuration

### Email Setup (Resend - Required)
```bash
# Quick Resend Setup:
# 1. Get API key from https://resend.com dashboard
# 2. Add to backend/.env:
RESEND_API_KEY=re_YOUR_API_KEY_HERE
EMAIL_FROM=noreply@updates.conquestk.com  # Updates subdomain verified
EMAIL_FROM_NAME=ConquestK
EMAIL_ENABLED=true
REQUIRE_EMAIL_VERIFICATION=true

# 3. Add same variables to Railway production environment
# 4. Test with: cd backend && npm run test:email
```

### Backend Environment (.env)
```bash
# Core (Railway auto-provides DATABASE_URL in production)
DATABASE_URL=postgresql://...      # Railway PostgreSQL URL
JWT_SECRET=...                      # JWT signing secret (32+ chars)
SESSION_SECRET=...                  # Session secret (32+ chars)
PORT=5001                           # Backend port
NODE_ENV=development               # development/staging/production

# Email (Required - see above)
RESEND_API_KEY=...
EMAIL_FROM=noreply@updates.conquestk.com
EMAIL_ENABLED=true

# Performance & Monitoring (Optional)
SENTRY_DSN=...                     # Error tracking
REDIS_URL=...                      # Redis cache
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_AUTO_SCALING=true
```

### Current Deployment URLs
- **Production**: https://conquestk.com (main branch)
- **Staging**: https://risk-game-production-9935.up.railway.app (dev branch)
- **Local Dev**: Frontend http://localhost:5173, Backend http://localhost:5001

Frontend proxies `/api` requests to backend (configured in `vite.config.ts`).

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
- **TODO.md** - Development task list

### /docs (Technical Documentation)
- **ARCHITECTURE.md** - System design, architecture, and **Feature Flag System**
- **DEVELOPMENT.md** - Development environment setup
- **DEPLOYMENT.md** - Deployment instructions (canonical version)
- **PROJECT-STATUS.md** - Feature completion status
- **THEME-SYSTEM.md** - Complete theme architecture, file locations, migration guide
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
- **PERFORMANCE-OPTIMIZATIONS.md** - Performance patterns and optimization guidelines

### /frontend/src/data
- **MAP_SCHEMA.md** - Map data structure specification