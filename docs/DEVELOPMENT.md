# Development Guide

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