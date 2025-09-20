# 📚 ConquestK Documentation

_Last updated: February 21, 2025_

Welcome! All non-code knowledge now lives inside the `docs/` directory so you never have to hunt through the tree for Markdown files. Use this index as your map.

## 🚀 Quick start set
1. **Project overview** → [../README.md](../README.md)
2. **AI assistant guide** → [../CLAUDE.md](../CLAUDE.md)
3. **Roadmap & planning** → [planning/ROADMAP.md](planning/ROADMAP.md)
4. **Cleanup follow-ups** → [planning/CODEBASE-CLEANUP.md](planning/CODEBASE-CLEANUP.md)
5. **Owner expectations & tooling rules** → [../AGENTS.md](../AGENTS.md)

## 📁 Directory map
### Core reference
- [ARCHITECTURE.md](ARCHITECTURE.md) – system design, modules, and user preferences
- [DEVELOPMENT.md](DEVELOPMENT.md) – local environment setup
- [CODING-STANDARDS.md](CODING-STANDARDS.md) – linting, testing, and style rules
- [DEPLOYMENT.md](DEPLOYMENT.md) – production/staging promotion checklist

### Platform details
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) – full schema reference
- [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) – how we create and roll out migrations
- [LOGGING-STANDARDS.md](LOGGING-STANDARDS.md) – structured logging guidance
- [SECURITY-AUDIT.md](SECURITY-AUDIT.md) – security review checklist
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) – common issues & fixes
- [UPGRADE-LOG.md](UPGRADE-LOG.md) – notable dependency upgrades

### Feature documentation
- [MAP-FORMAT.md](MAP-FORMAT.md) – map JSON schema and editor workflow
- [THEME-SYSTEM.md](THEME-SYSTEM.md) – theming architecture and design tokens
- [EMAIL-VERIFICATION.md](EMAIL-VERIFICATION.md) – email/SaaS integration details
- [PLAYWRIGHT-MCP.md](PLAYWRIGHT-MCP.md) – end-to-end test harness

### Planning & maintenance
- [planning/ROADMAP.md](planning/ROADMAP.md) – active initiatives and backlog
- [planning/CODEBASE-CLEANUP.md](planning/CODEBASE-CLEANUP.md) – technical debt housekeeping list

### Backend deep dives
- [backend/PERFORMANCE-OPTIMIZATIONS.md](backend/PERFORMANCE-OPTIMIZATIONS.md) – caching, Redis, and scaling strategy
- [backend/WORKER-ARCHITECTURE.md](backend/WORKER-ARCHITECTURE.md) – Bull queue design and worker catalogue

### Frontend deep dives
- [frontend/MAP_SCHEMA.md](frontend/MAP_SCHEMA.md) – typed schema notes for map data shared with the UI

## 🧠 Agent & collaborator essentials
- **Who you’re helping:** Connor Keetch is the sole maintainer—write docs and PR messages assuming a solo developer who appreciates extra context.
- **Tooling contract:** Always spin up Context7 MCP and its helper tools before tackling complex work so stored context stays in sync.
- **Testing expectation:** Default to `npm run lint` plus the relevant test suite for any code change; only skip when modifications are documentation-only.
- **Environment quick checks:** Use `npm install`, `npm run setup`, and `npm run dev` for full-stack local development; `npm run dev:quick` bypasses the setup guard when you just need the servers running fast.

## 💡 Contributing to documentation
When you add or update docs:
1. Name files descriptively using `KEBAB-CASE.md`.
2. Update this index so future readers can find your content.
3. Cross-link related guides to avoid duplicated explanations.
4. Include "Last updated" metadata where practical so we know when to revisit a document.

## 🔍 Quick reference
- Project setup → [DEVELOPMENT.md](DEVELOPMENT.md)
## 🚀 Quick Start

New to the project? Start here:

1. **[Project Overview](../README.md)** - Getting started & project overview
2. **[AI Assistant Guide](../CLAUDE.md)** - Essential instructions for AI-assisted development
3. **[Development Tasks](../TODO.md)** - Current priorities and feature roadmap

## 📁 Documentation Structure

### Core Guides
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, codebase structure, and user preferences
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production & staging deployment procedures
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Local environment setup and configuration
- **[CODING-STANDARDS.md](CODING-STANDARDS.md)** - Code quality standards & best practices

### Feature Documentation
- **[MAP-FORMAT.md](MAP-FORMAT.md)** - Map file format specification and editor guide
- **[THEME-SYSTEM.md](THEME-SYSTEM.md)** - Theme architecture and customization
- **[EMAIL-VERIFICATION.md](EMAIL-VERIFICATION.md)** - Email system and authentication flows

### Database & Infrastructure
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Auto-generated database catalog (regenerate with `cd backend && npm run check:schema -- --skip-validation --export ../docs/DATABASE_SCHEMA.md`)
- **[MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)** - Database migration procedures

### Monitoring & Debugging
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **[SECURITY-AUDIT.md](SECURITY-AUDIT.md)** - Security review checklist
- **[UPGRADE-LOG.md](UPGRADE-LOG.md)** - Version upgrade history

### Testing
- **[PLAYWRIGHT-MCP.md](PLAYWRIGHT-MCP.md)** - End-to-end testing setup

## 💡 Contributing to Documentation

When adding new documentation:

1. **Follow naming conventions** - Use descriptive, uppercase filenames with hyphens
2. **Update this README** - Add your new document to the appropriate section above
3. **Include proper headers** - Use consistent markdown formatting
4. **Cross-reference related docs** - Link to related documentation where helpful
5. **Keep it current** - Update documentation when features change

## 🔍 Quick Reference

### Where to Find Key Information

**Getting Started:**
- Project setup → [README.md](../README.md)
- Development environment → [DEVELOPMENT.md](DEVELOPMENT.md)
- Coding guidelines → [CODING-STANDARDS.md](CODING-STANDARDS.md)

**Architecture & Design:**
- System architecture → [ARCHITECTURE.md](ARCHITECTURE.md)
- Database schema → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- Theme system → [THEME-SYSTEM.md](THEME-SYSTEM.md)

**Deployment & Operations:**
- Deployment guide → [DEPLOYMENT.md](DEPLOYMENT.md)
- Troubleshooting → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Security → [SECURITY-AUDIT.md](SECURITY-AUDIT.md)

**Database maintenance:**
- Regenerate schema catalog → `cd backend && npm run check:schema -- --skip-validation --export ../docs/DATABASE_SCHEMA.md`

**Features:**
- Map creation → [MAP-FORMAT.md](MAP-FORMAT.md)
- Email/Auth → [EMAIL-VERIFICATION.md](EMAIL-VERIFICATION.md)

---

*Last updated: January 18, 2025*
- Deployment workflow → [DEPLOYMENT.md](DEPLOYMENT.md)
- Debugging help → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

Looking for something that is missing? Add a stub in the relevant folder and link it above so we can fill in the details later.
