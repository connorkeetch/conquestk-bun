# 🎮 Risk Game - Development Status

## 🚀 Quick Start

```bash
# Check setup and install dependencies
npm run setup

# Start development environment (opens new windows)
npm run dev

# Alternative: Start both services manually
npm run dev:frontend  # Frontend only
npm run dev:backend   # Backend only
```

## ✅ What's Working

### ✅ Core Game Features
- **Complete turn flow**: Reinforcement → Attack → Fortify phases
- **Real dice mechanics**: Proper Risk-style battle system with animated results
- **Territory management**: Click to select, visual feedback for valid targets
- **Phase-specific UI**: Different controls and instructions for each game phase
- **Multiplayer sync**: Real-time updates via Socket.io
- **Game state persistence**: Redux store with proper state management

### ✅ Frontend (React + TypeScript)
- **Modern React setup**: Vite + TypeScript + Redux Toolkit
- **Interactive map**: SVG-based world map with territory selection
- **Battle animations**: Dice rolling modal with results display
- **Responsive design**: Works on different screen sizes
- **Type safety**: Full TypeScript coverage

### ✅ Backend (Node.js + TypeScript)
- **RESTful API**: Express.js with proper routing
- **Real-time communication**: Socket.io for live multiplayer
- **Flexible database**: PostgreSQL or SQLite support
- **Authentication**: JWT-based user system
- **Game engine**: Complete Risk game logic implementation

### ✅ Development Tools
- **Automated setup**: One-command environment setup
- **Database flexibility**: Auto-detects and configures PostgreSQL or SQLite
- **Hot reloading**: Both frontend and backend auto-restart on changes
- **TypeScript**: Full type checking across the stack
- **ESLint**: Code quality and consistency

## ⚠️ What Needs Manual Setup

### Database (Optional - Auto-configured)
- **PostgreSQL**: If you want to use PostgreSQL instead of SQLite
  ```bash
  # Install PostgreSQL, then:
  createdb risk_game
  # Update backend/.env with your credentials
  ```

### Environment Variables
The setup script creates these automatically, but you can customize:

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

**Backend** (`backend/.env`):
```env
NODE_ENV=development
PORT=5000
JWT_SECRET=your-super-secret-jwt-key

# Database (auto-configured)
DB_TYPE=sqlite  # or postgresql
DATABASE_URL=sqlite:./database.sqlite
```

## 🔧 Common Issues & Fixes

### ❌ "Port already in use"
**Problem**: Backend port 5000 or frontend port 5173 is occupied
```bash
# Check what's using the port
netstat -ano | findstr :5000
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
1. Check backend is running on port 5000
2. Verify `VITE_API_URL` in `frontend/.env`
3. Check browser console for CORS errors

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

### 🧹 Maintenance
```bash
npm run install:all        # Install all dependencies
npm run clean              # Remove node_modules directories
npm run clean:install      # Clean and reinstall everything
```

### 🐳 Docker (Optional)
```bash
npm run docker:up          # Start with Docker Compose
npm run docker:down        # Stop Docker containers
npm run docker:logs        # View Docker logs
```

## 🎯 Project Structure

```
risk-game/
├── 📄 setup-check.js      # Automated environment setup
├── 📄 start-dev.ps1       # PowerShell development startup
├── 📄 package.json        # Root package with convenience scripts
├── 📄 STATUS.md           # This file
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── store/         # Redux store and slices
│   │   ├── services/      # API and Socket.io services
│   │   └── types/         # TypeScript type definitions
│   └── package.json
├── backend/                # Node.js + TypeScript backend
│   ├── src/
│   │   ├── controllers/   # API route handlers
│   │   ├── services/      # Business logic
│   │   ├── game/          # Game engine and logic
│   │   ├── config/        # Database and app configuration
│   │   └── types/         # TypeScript type definitions
│   └── package.json
└── database/               # Database initialization scripts
```

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

### 🚧 Future Enhancements
- [ ] **Continent Bonuses**: Additional armies for controlling continents
- [ ] **Card System**: Territory cards and set trading
- [ ] **AI Players**: Computer opponents
- [ ] **Custom Maps**: Map editor and custom territories
- [ ] **Game History**: Move history and replay system
- [ ] **Player Statistics**: Win/loss tracking
- [ ] **Spectator Mode**: Watch games in progress
- [ ] **Tournament Mode**: Multi-game tournaments

## 🆘 Getting Help

1. **Run the setup check**: `npm run setup`
2. **Check this STATUS.md file** for common issues
3. **Look at console errors** in browser developer tools
4. **Check backend logs** in the backend console window
5. **Verify ports**: Make sure 5000 (backend) and 5173 (frontend) are available

## 🎉 Success Indicators

When everything is working correctly, you should see:

1. ✅ Setup check passes without errors
2. ✅ Backend starts on http://localhost:5000
3. ✅ Frontend starts on http://localhost:5173
4. ✅ Browser shows the Risk game interface
5. ✅ Console shows successful database connection
6. ✅ No error messages in browser developer tools

**Happy gaming! 🎲**