# 🎮 Risk Game - Full-Stack Multiplayer Risk Game

A modern implementation of the classic Risk board game with custom map creation, real-time multiplayer, and advanced game features.

## 🔴 CRITICAL: ALWAYS USE TAILWIND CSS v4 🔴
**We use Tailwind CSS v4 with Vite plugin** - NEVER mix inline styles, regular CSS, and Tailwind
- ✅ Use Tailwind classes exclusively
- ✅ Check `@theme` variables in app.css for custom utilities
- ✅ Use `clamp()` for responsive typography
- ❌ NO style="" attributes
- ❌ NO regular CSS classes (except custom utilities)
- ❌ NO Tailwind v3 syntax

## 🚀 Quick Start

### One-Command Setup
```bash
npm run setup && npm run dev
```

This will:
- ✅ Check dependencies and environment  
- ✅ Configure database (PostgreSQL or SQLite fallback)
- ✅ Start both frontend (localhost:5173) and backend (localhost:5001)
- ✅ Open browser to the game interface

### Live Demo
🌐 **Production**: [conquestk.com](https://conquestk.com) - Railway deployment

## 📊 Feature Status

| Component | Status | Notes |
|-----------|---------|-------|
| Core Game Engine | ✅ Complete | Full Risk gameplay with turn phases |
| Map Editor | ✅ Complete | Interactive polygon territory creation |
| Multiplayer | ✅ Complete | Socket.io real-time sync |
| Authentication | ✅ Complete | JWT-based user system |
| Database | ✅ Complete | PostgreSQL with migrations |
| Production Deploy | ✅ Live | conquestk.com via Railway |
| Advanced UI/UX | ✅ Complete | Modern responsive design implemented |
| Map Editor System | ✅ Complete | Full functionality with adjacency system |

## 🤖 MCP Server Usage

### Available MCP Servers
- **Memory Server**: Store and search project context
- **Filesystem Server**: File operations with proper permissions  
- **Git Server**: Advanced git operations and workflows
- **GitHub Server**: Repository management and PRs
- **Puppeteer Server**: Browser automation for testing
- **Fetch Server**: Web content retrieval and analysis

### Memory Integration Examples
```bash
# Search for specific project information
Search for "database schema" to see table structure
Search for "port conflicts" to get troubleshooting info
Search for "Map Editor" to understand editor features
```

## 🔧 Using Subagents

### Available Specialized Agents
- **memory-bank-synchronizer**: Keep documentation in sync with code
- **code-searcher**: Advanced code analysis and search  
- **ux-design-expert**: UI/UX design guidance
- **code-reviewer**: Automated code review

### Usage Examples
```bash
# Sync documentation with current code state
Use memory-bank-synchronizer to update CLAUDE.md with current project state

# Search for specific patterns
Use code-searcher to find all socket.io event handlers

# Get UX feedback  
Use ux-design-expert to review navigation component design
```

## 🤖 AI Guidance & Best Practices

### Mentoring Approach
- **Be Educational, Not Just Helpful**: Challenge assumptions, explain WHY solutions work
- **Code Quality First**: Prioritize maintainability over quick fixes  
- **Teaching Mindset**: Connect new concepts to SQL/BI background when relevant
- **Constructive Standards**: Point out better approaches even when current code works
- **Senior Developer Perspective**: Question flawed architecture and suggest improvements

### Core Principles
- **Ignore GEMINI.md and GEMINI-*.md files** - Not relevant to this project
- **Use code-searcher subagent** for code searches, inspections, troubleshooting, or analysis
- **Reflect on tool results** before proceeding - plan and iterate based on new information
- **Invoke tools simultaneously** when performing multiple independent operations
- **Verify solutions** before finishing tasks
- **Explain Technical Debt**: Show both "quick way" and "right way" when they differ
- **Warn About Scaling Issues**: Flag architecture problems before they become critical

### File Management Rules
- **NEVER create files** unless absolutely necessary for the goal
- **ALWAYS prefer editing** existing files over creating new ones
- **NEVER proactively create documentation** files (*.md) unless explicitly requested
- **Update memory bank** when modifying core context files
- **Exclude CLAUDE.md and CLAUDE-*.md** from commits - never delete these files

### Memory Bank System
This project uses a structured memory bank system with specialized context files:

#### Core Context Files
- **CLAUDE-activeContext.md** - Current session state, goals, and progress (if exists)
- **CLAUDE-patterns.md** - Established code patterns and conventions (if exists)  
- **CLAUDE-decisions.md** - Architecture decisions and rationale (if exists)
- **CLAUDE-troubleshooting.md** - Common issues and proven solutions (if exists)
- **CLAUDE-config-variables.md** - Configuration variables reference (if exists)
- **CLAUDE-temp.md** - Temporary scratch pad (only read when referenced)

**Important**: Always reference the active context file first to understand current work and maintain session continuity.

## 📋 Development Commands

### 🔧 Setup & Development
```bash
npm run setup              # Check and configure environment
npm run dev                # Start both frontend and backend
npm run dev:frontend       # Start frontend only (port 3000)
npm run dev:backend        # Start backend only (port 5001)
```

### 🏗️ Build & Production
```bash
npm run build              # Build both frontend and backend
npm start                  # Start production backend
```

### 🧪 Testing & Quality
```bash
npm test                   # Run all tests
npm run lint               # Run all linting
```

## ⚙️ Environment Configuration

### Environment Strategy
The project now uses a multi-environment approach for better development and deployment workflows:

**Available Environments:**
- **Development** (`.env.development`) - SQLite for fast local development
- **Production** (`.env.production`) - Railway PostgreSQL for live deployment

**Quick Environment Switching:**
```bash
# Switch to development (SQLite)
.\switch-env.ps1 development

# Switch to production (Railway)
.\switch-env.ps1 production

# Current environment is always in backend/.env
```

### Default Configuration

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

**Backend Development** (`backend/.env.development`):
```env
NODE_ENV=development
PORT=5001
DB_TYPE=sqlite
SQLITE_DB_PATH=./risk_game.db
JWT_SECRET=your-super-secret-jwt-key-for-development-only
```

**Backend Production** (`backend/.env.production`):
```env
NODE_ENV=production
PORT=${PORT:-5001}
DB_TYPE=postgresql
DATABASE_URL=${DATABASE_URL}
FRONTEND_URL=https://conquestk.com
```

## 🔧 Common Issues & Fixes

### ❌ "Port already in use"
**Problem**: Backend port 5001 or frontend port 5173 is occupied
```bash
# Check what's using the port
netstat -ano | findstr :5001
netstat -ano | findstr :5173

# Kill the process (replace PID)
taskkill /PID <process-id> /F
```

### ❌ "Cannot find module 'sqlite3'"
**Problem**: SQLite dependency missing
```bash
cd backend
npm install sqlite3
```

### ❌ Frontend won't connect to backend
**Problem**: CORS or network issues
1. Check backend is running on port 5001
2. Verify `VITE_API_URL` in `frontend/.env`
3. Check browser console for CORS errors
4. **Note**: Frontend typically runs on port 3000 (not 5173 as Vite's default)

### ❌ Database connection failed
**Problem**: PostgreSQL not available (switches to SQLite automatically)
```bash
# Option 1: Use SQLite (default)
# Nothing to do - already configured

# Option 2: Setup PostgreSQL
# Install PostgreSQL, then:
createdb risk_game
# Set DB_TYPE=postgresql in backend/.env
```

### ❌ Map Editor Canvas Issues
**Problem**: Canvas not drawing or territories not saving
1. Check browser console for JavaScript errors
2. Ensure backend is running and database migration applied
3. Verify file upload permissions for map images

### ❌ "PowerShell execution policy"
**Problem**: Cannot run PowerShell scripts
```powershell
# Run as administrator:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or use the bypass flag (already included in npm scripts)
powershell -ExecutionPolicy Bypass -File ./start-dev.ps1
```

### ❌ Node.js/npm not found
**Problem**: Node.js not installed or not in PATH
1. Download and install Node.js from [nodejs.org](https://nodejs.org/)
2. Restart your terminal
3. Verify: `node --version` and `npm --version`

## 🎯 Recent Major Achievements (Aug 2025)

### **Complete UI/UX Overhaul** ✅ (Aug 25, 2025)
- **Professional Homepage Design**:
  - ✅ Unified background gradient - no visible section transitions
  - ✅ Added subtle grid pattern overlay with radial glow
  - ✅ Tightened typography with responsive `clamp()` sizing
  - ✅ Clear primary CTAs with glowing shadow effects
  - ✅ Reduced section spacing (5rem → 3rem → 48px)
  - ✅ Equal-height feature cards with hover lift effects
  - ✅ Simplified "Conquer the World" banner (single container)
  - ✅ Better contrast on "How to Dominate" cards
  - ✅ Accessibility: Added `prefers-reduced-motion` support
  - ✅ Focus rings for keyboard navigation

### **Comprehensive Hamburger Menu** ✅ (Aug 25, 2025)
- **Full-featured side navigation**:
  - ✅ 320px wide slide-out panel from left
  - ✅ Collapsible sections: Game, Stats & Progress, Maps & Editor
  - ✅ Gradient "CONQUEST K" branding in header
  - ✅ Active page highlighting with blue accent
  - ✅ Settings link with arrow indicator
  - ✅ Authentication section at bottom
  - ✅ Always visible hamburger button (removed lg:hidden)
  - ✅ Pure Tailwind v4 implementation - no custom CSS

### **Tailwind CSS v4 Complete Migration** ✅ (Aug 25, 2025)
- **Critical CSS Fix**:
  - ✅ **REMOVED universal CSS reset that was breaking ALL Tailwind utilities**
  - ✅ Reduced global.css from 832 lines to 185 lines (78% reduction)
  - ✅ Kept only custom utilities not available in Tailwind
  - ✅ Fixed spacing utilities that were being overridden
- **Custom Theme Variables**:
  - ✅ Added `@theme` block in app.css
  - ✅ Section spacing variables (--section-spacing)
  - ✅ Glass morphism utilities
  - ✅ Custom brand colors in oklch

### **Homepage UX Transformation** ✅ (Aug 20, 2025)
- **Issue**: Homepage felt clunky with unused space, large SVG arrows, poor content hierarchy
- **Solution**: Complete UX/UI redesign following modern design principles
- **Result**: Professional, conversion-focused homepage
  - ✅ Fixed SVG sizing issues (added explicit width/height attributes to all SVGs)
  - ✅ Optimized layout with proper container constraints (max-w-6xl, max-w-4xl, max-w-5xl)
  - ✅ Streamlined content from 6 features to 4 focused features with status indicators
  - ✅ Enhanced visual hierarchy with "Strategic Warfare Redefined" messaging
  - ✅ Added micro-animations (hover:scale-102, icon scaling, arrow transitions)
  - ✅ Trust indicators with checkmarks for "Free to play", "No downloads", "Cross-platform"
  - ✅ Mobile-first responsive design with proper breakpoints
  - ✅ Reduced scroll distance to CTA by 50%, improved user journey

### **Fake Data Cleanup Project** ✅ (Aug 20, 2025)
- **Issue**: Site showed misleading fake data (2.8K players online, 1.25M games played, mock game rooms)
- **Solution**: Complete audit and removal of all fake/misleading elements
- **Result**: Honest, trustworthy user experience
  - ✅ Removed fake live stats and replaced with Beta status indicator
  - ✅ Replaced mock game rooms with transparent "Coming Soon" section
  - ✅ Removed fake maps (Classic World, Europe, Asia) with comprehensive roadmap
  - ✅ Updated social proof to focus on Beta features rather than fake metrics
  - ✅ Maintained professional appearance while setting proper expectations

### **Map Editor System - Fully Functional** ✅
- **Issue**: Map editor had broken file uploads and missing adjacency system
- **Solution**: Comprehensive audit and systematic fixes
- **Result**: Complete map creation workflow now working
  - ✅ Background image upload and server storage
  - ✅ Canvas-based territory drawing with polygon creation
  - ✅ Territory adjacency system with visual feedback
  - ✅ Continent management and territory assignment
  - ✅ End-to-end save workflow with database integration

### **UI/UX Enhancement Project** ✅  
- **Issue**: Forms and modals stretched full-width on desktop screens
- **Solution**: Applied modern responsive design principles
- **Result**: Professional, constrained layouts
  - ✅ Login/Register forms with modern card design
  - ✅ Settings modal properly constrained (max-w-4xl vs max-w-5xl)
  - ✅ Consistent input styling with focus states and transitions
  - ✅ Mobile-first responsive design with desktop constraints

### **Database Architecture Stability** ✅
- **Issue**: PostgreSQL migration system incomplete for production
- **Solution**: Fixed migration runner and database initialization
- **Result**: Robust production deployment
  - ✅ PostgreSQL working correctly on Railway
  - ✅ SQLite compatibility for local development
  - ✅ Complete schema with all required tables
  - ✅ Proper JSONB handling for cross-database compatibility

### **Environment Strategy Implementation** ✅ (Aug 2025)
- **Issue**: Port conflicts and inconsistent environment configuration
- **Solution**: Implemented multi-environment approach with easy switching
- **Result**: Clean development workflow
  - ✅ Fixed port mismatch between setup script (5000) and config (5001)
  - ✅ Separate environment files for development and production
  - ✅ PowerShell script for easy environment switching
  - ✅ SQLite for fast local development, PostgreSQL for production
  - ✅ No 500 errors - registration and API endpoints working correctly

## 📋 Available Commands

### 🔧 Setup & Development
```bash
npm run setup              # Check and configure development environment
npm run dev                # Start both frontend and backend (PowerShell)
npm run dev:frontend       # Start frontend only
npm run dev:backend        # Start backend only
npm run dev:frontend-only  # Start frontend only (PowerShell)
npm run dev:backend-only   # Start backend only (PowerShell)
npm run dev:quick          # Start without setup check
npm run dev:manual         # Start with concurrently (no new windows)
```

### 🏗️ Build & Production
```bash
npm run build              # Build both frontend and backend
npm run build:frontend     # Build frontend only
npm run build:backend      # Build backend only
npm start                  # Start production backend
```

### 🧪 Testing & Quality
```bash
npm test                   # Run all tests
npm run test:frontend      # Run frontend tests
npm run test:backend       # Run backend tests
npm run lint               # Run all linting
npm run lint:frontend      # Run frontend linting
npm run lint:backend       # Run backend linting
```

## 🎯 Architecture Overview

**Tech Stack**: React + TypeScript + Node.js + PostgreSQL + Socket.io + Redis  
**Deployment**: Railway (conquestk.com) with automated CI/CD  
**Database**: PostgreSQL (production) with SQLite fallback (development)

### Key Components
- **Frontend**: React/Vite with Redux state management
- **Backend**: Express.js REST API + Socket.io for real-time
- **Game Engine**: Complete Risk gameplay logic with turn phases  
- **Map Editor**: Canvas-based territory creation with polygon drawing
- **Database**: Comprehensive schema for games, maps, users, territories
- **Authentication**: JWT-based with secure user sessions

## 🎮 Game Features Status

### ✅ Implemented
- [x] **Reinforcement Phase**: Calculate and deploy new armies
- [x] **Attack Phase**: Dice rolling battles with animated results
- [x] **Fortification Phase**: Move armies between connected territories
- [x] **Turn Management**: Automatic phase progression and player rotation
- [x] **Real-time Multiplayer**: Socket.io synchronization
- [x] **Territory Selection**: Visual feedback and validation
- [x] **Game State**: Complete Redux integration
- [x] **Battle System**: Realistic Risk dice mechanics
- [x] **Map Editor**: Interactive polygon-based territory creation
- [x] **Custom Maps**: Save, load, and share custom maps
- [x] **Territory Abilities**: Special powers for territories
- [x] **Game Modes**: Multiple gameplay variations
- [x] **Image Upload**: Background map images
- [x] **Map Validation**: Connectivity and overlap checking

### 🚧 Future Enhancements
- [ ] **Continent Bonuses**: Additional armies for controlling continents
- [ ] **Card System**: Territory cards and set trading
- [ ] **AI Players**: Computer opponents
- [ ] **Advanced Map Features**: Bridges, tunnels, conditional connections
- [ ] **Game History**: Move history and replay system
- [ ] **Player Statistics**: Win/loss tracking
- [ ] **Spectator Mode**: Watch games in progress
- [ ] **Tournament Mode**: Multi-game tournaments
- [ ] **Map Editor Improvements**: Undo/redo, grid snap, shape tools

## 🗄️ Database Schema Overview

### Core Tables
- **maps**: Custom map definitions with metadata
- **game_modes**: Different gameplay rule sets
- **map_game_modes**: Links maps to compatible game modes
- **map_continents**: Continent groupings within maps
- **map_territories**: Individual territories with coordinates
- **territory_adjacencies**: Which territories connect
- **territory_ability_types**: Special ability definitions
- **map_ratings**: Community ratings and reviews

### Built-in Game Modes
1. **Classic**: Traditional Risk gameplay
2. **Capital Conquest**: Elimination on capital loss
3. **Naval Supremacy**: Naval bases control sea routes
4. **Resource War**: Territories generate different resources
5. **Asymmetric**: Players start with different advantages

### Territory Abilities
1. **Fortress** 🏰: +2 defense dice when defending
2. **Naval Base** ⚓: Can attack across water connections
3. **Trade Hub** 💰: Generates +1 army per turn
4. **Capital** 👑: Generates +2 armies, elimination if lost
5. **Artillery Position** 🎯: +1 attack dice when attacking
6. **Mountain Pass** 🏔️: Restricted access from specific directions
7. **Magical Nexus** 🔮: Special abilities and teleportation

## 🎨 Map Editor Usage

### Creating a New Map
1. Navigate to `/map-editor` in the frontend
2. Upload a background image (optional)
3. Use the territory tool to click and create polygon boundaries
4. Right-click or use complete button to finish each territory
5. Create continents and assign territories
6. Define adjacencies between territories
7. Assign special abilities to territories (optional)
8. Save your map to the database

### Map Editor Tools
- **Territory Tool**: Click to draw polygon territories
- **Continent Manager**: Group territories and set bonus armies
- **Adjacency Editor**: Connect territories that can attack each other
- **Ability Selector**: Assign special powers to territories
- **Validation**: Check map connectivity and territory overlaps

## 🔧 Common Issues & Fixes

### ❌ "Port already in use"
```bash
# Check what's using the ports
netstat -ano | findstr :5001  # Backend
netstat -ano | findstr :3000  # Frontend

# Kill the process (replace PID)
taskkill /PID <process-id> /F
```

### ❌ Database connection failed
**Solution**: Setup script auto-configures PostgreSQL or SQLite fallback
```bash
# Option 1: Use SQLite (default fallback)
# Nothing needed - automatically configured

# Option 2: Setup PostgreSQL
createdb risk_game
# Restart with: npm run setup
```

### ❌ Frontend won't connect to backend
**Solution**: Check backend is running and environment variables
```bash
# Verify backend is running on port 5001
curl http://localhost:5001/api/health

# Check frontend .env points to correct backend URL
cat frontend/.env
```

### ❌ Map Editor not working
**Solution**: Ensure database migrations have run
```bash
# Apply database migrations
cd backend && npm run migrate
```

## 🆘 Getting Help

1. **Run setup check**: `npm run setup`
2. **Check browser console** for JavaScript errors
3. **Check backend logs** in terminal for API errors  
4. **Verify ports**: Backend (5001) and Frontend (3000) available
5. **Test basic functionality**: Can you register/login and view games?
6. **Memory search**: Use memory integration for troubleshooting context

## 🎉 Success Indicators

✅ Setup check passes without errors  
✅ Backend starts on http://localhost:5001  
✅ Frontend starts on http://localhost:3000  
✅ Browser shows Risk game interface  
✅ No console errors in browser developer tools  
✅ Can register/login successfully  
✅ Map editor loads at `/map-editor`  
✅ Backend responds to `/api/maps` endpoints