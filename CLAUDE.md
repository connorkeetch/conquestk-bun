# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 Quick Start
```bash
npm install        # Install dependencies
npm run setup     # Configure environment and database
npm run dev       # Start development servers
```
Frontend: http://localhost:5173 | Backend: http://localhost:5001 | Live: [conquestk.com](https://conquestk.com)

## 🔴 CRITICAL RULES
1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **Prefer editing existing files** - Create new files ONLY for clear architectural needs (new components, modules, endpoints)
3. **NEVER proactively create documentation** - only when explicitly requested
4. **MUST use MCP servers and subagents** for specialized tasks - they're your superpowers!
5. **ALWAYS use TodoWrite** for multi-step tasks
6. **ALWAYS validate changes** - Run `npm run lint` and `npm test` after code modifications
7. **Prioritize Security** - Follow secure coding practices, especially with user input and auth

## 📚 Documentation Map
| File | Purpose |
|------|---------|
| `CLAUDE.md` | THIS FILE - Quick reference |
| `docs/PROJECT-STATUS.md` | Feature status, roadmap |
| `docs/ARCHITECTURE.md` | Tech stack, database, security |
| `docs/DEVELOPMENT.md` | Commands, tools, MCP usage |
| `docs/TROUBLESHOOTING.md` | Common issues and fixes |

## 🤖 AI Principles
- **Research First**: Use code-searcher before implementing
- **Use context7**: For ANY library documentation needs - get exact syntax!
- **Parallel Operations**: Run multiple tools simultaneously for efficiency
- **Robust Error Handling**: Ensure proper error handling and logging
- **Use MCP Tools**: When stuck, use Zen tools to debug, plan, or get consensus

## 🎨 Code Style (Biome Configuration)
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for JS/TS, double quotes for JSX attributes
- **Semicolons**: As needed (omit when not required)
- **Line Width**: 100 characters max
- **Trailing Commas**: Always use for multi-line
- **No console.log**: Use proper logging (except in tests)
- **No any**: Avoid TypeScript `any` type
- **Const over let**: Always use `const` when possible

## 🛠️ Required Subagents
- **code-searcher**: Code analysis and debugging (USE OFTEN before implementing)
- **memory-bank-synchronizer**: Keep docs in sync after architecture changes
- **ux-design-expert**: UI/UX guidance for user-facing features
- **code-reviewer**: Perform preliminary review after feature completion

## 🧠 Memory Bank
Search memory for: "database schema", "port conflicts", "Map Editor", etc.
Use `mcp__memory__search_nodes` tool with relevant keywords.

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

# Environment Switching
.\switch-env.ps1 development   # Switch to dev PostgreSQL (Windows)
.\switch-env.ps1 production    # Switch to prod PostgreSQL (Windows)
# Note: Creates backup at backend\.env.backup before switching
```

## 🎯 Current Focus
1. **UI Consistency** - Tailwind-only, no DaisyUI
2. **Production** - Railway deployment at conquestk.com
3. **Map Editor** - ImageProcessor enhanced

*For detailed roadmap and feature status, see `docs/PROJECT-STATUS.md`*

## 🏗️ Architecture Overview

### Frontend Stack
- **React 19.1.1** + **TypeScript 5.5.3**
- **Vite 7.1.3** for build/dev
- **Redux Toolkit** for state management (see `frontend/src/store/`)
- **Socket.io-client** for real-time updates
- **Tailwind CSS v4** (NO DaisyUI, NO inline styles)
- **Path Alias**: `@/` maps to `frontend/src/`

### Backend Stack
- **Node.js** + **Express 4.21.2** + **TypeScript**
- **Socket.io** for WebSocket connections
- **PostgreSQL** (Railway-hosted for dev and production)
- **JWT** authentication
- **Redis** for sessions (optional)

### Key Game Engine Components
- `backend/src/game/gameEngine.ts` - Core game logic, turn phases
- `backend/src/game/worldMap.ts` - Territory definitions and adjacencies
- `backend/src/services/GameService.ts` - Game state management
- `backend/src/socket/gameHandlers.ts` - Real-time event handling

### Database Schema Highlights
- **maps** - Custom map definitions
- **map_territories** - Territory polygons and metadata
- **territory_adjacencies** - Connection graph
- **games** - Active game sessions
- **users** - Player accounts with ELO ratings
- **game_modes** - Rule variations (Classic, Capitals, etc.)

### Real-time Flow
1. Client action → Socket.io event → `gameHandlers.ts`
2. Handler validates → Updates `GameService` state
3. State change → Broadcast to room participants
4. Redux store update → React re-render

### Testing Architecture
- **Backend Tests**: Jest with TypeScript, test files alongside source (`*.test.ts`)
- **Frontend Tests**: Vitest with React Testing Library, setup in `src/test/setup.ts`
- **Test Database**: PostgreSQL test database
- **Coverage**: Run with `--coverage` flag for code coverage reports

### Port Configuration
- **Frontend Dev**: 5173 (Vite default)
- **Backend Dev**: 5001 (configured in backend/.env)
- **Backend API Proxy**: Frontend proxies `/api` to `http://localhost:5001`
- **Socket.io**: Same as backend port (5001)
- **PostgreSQL**: Railway-hosted (dev and production)

### Build Output Structure
- Frontend builds to `backend/public/` for unified deployment
- Backend TypeScript compiles to `backend/dist/`
- Static assets served from Express in production

## 🔧 MCP Servers Available
Your toolkit of powerful MCP servers - **USE THEM PROACTIVELY!**

### Core Tools
- **context7** (`mcp__context7__`): Get exact library docs & code examples - USE BEFORE implementing!
- **filesystem** (`mcp__filesystem__`): Advanced file operations
- **memory** (`mcp__memory__`): Knowledge graph for project context
- **github** (`mcp__github__`): Repository operations and PR management
- **fetch** (`mcp__fetch__`): Web content retrieval
- **puppeteer** (`mcp__puppeteer__`): Browser automation for testing
- **sequential-thinking** (`mcp__sequential-thinking__`): Step-by-step problem solving

### Zen Tools (Your AI Assistants!)
When stuck or need help, these are your go-to tools:
- **chat** (`mcp__zen__chat`): Brainstorm with AI models (Gemini, GPT, etc.)
- **debug** (`mcp__zen__debug`): Systematic bug hunting - USE when stuck!
- **thinkdeep** (`mcp__zen__thinkdeep`): Complex problem analysis
- **planner** (`mcp__zen__planner`): Break down complex tasks
- **consensus** (`mcp__zen__consensus`): Get multiple AI perspectives
- **analyze** (`mcp__zen__analyze`): Code architecture analysis
- **refactor** (`mcp__zen__refactor`): Find improvement opportunities
- **codereview** (`mcp__zen__codereview`): Comprehensive code review
- **precommit** (`mcp__zen__precommit`): Validate before committing
- **secaudit** (`mcp__zen__secaudit`): Security vulnerability scanning
- **testgen** (`mcp__zen__testgen`): Generate comprehensive tests
- **tracer** (`mcp__zen__tracer`): Trace code execution paths

### Usage Examples
```
# Stuck on a bug? Use debug!
mcp__zen__debug - "User login fails intermittently"

# Need exact React syntax? Use context7!
mcp__context7__get-library-docs - "React hooks useEffect"

# Complex feature? Plan it out!
mcp__zen__planner - "Implement real-time multiplayer"

# Not sure about approach? Get consensus!
mcp__zen__consensus - "Should we use WebSockets or SSE?"
```

**REMEMBER**: These tools are your superpowers - use them early and often!

## 🔀 Common Development Patterns

### Adding a New API Endpoint
1. Define route in `backend/src/routes/` 
2. Implement controller in `backend/src/controllers/`
3. Add service logic in `backend/src/services/`
4. Update TypeScript types in `backend/src/types/`
5. Add frontend API call in `frontend/src/services/api.ts`
6. Update Redux slice if state management needed

### Adding a New Game Feature
1. Update game engine in `backend/src/game/gameEngine.ts`
2. Add Socket.io handler in `backend/src/socket/gameHandlers.ts`
3. Update game types in both `backend/src/types/game.ts` and `frontend/src/types/game.ts`
4. Implement UI component in `frontend/src/components/`
5. Add Redux state management in `frontend/src/store/gameSlice.ts`
6. Write tests for both backend logic and frontend components

### Working with Socket.io Events
- **Emit from client**: `socket.emit('event-name', data)`
- **Listen on server**: `socket.on('event-name', handler)` in `gameHandlers.ts`
- **Broadcast to room**: `io.to(roomId).emit('event-name', data)`
- **Update Redux**: Dispatch actions in socket event listeners

### Database Migrations
- Development: Direct SQLite file modifications OK
- Production: Create migration scripts in `backend/migrations/`
- Always update both `.env.development` and `.env.production` examples

## ⚠️ Common Pitfalls to Avoid
- **Don't mix Tailwind with inline styles** - Use Tailwind classes only
- **Don't create new files unnecessarily** - Edit existing files when possible
- **Don't forget to validate user input** - Use express-validator or Joi
- **Don't skip error handling** - Always handle async errors properly
- **Don't hardcode ports/URLs** - Use environment variables
- **Don't commit .env files** - Only .env.example files

---
*See docs/ folder for detailed information*