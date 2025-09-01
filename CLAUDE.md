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
└── migrations/postgres/            # Database schema

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
- **Development**: Railway PostgreSQL (yamabiko.proxy.rlwy.net:25470)
- **SQL Format**: PostgreSQL placeholders ($1, $2, etc) - NOT MySQL (?)

## 🔴 Critical Rules
1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **Prefer editing existing files** - Create new files ONLY for clear architectural needs
3. **Path aliases**: Frontend uses `@/`, Backend uses `@/` (both map to src/)
4. **Error handling**: Always handle async errors properly
5. **Socket events**: Validate all incoming data before processing
6. **Type safety**: Avoid TypeScript `any` type

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

## 📁 Environment Configuration
Backend requires `.env` file with:
```bash
DATABASE_URL=postgresql://...      # Railway PostgreSQL URL
JWT_SECRET=...                      # JWT signing secret
PORT=5001                           # Backend port
NODE_ENV=development               # or production
RESEND_API_KEY=...                 # Email service (optional)
```

Frontend proxies `/api` requests to backend port 5001 (configured in `vite.config.ts`).

## 🧪 Testing Strategy
- **Unit Tests**: Core game logic, utility functions
- **Integration Tests**: API endpoints, Socket.io handlers
- **Component Tests**: React components with Redux
- Test files alongside source files (`*.test.ts`, `*.test.tsx`)
- Mock Socket.io connections for frontend tests
- Use test database for backend integration tests

## 🚨 Common Gotchas
- **Port conflicts**: Backend (5001) or frontend (5173) - check with `netstat -ano | findstr :PORT`
- **PostgreSQL connection**: Railway-hosted, check DATABASE_URL in `.env`
- **TypeScript paths**: Frontend and backend have different tsconfig setups
- **Socket.io rooms**: Game rooms use format `game:${gameId}`
- **Redux DevTools**: Available in development mode only
- **CORS**: Configured for localhost in dev, specific domains in production