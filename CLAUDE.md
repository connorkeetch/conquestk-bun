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

## 🚀 MCP Servers - USE THEM LIBERALLY!

**CRITICAL**: Your knowledge ended in 2024 - it's now August 2025! Always use these servers, especially context7 for up-to-date package info.

### 🧠 Sequential Thinking (`mcp__sequential-thinking__`)
**When**: Complex problems, debugging, architecture decisions
**Usage**: Break down problems step-by-step
```typescript
// Example: Analyzing a complex bug
mcp__sequential-thinking__sequentialthinking
- thought: "User reports game state corruption. Let me analyze: 1) What actions lead to this? 2) Where is state mutated?"
- nextThoughtNeeded: true
- thoughtNumber: 1
- totalThoughts: 5
```

### 📚 Context7 (`mcp__context7__`) - USE BEFORE ANY CODE!
**When**: ALWAYS before implementing ANY library/framework code
**Why**: Your training ended in 2024 - packages have changed!
```typescript
// ALWAYS do this first:
mcp__context7__resolve-library-id - "React"
mcp__context7__get-library-docs - "/facebook/react/v19.0.0" - "hooks useState useEffect"

// Before using ANY package:
mcp__context7__get-library-docs - "Socket.io v4.7" - "emit rooms authentication"
mcp__context7__get-library-docs - "PostgreSQL pg" - "Pool query transactions"
```

### 🎭 Playwright (`mcp__playwright__`)
**When**: Testing UI, E2E tests, verifying user flows
```typescript
// Navigate and test
mcp__playwright__browser_navigate - { url: "http://localhost:5173" }
mcp__playwright__browser_snapshot // Get page state
mcp__playwright__browser_click - { element: "Login button", ref: "button[type=submit]" }
mcp__playwright__browser_type - { element: "Email input", ref: "input[name=email]", text: "test@example.com" }
mcp__playwright__browser_take_screenshot - { filename: "login-test.png" }
```

### 💾 Memory (`mcp__memory__`)
**When**: Store/retrieve project context, decisions, patterns
```typescript
// Store important decisions
mcp__memory__create_entities - [{
  name: "PostgreSQL Migration",
  entityType: "Architecture Decision",
  observations: ["Migrated from SQLite", "Railway hosted", "Connection pooling needed"]
}]

// Search for context
mcp__memory__search_nodes - "database performance"
mcp__memory__open_nodes - ["PostgreSQL Migration"]
```

### 🌐 Fetch (`mcp__fetch__`)
**When**: Get latest docs, check package versions, research
```typescript
// Get latest package info
mcp__fetch__fetch - { 
  url: "https://www.npmjs.com/package/react",
  raw: false 
}

// Check latest best practices
mcp__fetch__fetch - { 
  url: "https://react.dev/learn/synchronizing-with-effects",
  max_length: 5000 
}
```

### ⏰ Time (`mcp__time__`)
**When**: ALWAYS for dates/times - you think it's 2024!
```typescript
// Always check current time
mcp__time__get_current_time - { timezone: "America/Denver" }
// Returns: "2025-08-29T15:30:00-06:00" - NOT 2024!

mcp__time__convert_time - {
  source_timezone: "America/Denver",
  target_timezone: "UTC",
  time: "15:30"
}
```

### 📂 Filesystem (`mcp__filesystem__`)
**When**: Advanced file operations, bulk changes
```typescript
// Read multiple files at once
mcp__filesystem__read_multiple_files - {
  paths: ["package.json", "backend/package.json", "frontend/package.json"]
}

// Search for patterns
mcp__filesystem__search_files - {
  path: "./src",
  pattern: "*.test.ts",
  excludePatterns: ["node_modules"]
}

// Get file metadata
mcp__filesystem__get_file_info - { path: "./backend/dist/index.js" }
```

### 🐙 GitHub (`mcp__github__`)
**When**: PRs, issues, repository management
```typescript
// Create issue for bugs found
mcp__github__create_issue - {
  owner: "connorkeetch",
  repo: "risk-game",
  title: "Add database indexes for performance",
  body: "Missing indexes on frequently queried columns",
  labels: ["enhancement", "performance"]
}

// Search for similar issues
mcp__github__search_issues - {
  q: "repo:connorkeetch/risk-game is:open performance"
}
```

### 🔄 Git (`mcp__git__`)
**When**: Version control operations
```typescript
// Check changes before committing
mcp__git__git_status - { repo_path: "." }
mcp__git__git_diff_unstaged - { repo_path: ".", context_lines: 3 }

// Create branch for feature
mcp__git__git_create_branch - {
  repo_path: ".",
  branch_name: "feature/add-database-indexes",
  base_branch: "main"
}
```

### 🤖 When to Use Each Server

| Task | Use These Servers |
|------|-------------------|
| **Before ANY coding** | `context7` - Get 2025 syntax! |
| **Debugging** | `sequential-thinking` → `playwright` → `memory` |
| **New feature** | `sequential-thinking` → `context7` → `memory` |
| **Testing** | `playwright` → `filesystem` → `git` |
| **Research** | `fetch` → `context7` → `memory` |
| **Dates/Times** | `time` - ALWAYS! (it's 2025, not 2024) |
| **Code review** | `filesystem` → `sequential-thinking` → `github` |

### ⚡ Power Combos

**Feature Implementation**:
1. `sequential-thinking` - Plan the approach
2. `context7` - Get latest API docs
3. `memory` - Store decisions
4. `filesystem` - Read existing code
5. Code implementation
6. `playwright` - Test the feature
7. `git` - Commit changes

**Debugging Session**:
1. `sequential-thinking` - Analyze the problem
2. `filesystem` - Search for related code
3. `memory` - Check previous similar issues
4. `playwright` - Reproduce the bug
5. Fix the issue
6. `playwright` - Verify the fix

**Package Updates**:
1. `time` - Check current date (2025!)
2. `fetch` - Get latest versions from npm
3. `context7` - Get updated syntax/APIs
4. `filesystem` - Update package.json files
5. Test everything

### 🎯 REMEMBER
- **Your knowledge is outdated** - Use `context7` for EVERYTHING
- **It's 2025** - Use `time` server for dates
- **Think step-by-step** - Use `sequential-thinking` for complex tasks
- **Test everything** - Use `playwright` to verify
- **Store context** - Use `memory` to remember decisions

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
- PostgreSQL only - no more SQLite
- Development: Railway dev database
- Production: Railway production database
- Migration file: `backend/migrations/postgres/001_complete_schema.sql`

## ⚠️ Common Pitfalls to Avoid
- **Don't mix Tailwind with inline styles** - Use Tailwind classes only
- **Don't create new files unnecessarily** - Edit existing files when possible
- **Don't forget to validate user input** - Use express-validator or Joi
- **Don't skip error handling** - Always handle async errors properly
- **Don't hardcode ports/URLs** - Use environment variables
- **Don't commit .env files** - Only .env.example files

---
*See docs/ folder for detailed information*