# CLAUDE.md - AI Assistant Guide

This file provides essential guidance to Claude Code (claude.ai/code) when working with the ConquestK codebase.

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
**Pure CSS Variable System** - Zero-flash theme switching:
- All themes defined in `app.css` using `[data-theme="name"]` selectors
- Semantic variables: `--color-primary`, `--color-secondary`, `--color-accent`
- Available themes: default, red, violet, blue, retrospace, green, black, highcontrast, halloween
- Theme switching: `document.setAttribute('data-theme', 'red')`
- See `/docs/guides/theme-system.md` for complete documentation

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

## 🗺️ Map Editor
The Map Editor (`/map-editor-tokens`) features a tabbed interface for creating custom maps:
- Properties, Image, Territories, Continents, Connections, Capitals tabs
- See `docs/guides/map-format.md` for complete documentation

## 🔴 Critical Development Rules

1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **Prefer editing existing files** over creating new ones
3. **Path aliases**: Both Frontend and Backend use `@/` (maps to src/)
4. **Error handling**: Always handle async errors properly
5. **Socket events**: Validate all incoming data before processing
6. **Type safety**: Avoid TypeScript `any` type
7. **Database changes**: ALWAYS create a migration file
8. **Migration naming**: Use format `XXX_description.sql`
9. **Test migrations locally** before production
10. **Follow docs/guides/coding-standards.md** - Apply all 10 core principles

## 💾 Database Management

### Migration Best Practices
1. Check existing migrations in `backend/migrations/`
2. Create new migration file with next number
3. Use `CREATE TABLE IF NOT EXISTS` for safety
4. Test locally with `cd backend && npm run migrate`
5. Migrations auto-run on Railway deployment

### Current Database Structure
- **Core**: users, game_rooms, room_players, game_states, game_moves
- **Maps**: maps, map_territories, custom_maps, map_submissions, map_reviews
- **Stats**: player_stats, player_game_stats, game_history, game_analytics
- **Social**: friendships, user_blocks, user_profiles, chat_messages
- **Admin**: admin_roles, user_admin_roles, admin_activity_logs, user_bans

## 🎮 Game Implementation Patterns

### Adding a New Game Feature
1. Update game engine in `backend/src/game/gameEngine.ts`
2. Add Socket.io handler in `backend/src/socket/gameHandlers.ts`
3. Update types in both backend and frontend `types/game.ts`
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

## 🎯 Current Project Status (January 2025)

### ✅ Recently Completed
- VIP & Premium System with database infrastructure
- Admin Panel enhancements with inline editing
- Theme System overhaul with zero-flash switching
- Map Editor workflow with staging pipeline
- Email verification system with Resend

### 🔄 In Progress
- VIP Maps implementation
- Premium tier features
- Worker system integration (Bull.js)
- Audio system enhancements

## 📁 Environment Configuration

### Email Setup (Resend)
```bash
# Add to backend/.env:
RESEND_API_KEY=re_YOUR_API_KEY_HERE
EMAIL_FROM=noreply@updates.conquestk.com
EMAIL_ENABLED=true
REQUIRE_EMAIL_VERIFICATION=true
```

### Core Environment Variables
```bash
DATABASE_URL=postgresql://...      # Railway PostgreSQL
JWT_SECRET=...                      # 32+ chars
SESSION_SECRET=...                  # 32+ chars
PORT=5001
NODE_ENV=development
```

## 🛠️ Development Environment
- **Node.js**: v22+ required
- **npm**: v9+ required
- **IDE**: VS Code on Windows (PowerShell for dev scripts)
- **Linter**: Biome 2.2.2 (2 spaces, single quotes JS, double quotes JSX)

## 🧪 Testing Strategy
- **Unit Tests**: Core game logic, utility functions
- **Integration Tests**: API endpoints, Socket.io handlers
- **Component Tests**: React components with Redux
- Test files alongside source (`*.test.ts`, `*.test.tsx`)
- Mock Socket.io connections for frontend tests

## 📏 Code Quality Standards
Follow these core principles (see CODING-STANDARDS.md):
1. Follow TypeScript/React best practices
2. Document WHY, not WHAT
3. Handle errors robustly
4. Apply SOLID principles
5. Write testable code (>70% coverage)
6. Appropriate abstraction levels
7. Use patterns wisely
8. Avoid global state
9. Refactor continuously
10. Security first

## 🚨 Common Gotchas
- **Port conflicts**: Backend (5001) or frontend (5173)
- **PostgreSQL connection**: Railway-hosted, check DATABASE_URL
- **TypeScript paths**: Different tsconfig setups for frontend/backend
- **Socket.io rooms**: Format `game:${gameId}`
- **Redux DevTools**: Development mode only
- **CORS**: Configured for localhost in dev, specific domains in production
- **Windows paths**: Forward slashes in imports, backslashes for file system
- **npm workspaces**: Root `npm install` installs all dependencies
- **API URLs in production**: Frontend MUST use relative URLs (`/api`)
- **Email verification**: Requires RESEND_API_KEY configured

## 📚 Documentation Structure
- **README.md** - Project overview and quick start
- **CLAUDE.md** - This file (AI assistant guide)
- **docs/index.md** - Index of every guide inside `docs/`
- **docs/planning/roadmap.md** - Active priorities and backlog
- **docs/planning/codebase-cleanup.md** - Technical-debt follow-ups
- **docs/reference/architecture.md** - System design and patterns
- **docs/reference/deployment.md** - Deployment procedures
- **docs/guides/coding-standards.md** - Code quality standards
- **docs/guides/theme-system.md** - Theme architecture
- **docs/guides/map-format.md** - Map file specification
- **docs/guides/email-verification.md** - Email system docs
- **docs/operations/troubleshooting.md** - Common issues

## 🎯 Key Reminders
- Create new files ONLY when architecturally necessary
- Always verify information before assuming
- Check existing code patterns before implementing new features
- Run linting and type checking before committing
- Test thoroughly in development before deploying
