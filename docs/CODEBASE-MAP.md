# 🗺️ Codebase Map

*Quick navigation guide for the Risk Game project*

## 📁 Project Structure

```
risk-game/
├── 📦 package.json          # Root package scripts
├── 📋 CLAUDE.md             # AI assistant guidance
├── 📋 README.md             # Project overview
├── 📋 TODO.md               # Development tasks
├── 🗺️ CODEBASE-MAP.md      # THIS FILE
│
├── 🎨 frontend/             # React application
│   ├── 📦 package.json      # Frontend dependencies
│   ├── ⚙️ vite.config.ts    # Vite configuration
│   ├── 🌐 index.html        # Entry HTML
│   │
│   ├── 📁 src/
│   │   ├── 🚀 main.tsx      # Application entry
│   │   ├── 📱 App.tsx       # Root component
│   │   │
│   │   ├── 📁 components/   # React components
│   │   │   ├── 🎮 Game Components
│   │   │   │   ├── RiskGameBoard.tsx         # Main game board
│   │   │   │   ├── GamePhaseControls.tsx     # Turn phase controls
│   │   │   │   ├── BattleModal.tsx           # Battle interface
│   │   │   │   ├── GameOverModal.tsx         # Victory screen
│   │   │   │   ├── TerritoryToken.tsx        # Territory display
│   │   │   │   └── WorldMapSVG.tsx           # Map rendering
│   │   │   │
│   │   │   ├── 🗺️ Map Editor
│   │   │   │   ├── ImageProcessor.tsx        # Image upload/processing
│   │   │   │   └── MapVersionManager.tsx     # Map versioning
│   │   │   │
│   │   │   ├── 🧭 Navigation
│   │   │   │   ├── Header.tsx                # Top navigation
│   │   │   │   ├── Footer.tsx                # Bottom footer
│   │   │   │   └── navigation/
│   │   │   │       ├── PrimaryNav.tsx        # Main nav menu
│   │   │   │       └── UserMenu.tsx          # User dropdown
│   │   │   │
│   │   │   └── 👤 Profile
│   │   │       ├── ProfileOverview.tsx       # User profile display
│   │   │       └── UserStats.tsx             # Statistics display
│   │   │
│   │   ├── 📁 pages/        # Route pages
│   │   │   ├── 🏠 Core Pages
│   │   │   │   ├── Home.tsx                  # Landing page
│   │   │   │   ├── Dashboard.tsx             # User dashboard
│   │   │   │   ├── Login.tsx                 # Authentication
│   │   │   │   └── Register.tsx              # User registration
│   │   │   │
│   │   │   ├── 🎮 Game Pages
│   │   │   │   ├── GamePage.tsx              # Active game
│   │   │   │   ├── GameRoom.tsx              # Game room lobby
│   │   │   │   ├── LobbyPage.tsx             # Game browser
│   │   │   │   └── CreateGamePage.tsx        # New game setup
│   │   │   │
│   │   │   ├── 🗺️ Map Pages
│   │   │   │   ├── MapEditor.tsx             # Map creation tool
│   │   │   │   └── Maps.tsx                  # Map gallery
│   │   │   │
│   │   │   └── 👨‍💼 Admin Pages
│   │   │       ├── AdminPage.tsx             # Admin dashboard
│   │   │       ├── AdminUsers.tsx            # User management
│   │   │       └── AdminMapReview.tsx        # Map approval
│   │   │
│   │   ├── 📁 store/        # Redux state
│   │   │   ├── index.ts                      # Store configuration
│   │   │   ├── authSlice.ts                  # Authentication state
│   │   │   ├── gameSlice.ts                  # Game state
│   │   │   ├── roomSlice.ts                  # Game room state
│   │   │   └── settingsSlice.ts              # User preferences
│   │   │
│   │   ├── 📁 services/     # API & external
│   │   │   ├── api.ts                        # HTTP client
│   │   │   ├── socketService.ts              # WebSocket client
│   │   │   ├── audioService.ts               # Sound system
│   │   │   ├── authService.ts                # Auth API calls
│   │   │   ├── gameService.ts                # Game API calls
│   │   │   └── mapService.ts                 # Map API calls
│   │   │
│   │   └── 📁 types/        # TypeScript types
│   │       ├── game.ts                       # Game interfaces
│   │       ├── user.ts                       # User interfaces
│   │       └── notification.ts               # Notification types
│   │
│   └── 📁 public/           # Static assets
│       ├── sounds/                           # Audio files
│       └── world-map-hero.jpg                # Background image
│
├── 🖥️ backend/              # Node.js server
│   ├── 📦 package.json      # Backend dependencies
│   ├── ⚙️ tsconfig.json     # TypeScript config
│   │
│   ├── 📁 src/
│   │   ├── 🚀 index.ts      # Server entry point
│   │   │
│   │   ├── 📁 config/       # Configuration
│   │   │   └── database.ts                   # PostgreSQL setup
│   │   │
│   │   ├── 📁 game/         # Game engine
│   │   │   ├── 🎲 gameEngine.ts              # Core game logic
│   │   │   ├── 🗺️ worldMap.ts                # Territory definitions
│   │   │   └── 🧪 gameEngine.test.ts         # Game logic tests
│   │   │
│   │   ├── 📁 controllers/  # Route handlers
│   │   │   ├── authController.ts             # Authentication
│   │   │   ├── gameController.ts             # Game management
│   │   │   └── mapWorkflowController.ts      # Map operations
│   │   │
│   │   ├── 📁 services/     # Business logic
│   │   │   ├── 🎮 Game Services
│   │   │   │   ├── gameService.ts            # Game state management
│   │   │   │   ├── gameRoomService.ts        # Room management
│   │   │   │   ├── capitalGameService.ts     # Capital mode logic
│   │   │   │   └── eloService.ts             # Ranking system
│   │   │   │
│   │   │   ├── 🗺️ Map Services
│   │   │   │   ├── mapService.ts             # Map CRUD operations
│   │   │   │   ├── mapWorkflowService.ts     # Map workflow
│   │   │   │   └── mapApprovalService.ts     # Map moderation
│   │   │   │
│   │   │   └── 👤 User Services
│   │   │       ├── userService.ts            # User management
│   │   │       ├── adminService.ts           # Admin functions
│   │   │       └── profileService.ts         # Profile management
│   │   │
│   │   ├── 📁 routes/       # API endpoints
│   │   │   ├── auth.ts                       # /api/auth/*
│   │   │   ├── game.ts                       # /api/games/*
│   │   │   ├── maps.ts                       # /api/maps/*
│   │   │   ├── users.ts                      # /api/users/*
│   │   │   └── admin.ts                      # /api/admin/*
│   │   │
│   │   ├── 📁 middleware/   # Express middleware
│   │   │   ├── auth.ts                       # JWT verification
│   │   │   ├── adminAuth.ts                  # Admin authorization
│   │   │   └── rateLimiter.ts                # Rate limiting
│   │   │
│   │   ├── 📁 socket/       # WebSocket handlers
│   │   │   └── gameHandlers.ts               # Real-time game events
│   │   │
│   │   └── 📁 types/        # TypeScript types
│   │       ├── game.ts                       # Game interfaces
│   │       ├── user.ts                       # User interfaces
│   │       └── maps.ts                       # Map interfaces
│   │
│   ├── 📁 migrations/       # Database migrations
│   │   └── postgres/
│   │       ├── 001_complete_schema.sql       # Initial schema
│   │       ├── 002_add_missing_tables.sql    # Game rooms + map tables
│   │       └── 003_complete_missing_tables.sql # All feature tables
│   │
│   └── 📁 uploads/          # User uploads
│       └── maps/                             # Map images
│
├── 📁 docs/                 # Documentation
│   ├── ARCHITECTURE.md                       # System design
│   ├── DEVELOPMENT.md                        # Dev guide
│   ├── PROJECT-STATUS.md                     # Feature status
│   ├── TROUBLESHOOTING.md                    # Common issues
│   └── [other docs...]
│
└── 📁 scripts/              # Utility scripts
    ├── setup-check.js                        # Environment setup
    ├── start-dev.ps1                         # Dev startup script
    └── switch-env.ps1                        # Environment switcher
```

## 🔍 Quick Find Guide

### Where to find...

#### **Authentication & Users**
- Frontend login: `frontend/src/pages/Login.tsx`
- Backend auth: `backend/src/controllers/authController.ts`
- JWT middleware: `backend/src/middleware/auth.ts`
- User service: `backend/src/services/userService.ts`

#### **Game Logic**
- Game engine: `backend/src/game/gameEngine.ts`
- Game state: `backend/src/services/gameService.ts`
- Frontend game: `frontend/src/pages/GamePage.tsx`
- Game board: `frontend/src/components/RiskGameBoard.tsx`
- Redux state: `frontend/src/store/gameSlice.ts`

#### **Real-time (Socket.io)**
- Backend handlers: `backend/src/socket/gameHandlers.ts`
- Frontend client: `frontend/src/services/socketService.ts`
- Socket service: `backend/src/services/socketService.ts`

#### **Map System**
- Map editor: `frontend/src/pages/MapEditor.tsx`
- Map service: `backend/src/services/mapService.ts`
- Territory data: `backend/src/game/worldMap.ts`
- Map routes: `backend/src/routes/maps.ts`

#### **Database**
- Connection: `backend/src/config/database.ts`
- Migrations: `backend/migrations/postgres/`
- Schema: `backend/migrations/postgres/001_complete_schema.sql`

#### **Admin System**
- Admin dashboard: `frontend/src/pages/AdminPage.tsx`
- Admin routes: `backend/src/routes/admin.ts`
- Admin service: `backend/src/services/adminService.ts`
- Admin auth: `backend/src/middleware/adminAuth.ts`

#### **Configuration**
- Frontend env: `frontend/.env`
- Backend env: `backend/.env`
- Vite config: `frontend/vite.config.ts`
- TypeScript: `tsconfig.json` (both dirs)

#### **Testing**
- Backend tests: `backend/src/**/*.test.ts`
- Frontend tests: `frontend/src/**/*.test.tsx`
- Test setup: `frontend/src/test/setup.ts`

## 🎯 Common Tasks

### Add a new API endpoint
1. Create route in `backend/src/routes/`
2. Add controller in `backend/src/controllers/`
3. Implement service in `backend/src/services/`
4. Add types in `backend/src/types/`
5. Update frontend API in `frontend/src/services/api.ts`

### Add a new game feature
1. Update `backend/src/game/gameEngine.ts`
2. Add socket handler in `backend/src/socket/gameHandlers.ts`
3. Update types in both `backend/src/types/game.ts` and `frontend/src/types/game.ts`
4. Create UI in `frontend/src/components/`
5. Update Redux in `frontend/src/store/gameSlice.ts`

### Add a new page
1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Add navigation link if needed in `frontend/src/components/navigation/`

### Modify database schema
1. **NEVER edit existing migration files!**
2. Create new migration: `backend/migrations/postgres/004_your_change.sql`
3. Test locally: `cd backend && npm run migrate`
4. Update types in `backend/src/types/`
5. Update services that use the tables
6. Commit and push to deploy

## 📌 Key Files

- **Entry Points**
  - Frontend: `frontend/src/main.tsx`
  - Backend: `backend/src/index.ts`

- **Configuration**
  - Database: `backend/src/config/database.ts`
  - API Client: `frontend/src/services/api.ts`

- **Core Logic**
  - Game Engine: `backend/src/game/gameEngine.ts`
  - Redux Store: `frontend/src/store/index.ts`

- **Routing**
  - Frontend Routes: `frontend/src/App.tsx`
  - Backend Routes: `backend/src/routes/*.ts`

## 🔗 Related Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant guide
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Development guide
- [docs/PROJECT-STATUS.md](./docs/PROJECT-STATUS.md) - Feature status

## 🗄️ Complete Database Schema

### Current Tables (After Migration 003)

**Core Game Tables:**
- `users` - User accounts
- `game_rooms` - Active game sessions
- `room_players` - Players in rooms
- `game_states` - Current game state
- `game_moves` - Move history
- `game_history` - Completed games
- `player_game_stats` - Per-game stats
- `player_stats` - Aggregate stats

**Map System:**
- `maps` - Map definitions
- `map_territories` - Territory polygons
- `territory_adjacencies` - Connections
- `custom_maps` - User-created maps
- `map_submissions` - Approval queue
- `map_reviews` - Review feedback
- `map_test_games` - Playtesting
- `map_approval_history` - Audit trail
- `map_featured_history` - Featured maps
- `map_usage_stats` - Usage tracking
- `map_ratings` - User ratings
- `map_comments` - User comments
- `map_downloads` - Download tracking
- `map_favorites` - User favorites
- `map_tags` - Tag definitions
- `map_tag_associations` - Tag links

**Social Features:**
- `user_profiles` - Extended profiles
- `friendships` - Friend connections
- `user_blocks` - Blocked users
- `chat_messages` - In-game chat
- `private_messages` - Direct messages

**Achievement System:**
- `achievements` - Achievement definitions
- `user_achievements` - Earned achievements
- `achievement_progress` - Progress tracking

**Tournament System:**
- `tournaments` - Tournament definitions
- `tournament_participants` - Players
- `tournament_matches` - Match brackets
- `ranking_history` - ELO history

**Territory Features:**
- `territory_modifiers` - Special effects
- `territory_events` - Random events
- `active_territory_effects` - Active in-game

**Admin & Moderation:**
- `admin_roles` - Role definitions
- `user_admin_roles` - User roles
- `admin_activity_logs` - Admin actions
- `user_reports` - User reports
- `user_bans` - Ban records
- `user_account_status` - Account status

**Support Tables:**
- `notifications` - System notifications
- `game_analytics` - Game telemetry
- `user_activity` - Activity tracking
- `map_editor_sessions` - Editor saves
- `schema_migrations` - Migration tracking

---
*Last updated: September 1, 2025*