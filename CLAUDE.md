# 🎮 Risk Game - Claude AI Quick Reference

## 🚀 Quick Start
```bash
npm run setup && npm run dev
```
Frontend: http://localhost:5173 | Backend: http://localhost:5001 | Live: [conquestk.com](https://conquestk.com)

## 🔴 CRITICAL RULES
1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **NEVER create files unless necessary** - prefer editing existing files
3. **NEVER proactively create documentation** - only when explicitly requested
4. **MUST use MCP servers and subagents** for specialized tasks
5. **ALWAYS use TodoWrite** for multi-step tasks

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
- **Use context7**: For ANY library documentation needs
- **Parallel Operations**: Run multiple tools simultaneously
- **Validate Always**: Run linters and tests after changes

## 🛠️ Required Subagents
- **code-searcher**: Code analysis and debugging (USE OFTEN)
- **memory-bank-synchronizer**: Keep docs in sync
- **ux-design-expert**: UI/UX guidance
- **code-reviewer**: After feature implementation

## 🧠 Memory Bank
Search memory for: "database schema", "port conflicts", "Map Editor", etc.

## ⚡ Essential Commands
```bash
npm run dev                    # Start development
npm test                       # Run tests
npm run lint                   # Check code quality
./switch-env.sh development    # Use SQLite (Linux)
.\switch-env.ps1 development   # Use SQLite (Windows)
```

## 🎯 Current Focus
1. **UI Consistency** - Tailwind-only, no DaisyUI
2. **Production** - Railway deployment at conquestk.com
3. **Map Editor** - ImageProcessor enhanced

---
*See docs/ folder for detailed information*