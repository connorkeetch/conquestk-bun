# 🎮 Risk Game - Claude AI Quick Reference

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
npm run dev                    # Start development servers
npm test                       # Run tests
npm run lint                   # Check code quality
npm run build                  # Build for production

# Environment Switching
./switch-env.sh development    # Switch to SQLite (Linux)
.\switch-env.ps1 development   # Switch to SQLite (Windows)
# Use these to switch between development (SQLite) and production (PostgreSQL)
```

## 🎯 Current Focus
1. **UI Consistency** - Tailwind-only, no DaisyUI
2. **Production** - Railway deployment at conquestk.com
3. **Map Editor** - ImageProcessor enhanced

*For detailed roadmap and feature status, see `docs/PROJECT-STATUS.md`*

## 🔧 MCP Servers Available
Your toolkit of powerful MCP servers - **USE THEM PROACTIVELY!**

### Core Tools
- **context7** (`mcp__context7__`): Get exact library docs & code examples - USE BEFORE implementing!
- **filesystem** (`mcp__filesystem__`): Advanced file operations
- **memory** (`mcp__memory__`): Knowledge graph for project context
- **github** (`mcp__github__`): Repository operations and PR management
- **fetch** (`mcp__fetch__`): Web content retrieval
- **puppeteer** (`mcp__puppeteer__`): Browser automation for testing
- **sequential-thinking** (`mcp__sequential-thinking__`): Step-by-step problem solving

### Zen Tools (Your AI Assistants!)
When stuck or need help, these are your go-to tools:
- **chat** (`mcp__zen__chat`): Brainstorm with AI models (Gemini, GPT, etc.)
- **debug** (`mcp__zen__debug`): Systematic bug hunting - USE when stuck!
- **thinkdeep** (`mcp__zen__thinkdeep`): Complex problem analysis
- **planner** (`mcp__zen__planner`): Break down complex tasks
- **consensus** (`mcp__zen__consensus`): Get multiple AI perspectives
- **analyze** (`mcp__zen__analyze`): Code architecture analysis
- **refactor** (`mcp__zen__refactor`): Find improvement opportunities
- **codereview** (`mcp__zen__codereview`): Comprehensive code review
- **precommit** (`mcp__zen__precommit`): Validate before committing
- **secaudit** (`mcp__zen__secaudit`): Security vulnerability scanning
- **testgen** (`mcp__zen__testgen`): Generate comprehensive tests
- **tracer** (`mcp__zen__tracer`): Trace code execution paths

### Usage Examples
```
# Stuck on a bug? Use debug!
mcp__zen__debug - "User login fails intermittently"

# Need exact React syntax? Use context7!
mcp__context7__get-library-docs - "React hooks useEffect"

# Complex feature? Plan it out!
mcp__zen__planner - "Implement real-time multiplayer"

# Not sure about approach? Get consensus!
mcp__zen__consensus - "Should we use WebSockets or SSE?"
```

**REMEMBER**: These tools are your superpowers - use them early and often!

---
*See docs/ folder for detailed information*