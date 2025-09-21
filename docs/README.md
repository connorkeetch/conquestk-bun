# 📚 ConquestK Documentation

_Last updated: September 21, 2025_

Welcome! Every guide, decision record, and troubleshooting note lives in the `docs/` directory.
Use this index to jump directly to the information you need.

---

## 🚀 Quick start checklist

- Project overview & onboarding → [../README.md](../README.md)
- Local development setup → [DEVELOPMENT.md](DEVELOPMENT.md)
- Architecture & technical overview → [ARCHITECTURE.md](ARCHITECTURE.md)
- Coding & review standards → [CODING-STANDARDS.md](CODING-STANDARDS.md)
- Troubleshooting playbook → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Owner expectations & AI usage → [../AGENTS.md](../AGENTS.md)
- AI assistant guidelines → [../CLAUDE.md](../CLAUDE.md)
- Roadmap & follow-up work → [planning/ROADMAP.md](planning/ROADMAP.md)
- Codebase cleanup tracker → [planning/CODEBASE-CLEANUP.md](planning/CODEBASE-CLEANUP.md)

---

## 🗂️ Directory index

### Core reference
- [ARCHITECTURE.md](ARCHITECTURE.md) – system design, packages, and deployment shape
- [DEVELOPMENT.md](DEVELOPMENT.md) – local environment setup and workflow commands
- [CODING-STANDARDS.md](CODING-STANDARDS.md) – linting, testing, and review expectations
- [DEPLOYMENT.md](DEPLOYMENT.md) – promotion checklist for staging and production
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) – common issues and quick fixes

### Platform operations
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) – exported catalog of tables and relationships
- [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) – writing, testing, and shipping migrations
- [LOGGING-STANDARDS.md](LOGGING-STANDARDS.md) – structured logging patterns
- [SECURITY-AUDIT.md](SECURITY-AUDIT.md) – recurring security review checklist
- [UPGRADE-LOG.md](UPGRADE-LOG.md) – notable dependency upgrades with dates
- [PLAYWRIGHT-MCP.md](PLAYWRIGHT-MCP.md) – end-to-end testing harness overview

### Feature & product deep dives
- [MAP-FORMAT.md](MAP-FORMAT.md) – map JSON schema and editor workflow
- [THEME-SYSTEM.md](THEME-SYSTEM.md) – design tokens and theming strategy
- [EMAIL-VERIFICATION.md](EMAIL-VERIFICATION.md) – verification, password reset, and notifications
- [CLAN-SYSTEM-PLAN.md](CLAN-SYSTEM-PLAN.md) – future social/clan feature planning
- [mobile-app-strategy.md](mobile-app-strategy.md) – recommended mobile distribution approach

### Package-specific guides
- **Backend**
  - [backend/WORKER-ARCHITECTURE.md](backend/WORKER-ARCHITECTURE.md)
- **Frontend**
  - [frontend/MAP_SCHEMA.md](frontend/MAP_SCHEMA.md)

### Planning & status
- [planning/ROADMAP.md](planning/ROADMAP.md) – live initiatives and backlog
- [planning/CODEBASE-CLEANUP.md](planning/CODEBASE-CLEANUP.md) – technical debt tracker
- [planning/go_live_plan.md](planning/go_live_plan.md) – launch-blocker backlog and execution order
- [planning/TYPING-ROADMAP.md](planning/TYPING-ROADMAP.md) – schedule for removing remaining `any` types

---

## ✍️ Contributing to documentation

1. Use descriptive filenames in `KEBAB-CASE.md`.
2. Update this index whenever you add or retire a document.
3. Cross-link related guides to avoid duplicating explanations.
4. Include a "Last updated" line in substantive docs so we can review stale content quickly.

---

## 🔍 Need something else?

If a topic is missing, add a stub document in the appropriate folder and link it above. Leaving a
TODO section is better than letting knowledge live only in Slack or memory.
