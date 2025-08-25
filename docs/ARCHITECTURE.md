# Architecture & Technical Details

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

## ⚙️ Environment Configuration

### Environment Strategy
The project uses a multi-environment approach for better development and deployment workflows:

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