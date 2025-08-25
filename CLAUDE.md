# 🎮 Risk Game - Claude AI Operation Instructions

## 🚀 Quick Start
```bash
npm run setup && npm run dev
```
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5001
- **Live Demo**: [conquestk.com](https://conquestk.com)

## 🔴 CRITICAL RULES
1. **ALWAYS use Tailwind CSS v4** - NO inline styles, NO regular CSS
2. **NEVER create files unless necessary** - prefer editing existing files
3. **NEVER proactively create documentation** - only when explicitly requested
4. **Ignore GEMINI.md files** - not relevant to this project
5. **MUST use MCP servers and subagents** for specialized tasks (see below)
6. **ALWAYS use TodoWrite** for multi-step tasks

## 📚 Documentation Structure

| File | Purpose |
|------|---------|
| `CLAUDE.md` | THIS FILE - Core operation instructions |
| `docs/PROJECT-STATUS.md` | Feature status, achievements, roadmap |
| `docs/ARCHITECTURE.md` | Tech stack, database schema, map editor |
| `docs/DEVELOPMENT.md` | Commands, MCP servers, subagents |
| `docs/TROUBLESHOOTING.md` | Common issues and fixes |
| `CLAUDE-*.md` | Memory bank files (context/patterns/decisions) |

## 🤖 AI Guidance Principles

### Mentoring Approach
- **Be Educational**: Explain WHY solutions work, not just HOW
- **Code Quality First**: Prioritize maintainability over quick fixes
- **Challenge Assumptions**: Question flawed architecture
- **Show Trade-offs**: Explain "quick way" vs "right way"

### Core Operations
1. **Use code-searcher** for code analysis and troubleshooting
2. **Use context7** for any library/framework documentation needs
3. **Reflect on results** before proceeding with solutions
4. **Invoke tools simultaneously** for independent operations
5. **Verify solutions** before marking tasks complete
6. **Update memory bank** when changing core context

## 🤝 Development Partnership

We build production code together. I handle implementation details while you guide architecture and catch complexity early.

### Core Workflow: Research → Plan → Implement → Validate
**Start every feature with**: "Let me research the codebase and create a plan before implementing."

1. **Research** - Understand existing patterns and architecture (use code-searcher + context7 for library docs)
2. **Plan** - Propose approach and verify with you
3. **Implement** - Build with tests and error handling
4. **Validate** - ALWAYS run formatters, linters, and tests after implementation

### Code Organization
- Keep functions small and focused
- If you need comments to explain sections, split into functions
- Group related functionality into clear packages
- Prefer many small files over few large ones

### Architecture Principles
This is always a feature branch:
- Delete old code completely - no deprecation needed
- No versioned names (processV2, handleNew, ClientOld)
- No migration code unless explicitly requested
- No "removed code" comments - just delete it

Prefer explicit over implicit:
- Clear function names over clever abstractions
- Obvious data flow over hidden magic
- Direct dependencies over service locators

### Maximize Efficiency
- **Parallel operations**: Run multiple searches, reads, and greps in single messages
- **Multiple agents**: Split complex tasks - one for tests, one for implementation
- **Batch similar work**: Group related file edits together

### Problem Solving
- **When stuck**: Stop. The simple solution is usually correct.
- **When uncertain**: Ask for architecture guidance before implementing
- **When choosing**: Present options clearly (simple vs flexible)

## 🛠️ Required MCP Servers & Subagents

### MUST USE These Subagents:
- **code-searcher**: ALWAYS use for code analysis, debugging, finding patterns
- **memory-bank-synchronizer**: Keep docs in sync after major changes
- **ux-design-expert**: UI/UX guidance and design reviews
- **code-reviewer**: Run after implementing features

### Available MCP Servers:
- **context7**: Get up-to-date library docs (USE OFTEN for any library questions)
- **memory**: Store and search project context (REQUIRED for context)
- **filesystem**: File operations with proper permissions
- **git**: Advanced git operations and workflows
- **github**: Repository management and PRs
- **puppeteer**: Browser automation for testing
- **fetch**: Web content retrieval and analysis

## 🧠 Memory Bank System

### Context Files (Read when present)
- `CLAUDE-activeContext.md` - Current session state
- `CLAUDE-patterns.md` - Code patterns and conventions
- `CLAUDE-decisions.md` - Architecture decisions
- `CLAUDE-troubleshooting.md` - Proven solutions
- `CLAUDE-temp.md` - Scratch pad (only when referenced)

### Memory Search Examples
```bash
Search for "database schema"     # Table structure
Search for "port conflicts"      # Troubleshooting
Search for "Map Editor"          # Feature details
```

## ⚡ Quick Commands

```bash
# Development
npm run dev                # Start full stack
npm run setup             # Configure environment
npm test                  # Run all tests
npm run lint              # Check code quality

# Environment Switching
.\switch-env.ps1 development   # Use SQLite
.\switch-env.ps1 production    # Use PostgreSQL

# Context7 Usage Examples
# Use when working with ANY library: React, Express, Socket.io, Redux, etc.
# First resolve library ID, then get docs with specific topic focus
```

## 🎯 Current Focus Areas

1. **UI Consistency** - Tailwind-only approach, no DaisyUI/custom CSS
2. **Production Stability** - Monitor Railway deployment at conquestk.com
3. **Map Editor** - Enhanced with ImageProcessor for flexible image handling
4. **Push Notifications** - Currently disabled, VAPID keys needed

## 📋 Task Management

- **Always use TodoWrite** for multi-step tasks
- **Mark items complete immediately** after finishing
- **One task in_progress at a time**
- **Break complex work into specific steps**

---
*For detailed information, check the docs/ folder files listed above*