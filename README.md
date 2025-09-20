# ConquestK - Multiplayer Strategy Board Game

<div align="center">
  
[![Live Demo](https://img.shields.io/badge/demo-conquestk.com-blue)](https://conquestk.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.11.0-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-19.1-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-purple)](LICENSE)

A modern, real-time multiplayer strategy board game inspired by Risk, built with cutting-edge web technologies.

</div>

## 🎮 Features

### Core Gameplay
- **Real-time Multiplayer** - Play with 2-6 players simultaneously
- **Custom Maps** - Create and share your own strategic battlegrounds
- **Multiple Game Modes** - Classic conquest, capitals, and more
- **ELO Rating System** - Competitive matchmaking and leaderboards
- **Spectator Mode** - Watch live games and learn strategies

### Technical Highlights
- **Instant Theme Switching** - Zero-flash CSS variable system
- **WebSocket Real-time Updates** - Low-latency game state synchronization  
- **Progressive Web App** - Install and play offline
- **Mobile Responsive** - Full touch support and adaptive UI
- **Admin Dashboard** - Complete game and user management

## 🚀 Quick Start

### Prerequisites
- Node.js 22.11+ 
- PostgreSQL 14+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/conquestk.git
cd conquestk

# Install dependencies
npm install

# Set up environment
npm run setup

# Start development servers
npm run dev
```

Frontend runs on http://localhost:5173  
Backend runs on http://localhost:5001

### Environment Setup

Create `backend/.env` with:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/risk_game
JWT_SECRET=your-secure-32-char-secret
SESSION_SECRET=your-secure-32-char-secret
```

See [backend/.env.example](backend/.env.example) for all configuration options.

## 🏗️ Tech Stack

### Frontend
- **React 19.1** - UI framework with concurrent features
- **TypeScript 5.9** - Type safety and modern JavaScript
- **Redux Toolkit** - State management
- **Tailwind CSS v4** - Utility-first styling
- **Vite 7** - Lightning-fast build tooling
- **Socket.io Client** - Real-time communication

### Backend
- **Node.js + Express 5** - Server framework
- **TypeScript** - Type-safe backend code
- **Socket.io** - WebSocket game synchronization
- **PostgreSQL** - Primary database
- **JWT + Sessions** - Dual authentication system
- **Bull.js** - Background job processing

### Infrastructure
- **Railway** - Production hosting and PostgreSQL
- **Sentry** - Error tracking and monitoring
- **Resend** - Transactional email service

## 📁 Project Structure

```
conquestk/
├── frontend/               # React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Route pages
│   │   ├── store/        # Redux state management
│   │   ├── services/     # API and socket services
│   │   └── types/        # TypeScript definitions
│   └── public/           # Static assets
│
├── backend/               # Express server
│   ├── src/
│   │   ├── game/         # Game engine and logic
│   │   ├── services/     # Business logic services
│   │   ├── socket/       # WebSocket handlers
│   │   ├── routes/       # REST API endpoints
│   │   └── db/          # Database queries
│   └── migrations/       # Database migrations
│
└── docs/                 # Documentation
```

## 🎯 Key Commands

```bash
# Development
npm run dev                 # Start both frontend and backend
npm run dev:frontend        # Frontend only
npm run dev:backend         # Backend only

# Testing
npm test                    # Run all tests
npm run test:backend        # Backend tests (Jest)
npm run test:frontend       # Frontend tests (Vitest)

# Code Quality
npm run lint                # Check for issues
npm run lint:fix           # Auto-fix issues
npm run format             # Format code

# Production
npm run build              # Build for production
npm start                  # Start production server

# Database
cd backend && npm run migrate     # Run migrations
cd backend && npm run seed:users  # Seed test data
```

## 🗺️ Map Editor

The Map Editor provides a comprehensive interface for creating custom maps:

1. **Upload** - Add background images for your map
2. **Territories** - Place and configure territory tokens
3. **Continents** - Group territories for bonus troops
4. **Connections** - Define territory adjacencies
5. **Capitals** - Set starting positions
6. **Validation** - Ensure map is playable
7. **Publish** - Submit for community use

Access at `/map-editor` when running locally.

## 📚 Documentation

- [Documentation index](docs/README.md) - Single entry point for all guides
- [Roadmap](docs/planning/ROADMAP.md) - Current priorities and backlog
- [Codebase cleanup plan](docs/planning/CODEBASE-CLEANUP.md) - Technical debt tracker
- [CLAUDE.md](CLAUDE.md) - AI assistant development guide

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow our [coding standards](docs/CODING-STANDARDS.md)
4. Write tests for new features
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests (aim for >70% coverage)
- Use semantic commit messages
- Update documentation for new features
- Ensure all tests pass before submitting PR

## 🔒 Security

- JWT-based authentication
- Session management with secure cookies
- Input validation and sanitization
- Rate limiting on API endpoints
- SQL injection prevention via parameterized queries
- XSS protection through React's default escaping

Report security issues to security@conquestk.com

## 📈 Performance

- Optimized React rendering with memoization
- WebSocket connection pooling
- Database query optimization with indexes
- Asset compression and caching
- Lazy loading for code splitting
- Service Worker for offline functionality

## 🚀 Deployment

The application is deployed on Railway with:
- Automatic deployments from main branch
- Database migrations on deploy
- Health monitoring endpoints
- Automatic SSL certificates

See [deployment guide](docs/DEPLOYMENT.md) for detailed instructions.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the classic Risk board game
- Built with modern web technologies
- Community-driven map creation
- Open source contributors

## 📬 Contact

- Website: [conquestk.com](https://conquestk.com)
- Issues: [GitHub Issues](https://github.com/yourusername/conquestk/issues)
- Email: support@conquestk.com

---

<div align="center">
Made with ❤️ by the ConquestK team
</div>