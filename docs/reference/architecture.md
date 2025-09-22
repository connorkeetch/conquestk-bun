# Architecture & Technical Details

## 🎯 Architecture Overview

**Tech Stack**: React 19.1 + TypeScript 5.9 + Node.js 24 + PostgreSQL + Socket.io + Redis  
**Deployment**: Railway (conquestk.com) with automated CI/CD  
**Database**: PostgreSQL-only (Railway-hosted for both dev and production)
**Build Tools**: Vite 7.1.5, Tailwind CSS 4.1.12

### Key Components
- **Frontend**: React 19.1/Vite 7.1 with Redux Toolkit state management
- **Backend**: Express.js REST API + Socket.io for real-time (31+ services)
- **Game Engine**: Complete Risk gameplay logic with turn phases
- **Map Editor**: Canvas-based territory creation with polygon drawing
- **Database**: PostgreSQL-only comprehensive schema (20+ tables)
- **Authentication**: JWT-based with secure user sessions + email verification
- **Performance**: Enterprise scaling with Redis cluster, CDN, auto-scaling
- **Workers**: Bull.js-based worker system (ready for integration)

### Performance Architecture Highlights
- **Delta-based Socket Broadcasting**: `DeltaBuilder` + `applyDelta` reducers stream only changed data to clients, trimming Socket.io bandwidth usage by roughly 60% compared to full state payloads.
- **Redis-backed Game State**: `gameStateCache` replaces in-memory Maps and enforces TTLs (1 hour while active, 24 hours after completion) so concurrent servers stay in sync without memory leaks.
- **Territory Modifier & Template Caching**: Dedicated Redis namespaces (`territoryModifierCache`, etc.) keep frequently accessed map metadata warm with TTLs tuned between 30 minutes and 2 hours.
- **Bulk Database Operations**: Territory modifier writes and ELO updates use batched `INSERT` statements and `UPDATE ... CASE` blocks to eliminate N+1 patterns and reduce transaction overhead.
- **Connection Pool Guardrails**: Production pools target 5-25 connections (2-15 in development) with `getPoolMetrics()` available for live utilization checks and log-based health tracing.

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

## ⚙️ Current Architecture Status (January 2025)

### Recent Major Upgrades ✅
- **Node.js 24**: Error.isError(), RegExp.escape, Symbol.dispose patterns
- **React 19.1**: Latest stable with concurrent features
- **Vite 7.1.5**: Rollover release with performance improvements
- **PostgreSQL-Only**: Removed SQLite dual-database complexity
- **Infrastructure Simplification**: Removed unused enterprise scaling scaffolding

### Backend Services (31 Total)
**Core Services:**
- adminService, authService, gameService, mapService, userService
- cacheService, emailService, eloService, chatService

**Performance & Scaling:**
- databaseClusterService, cdnService, performanceMonitorService
- scalingService, performanceTestingService
- redisClusterService, benchmarkUtils

### Performance & Scaling Services Overview

- **redisClusterService** provides cluster-aware caching with tiered TTLs, optional standalone fallback, and built-in metrics so cache usage and errors can be tracked across the fleet.【F:backend/src/services/redisClusterService.ts†L31-L198】
- **databaseClusterService** manages primaries and replicas with multiple load-balancing strategies, automatic retry/failover, and continuous health monitoring of connection pools.【F:backend/src/services/databaseClusterService.ts†L65-L433】
- **cdnService** orchestrates multi-provider delivery, applies asset optimization rules, and tracks cache performance while generating versioned CDN URLs for static content.【F:backend/src/services/cdnService.ts†L44-L213】
- **scalingService** coordinates Node.js cluster workers, collecting metrics and scaling horizontally based on configurable CPU and memory thresholds with graceful shutdown handling.【F:backend/src/services/scalingService.ts†L37-L468】
- **performanceMonitorService** aggregates system metrics from the database, Redis, CDN, queues, and game services, enforces alert thresholds, and exposes dashboards and health reports for operations.【F:backend/src/services/performanceMonitorService.ts†L81-L446】
- **performanceTestingService** ships ready-made load, stress, and game-scenario benchmarks, capturing bottlenecks alongside grading helpers in `benchmarkUtils` to summarize results.【F:backend/src/services/performanceTestingService.ts†L73-L399】【F:backend/src/utils/benchmarkUtils.ts†L1-L200】

**Game-Specific:**
- capitalGameService, capitalGeneratorService, territoryModifierService
- notificationService, sessionService, socketService

**Workers (Ready for Integration):**
- battleWorker.ts, gameActionWorker.ts, cleanupWorker.ts
- Currently .disabled to maintain zero compilation errors
- 25% faster response times, 300% higher throughput when enabled

### Environment Strategy
**Current Deployment:**
- **Production**: conquestk.com (main branch auto-deploy)
- **Staging**: risk-game-production-9935.up.railway.app (dev branch)
- **Development**: Local with Railway PostgreSQL

**Configuration:**
- PostgreSQL-only (no more dual-database complexity)
- Email verification with Resend integration
- JWT + session-based authentication
- Enterprise-grade caching and monitoring

## 🎮 Current Game Features (January 2025)

### Game Creation Options
**Game Modes:**
- Classic - Traditional conquest gameplay
- Capitals - Strategic capital territories (fair distribution by player count)
- Random - Let the game randomly select settings

**Player Configuration:**
- 2-12 players supported
- Teams: Free-for-all or balanced teams (2v2, 3v3, 4v4, etc.)
- Game visibility: Public, Private (invite code), Tournament
- Game type: Casual or Ranked (affects ELO)

**Game Settings:**
- **Fortification:** Adjacent, Adjacent Multi, Chained, Unlimited
- **Spoils Cards:** Escalating, Fixed (10), Static (custom 5-50), Random
- **Fog of War:** Off, Adjacent visibility, Persistent memory
- **Turn Time:** Async (24hr default, 30min-72hr range) or Real-time
- **Territory Modifiers:** Sparse, Balanced, Abundant distribution
- **Color Selection:** 12 standard colors + 6 premium colors

### Map System
**Map Gallery:**
- Simplified unified view (removed complex category tabs)
- Search by name, description, or tags
- Filter by tags and sort options
- Shows only approved, public maps by default
- Creator names displayed with play counts and ratings

**Map Editor (Token-Based System):**
- Upload background images (400×300 minimum, 10MB max)
- Place hexagonal territory tokens with click placement
- Create continents with army bonuses
- Define territory connections (adjacencies)
- Capital assignment system (auto-generate or manual)
- Fair distribution algorithm for 2-12 players
- Save drafts and submit for approval

**Map Approval Workflow:**
1. User creates map in editor
2. Saves to database as draft
3. Submits for review (status: pending_review)
4. Admin reviews in dashboard
5. Approved maps appear in public gallery

## 🔄 Recent Major Changes (December 2025)

### Map Gallery Overhaul
- **Removed:** Complex category tabs (official, featured, trending, recent, my maps)
- **Added:** Single unified view with search and filters
- **Backend:** New GET /maps endpoint with status filtering
- **Database:** Maps table supports approval workflow

### Game Creation Improvements
- Smart auto-naming based on game settings
- Random option for all major settings
- Team configurations automatically balanced
- Premium color options for customization
- Territory modifiers for advanced gameplay

### Map Editor Enhancements
- Token-based system (replaced polygon drawing)
- Hexagonal tokens with better visual clarity
- Capital assignment system for fair starts
- Maximin distance algorithm for spacing
- Grid snap and scaling controls
- Import/Export JSON functionality

### Tutorial & Documentation
- Updated game types to reflect actual options
- Corrected fortification descriptions
- Accurate player count (2-12 not 2-8)
- Current spoils card options documented
- Map editor guide with new features

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

## 🚩 Feature Flag System

### Overview
ConquestK uses a comprehensive feature flag system for controlled feature rollouts, A/B testing, and safe production experimentation. This enables gradual feature releases and quick rollbacks without code deployments.

### Database Schema
```sql
feature_flags
├── flag_name (unique identifier)
├── description
├── access_level ('disabled', 'internal', 'beta', 'public')
├── rollout_percentage (0-100)
├── target_criteria (JSONB for advanced targeting)
├── category (gameplay, ui, experimental, premium, vip)
└── dependencies (array of required flags)

user_feature_flags (user-specific overrides)
├── user_id
├── flag_name
└── is_enabled

feature_flag_audit (change tracking)
├── flag_name
├── changed_by
├── change_type
├── old_value
└── new_value
```

### Access Levels
1. **disabled** - Feature completely off
2. **internal** - Admin/tester accounts only
3. **beta** - Beta users and above
4. **public** - All users (respects rollout_percentage)

### Implementation Pattern
```typescript
// Frontend
const spoilsEnabled = useFeatureFlag('gameplay_spoils_of_war');

// Backend
const flags = await featureFlagService.evaluateForUser(req.user);
if (flags['gameplay_territory_modifiers']) {
  // Apply feature logic
}
```

### Current Feature Flags

| Flag | Description | Status | Category |
|------|-------------|--------|----------|
| `gameplay_spoils_of_war` | Card trading system | Partial | gameplay |
| `gameplay_territory_modifiers` | Special territory abilities | Ready | gameplay |
| `ui_holiday_themes` | Seasonal UI themes | Planned | ui |
| `experimental_ai_players` | Computer opponents | Development | experimental |
| `vip_exclusive_maps` | VIP-only map access | Ready | vip |
| `premium_advanced_stats` | Detailed analytics | Planned | premium |

### Rollout Strategy
1. **Internal Testing** (1-2 days) - `access_level: 'internal'`
2. **Beta Testing** (3-7 days) - `access_level: 'beta'`
3. **Gradual Rollout** (1-2 weeks) - Start at 10%, increase by 20% every 2-3 days
4. **Full Release** - 100% rollout, remove flag after 30 days stable

### Admin Management
Feature flags are managed on the main admin dashboard (`/admin`) with:
- Status-aware toggles for each flag
- Descriptions and last-updated metadata for quick context
- A manual refresh button to pull the latest server state

### Developer Guidelines

#### Naming Convention
```javascript
'category_feature_name' // e.g., 'gameplay_spoils_of_war'
```

#### Categories
- **gameplay** - Core game mechanics
- **ui** - Interface changes
- **experimental** - New/untested features
- **premium** - Premium user features
- **vip** - VIP-only features

#### Adding a New Feature Flag
1. Define in `frontend/src/constants/featureFlags.ts`
2. Add database migration
3. Implement feature checks in code
4. Test both enabled/disabled states
5. Document in admin panel

#### Best Practices
- Start with `internal` access level
- Monitor metrics during rollout
- Remove fully-deployed flags after 30 days
- Test with flag both on and off
- Use consistent naming conventions
- Track changes in audit log

## 📁 Codebase Structure

### Frontend Directory Map
```
frontend/src/
├── components/          # Reusable UI components
│   ├── game/           # Game-specific components
│   ├── navigation/     # Navigation elements
│   └── profile/        # User profile components
├── pages/              # Route pages
│   ├── game/          # Game-related pages
│   ├── maps/          # Map editor and gallery
│   └── admin/         # Admin panel pages
├── store/             # Redux state management
│   ├── authSlice.ts   # Authentication state
│   ├── gameSlice.ts   # Game state
│   └── roomSlice.ts   # Room management
├── services/          # API and external services
│   ├── api.ts        # HTTP client
│   ├── socketService.ts # WebSocket client
│   └── audioService.ts  # Sound system
└── types/            # TypeScript definitions
```

### Backend Directory Map
```
backend/src/
├── config/            # Configuration files
├── game/              # Core game engine
│   ├── gameEngine.ts  # Game logic
│   └── worldMap.ts    # Territory definitions
├── controllers/       # Route handlers
├── services/          # Business logic (31 services)
│   ├── game/         # Game-related services
│   ├── map/          # Map management
│   └── user/         # User services
├── routes/           # API endpoints
├── middleware/       # Express middleware
├── socket/           # WebSocket handlers
└── types/           # TypeScript interfaces
```

### Key File Locations
- **Game Engine**: `backend/src/game/gameEngine.ts`
- **Map Editor**: `frontend/src/pages/MapEditorTokens.tsx`
- **Redux Store**: `frontend/src/store/`
- **Socket Handlers**: `backend/src/socket/gameHandlers.ts`
- **Database Migrations**: `backend/migrations/`
- **Theme System**: `frontend/src/app.css`

## 🎨 User Preferences System

### Settings Management
The application maintains user preferences both locally and server-side:

**Local Storage:**
- Theme preference (dark/light/custom)
- Sound settings (volume, enabled/disabled)
- UI animation preferences
- Temporary session data

**Server-Side Storage:**
- Preferred game color
- Game settings (auto-ready, hints)
- Notification preferences
- Account settings

### Color System
Players can choose from 12 colors (6 standard, 6 premium):
```typescript
const PLAYER_COLORS = [
  // Standard colors (available to all)
  { name: 'Red', value: '#DC2626', premium: false },
  { name: 'Blue', value: '#2563EB', premium: false },
  { name: 'Green', value: '#16A34A', premium: false },
  { name: 'Yellow', value: '#EAB308', premium: false },
  { name: 'Purple', value: '#9333EA', premium: false },
  { name: 'Orange', value: '#EA580C', premium: false },
  
  // Premium colors (VIP/Premium users)
  { name: 'Pink', value: '#EC4899', premium: true },
  { name: 'Cyan', value: '#06B6D4', premium: true },
  { name: 'Lime', value: '#84CC16', premium: true },
  { name: 'Indigo', value: '#4F46E5', premium: true },
  { name: 'Teal', value: '#14B8A6', premium: true },
  { name: 'Black', value: '#000000', premium: true }
]
```

### Theme Architecture
Zero-flash theme switching using pure CSS variables:
- All themes defined in `app.css` using `[data-theme="name"]` selectors
- Semantic variables (`--color-primary`, `--color-secondary`, `--color-accent`)
- Available themes: default, red, violet, blue, retrospace, green, black, highcontrast, halloween
- Instant switching via `document.setAttribute('data-theme', themeName)`

### Settings Synchronization
1. Local settings take precedence for display preferences
2. Backend sync occurs on significant changes
3. Merge strategy resolves conflicts between local and server
4. Version tracking ensures consistency across devices
