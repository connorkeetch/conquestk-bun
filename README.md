# 🎮 Risk Game - Multiplayer Board Game

A full-stack Risk-like multiplayer board game built with React, Node.js, Socket.io, and PostgreSQL/SQLite.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)](https://socket.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/risk-game.git
cd risk-game

# Setup and start development environment
npm run setup
npm run dev
```

**That's it!** The setup script will handle dependencies, database configuration, and start both frontend and backend.

👉 **For detailed setup info, troubleshooting, and features, see [CLAUDE.md](CLAUDE.md)**

## ✨ Features

### 🎯 Complete Risk Game Implementation
- **🔄 Full Turn Flow**: Reinforcement → Attack → Fortify phases
- **🎲 Real Dice Mechanics**: Authentic Risk-style battle system with animated results
- **🗺️ Interactive World Map**: Click-based territory selection with visual feedback
- **⚡ Real-time Multiplayer**: Up to 6 players with live Socket.io synchronization
- **🎮 Phase-specific UI**: Different controls and instructions for each game phase

### 🛠️ Modern Tech Stack
- **Frontend**: React 18 + TypeScript + Redux Toolkit + Vite
- **Backend**: Node.js + Express + TypeScript + Socket.io
- **Database**: PostgreSQL or SQLite (auto-detected)
- **Testing**: Jest (backend) + Vitest (frontend) with comprehensive test coverage
- **Development**: Hot reloading, automated setup, and professional tooling

### 🔧 Developer Experience
- **One-Command Setup**: Automated environment configuration
- **Flexible Database**: Auto-detects PostgreSQL, falls back to SQLite
- **Smart Development Tools**: PowerShell automation, dependency management
- **Type Safety**: Full TypeScript coverage across the stack
- **Test Coverage**: 37 tests covering core game logic and UI components

## 🎮 Game Features

### ✅ Implemented
- [x] **Reinforcement Phase**: Calculate and deploy new armies based on territory count
- [x] **Attack Phase**: Dice rolling battles with realistic Risk mechanics
- [x] **Fortification Phase**: Move armies between connected owned territories
- [x] **Turn Management**: Automatic phase progression and player rotation
- [x] **Real-time Sync**: All players see updates instantly via Socket.io
- [x] **Battle System**: Animated dice with proper high-to-low comparison
- [x] **Territory Control**: Visual feedback for selections and valid targets
- [x] **Game State Persistence**: Complete Redux store with action history

### 🚧 Planned Features
- [ ] **Continent Bonuses**: Additional armies for controlling entire continents
- [ ] **Card System**: Territory cards and set trading for bonus armies
- [ ] **AI Players**: Computer opponents with different difficulty levels
- [ ] **Custom Maps**: Map editor and support for custom territory layouts
- [ ] **Tournament Mode**: Multi-game tournaments with leaderboards
- [ ] **Spectator Mode**: Watch games in progress without participating

## 🏗️ Architecture

```
risk-game/
├── 📁 frontend/           # React + TypeScript frontend
│   ├── src/components/    # React components (GameBoard, PhaseControls, etc.)
│   ├── src/store/         # Redux store and slices
│   ├── src/services/      # API and Socket.io services
│   └── src/types/         # TypeScript type definitions
├── 📁 backend/            # Node.js + TypeScript backend
│   ├── src/controllers/   # API route handlers
│   ├── src/services/      # Business logic (GameService, etc.)
│   ├── src/game/          # Game engine and world map
│   ├── src/config/        # Database and app configuration
│   └── src/types/         # TypeScript type definitions
├── 📄 setup-check.js      # Automated development environment setup
├── 📄 start-dev.ps1       # PowerShell development automation
└── 📄 STATUS.md           # Comprehensive documentation and troubleshooting
```

## 🎯 Tech Stack Details

### Frontend
- **React 18** with TypeScript for type-safe UI development
- **Redux Toolkit** for predictable state management
- **Vite** for lightning-fast development and building
- **Socket.io Client** for real-time multiplayer communication
- **Tailwind CSS** for responsive, utility-first styling
- **Vitest + React Testing Library** for component testing

### Backend
- **Node.js + Express** for robust server architecture
- **TypeScript** for type safety and better developer experience
- **Socket.io** for real-time bidirectional communication
- **PostgreSQL** or **SQLite** for flexible data persistence
- **JWT** for secure user authentication
- **Jest** for comprehensive unit and integration testing

### Game Engine
- **Custom Risk Logic**: Complete implementation of Risk game rules
- **Dice Mechanics**: Authentic battle system with proper probability
- **Turn Management**: Phase-based gameplay with player rotation
- **State Validation**: Comprehensive action validation and error handling
- **Real-time Sync**: Immediate updates across all connected clients

## 📋 Available Commands

### 🔧 Development
```bash
npm run setup              # Check and configure development environment
npm run dev                # Start both frontend and backend
npm run dev:frontend       # Start frontend only (port 5173)
npm run dev:backend        # Start backend only (port 5000)
npm run dev:quick          # Start without setup check
```

### 🏗️ Building & Production
```bash
npm run build              # Build both frontend and backend
npm run start              # Start production server
npm test                   # Run all tests (37 tests)
npm run lint               # Run all code quality checks
```

### 🧹 Maintenance
```bash
npm run clean              # Remove node_modules directories
npm run clean:install      # Clean and reinstall all dependencies
npm run install:all        # Install dependencies for all projects
```

## 🎲 How to Play

1. **Setup**: Join a game room with 2-6 players
2. **Reinforcement**: Deploy new armies to your territories
3. **Attack**: Battle adjacent enemy territories with dice
4. **Fortify**: Move armies between your connected territories
5. **Win**: Eliminate all other players by conquering their territories

The game follows classic Risk rules with authentic dice mechanics and strategic gameplay.

## 🧪 Testing

The project includes comprehensive test coverage:

- **Backend**: 20 tests covering game engine, services, and API logic
- **Frontend**: 17 tests covering Redux state management and UI components
- **Total**: 37 tests ensuring reliable gameplay and user experience

```bash
npm test           # Run all tests
npm run test:backend   # Run backend tests only
npm run test:frontend  # Run frontend tests only
```

## 🚀 Deployment

### Development
```bash
npm run setup && npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker (Optional)
```bash
npm run docker:up    # Start with Docker Compose
npm run docker:down  # Stop containers
```

## 🚀 Development Roadmap

We're transforming this Risk game into a comprehensive gaming platform! Based on research from modern gaming sites like Steam, Discord, and Chess.com, here's what's coming:

### 🎯 **Upcoming Features**

#### **Phase 1: Enhanced Navigation** ⏱️ 1-2 weeks
- 🏠 **Dashboard**: Personalized home with quick play, recent games, friend activity
- 🎮 **Play Hub**: Quick match, lobby browser, custom games, AI opponents
- 🗺️ **Maps Gallery**: Browse, rate, and discover community-created maps
- 👥 **Community**: Friends, leaderboards, tournaments, and social features
- 📊 **Profile System**: Stats, achievements, game history, and settings

#### **Phase 2: Social Features** ⏱️ 2-3 weeks  
- 👫 **Friends System**: Add friends, see their activity, invite to games
- 🏆 **Achievements**: Unlock badges for various gameplay milestones
- 📈 **Statistics**: Detailed analytics on your gameplay and improvement
- 💬 **Real-time Chat**: Lobby chat, private messages, community discussions

#### **Phase 3: Advanced Gaming** ⏱️ 3-4 weeks
- ⚔️ **Matchmaking**: Skill-based ranked games with competitive ladder
- 🎪 **Tournaments**: Community-organized events with brackets and prizes
- 🗺️ **Map Workshop**: Enhanced editor with sharing and collaboration
- 📱 **Mobile Optimization**: Touch-friendly interface for all devices

### 🌟 **Vision: Complete Gaming Platform**

Transform from a simple Risk game into a thriving gaming community with:
- **Personalized Experience**: Custom profiles, preferences, and recommendations
- **Social Gaming**: Friends, tournaments, and community-created content
- **Competitive Play**: Rankings, seasons, and organized tournaments
- **Content Creation**: Advanced map editor with sharing and rating system

### 📊 **Current Status**
- ✅ **Core Game**: Complete Risk gameplay with real-time multiplayer
- ✅ **Map Editor**: Advanced territory creation with special abilities
- ✅ **Database**: Robust schema supporting custom maps and game modes
- 🟡 **Next Up**: Enhanced navigation and dashboard (Phase 1)

> 📖 **See [CLAUDE.md](CLAUDE.md) for detailed technical implementation plans, API specifications, and database schemas.**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Port conflicts**: Backend (5000) or frontend (5173) ports in use
```bash
netstat -ano | findstr :5000
# Kill process if needed
```

**Database issues**: PostgreSQL not available
```bash
# The setup automatically falls back to SQLite
# Or install PostgreSQL and run: createdb risk_game
```

**Dependency issues**: Missing node_modules
```bash
npm run clean:install
```

For more detailed troubleshooting, see [CLAUDE.md](CLAUDE.md).

## 🌟 Acknowledgments

- Classic Risk board game for inspiration
- React and Node.js communities for excellent documentation
- TypeScript for making JavaScript development enjoyable
- Socket.io for seamless real-time communication

---

**Built with ❤️ and TypeScript** | **Happy Gaming! 🎲**
