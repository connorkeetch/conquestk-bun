# 📚 ConquestK Documentation

 _Last updated: September 29, 2025_

Welcome! Every guide, decision record, and troubleshooting note lives in the `docs/` directory.
Use this index to jump directly to the information you need.

---

## 🚀 Quick start checklist

- Project overview & onboarding → [../README.md](../README.md)
- Local development setup → [reference/development.md](reference/development.md)
- Architecture & technical overview → [reference/architecture.md](reference/architecture.md)
- Coding & review standards → [guides/coding-standards.md](guides/coding-standards.md)
- Troubleshooting playbook → [operations/troubleshooting.md](operations/troubleshooting.md)
- Owner expectations & AI usage → [../AGENTS.md](../AGENTS.md)
- AI assistant guidelines → [../CLAUDE.md](../CLAUDE.md)
- Roadmap & follow-up work → [planning/roadmap.md](planning/roadmap.md)
- Codebase cleanup tracker → [planning/codebase-cleanup.md](planning/codebase-cleanup.md)

---

## 🗂️ Directory index

### Core reference
- [reference/architecture.md](reference/architecture.md) – system design, packages, and deployment shape
- [reference/development.md](reference/development.md) – local environment setup and workflow commands
- [reference/deployment.md](reference/deployment.md) – promotion checklist for staging and production
- [reference/ai-discovery.md](reference/ai-discovery.md) – AI opponent turn pipeline, telemetry, and decision contract
- [reference/changelog.md](reference/changelog.md) – notable changes and release notes
- [guides/coding-standards.md](guides/coding-standards.md) – linting, testing, and review expectations
- [operations/troubleshooting.md](operations/troubleshooting.md) – common issues and quick fixes

### Platform operations
- [operations/database-schema.md](operations/database-schema.md) – exported catalog of tables and relationships
- [operations/migration-guide.md](operations/migration-guide.md) – writing, testing, and shipping migrations
- [operations/logging-standards.md](operations/logging-standards.md) – structured logging patterns
- [operations/security-audit.md](operations/security-audit.md) – recurring security review checklist
- [guides/playwright-mcp.md](guides/playwright-mcp.md) – end-to-end testing harness overview
- [operations/player-stats-smoke-test.md](operations/player-stats-smoke-test.md) – smoke tests for player stats accuracy

### Feature & product deep dives
- [guides/game-options.md](guides/game-options.md) – Create Game options and what they do today
- [guides/map-format.md](guides/map-format.md) – map JSON schema and editor workflow
- [guides/map-import-packages.md](guides/map-import-packages.md) – bulk import format and packaging
- [guides/theme-system.md](guides/theme-system.md) – design tokens and theming strategy
- [guides/email-verification.md](guides/email-verification.md) – verification, password reset, and notifications
- [guides/achievements.md](guides/achievements.md) – achievements system overview and rules
- [guides/hidden-treasures.md](guides/hidden-treasures.md) – Hidden Treasures ruleset and configuration
- [planning/game-room-plan.md](planning/game-room-plan.md) – canonical Game Room UI/UX plan and implementation notes
- [planning/game-room-ux-review.md](planning/game-room-ux-review.md) – Game Room UI/UX audit and improvements
- [planning/clan-system-plan.md](planning/clan-system-plan.md) – future social/clan feature planning
- [planning/mobile-app-strategy.md](planning/mobile-app-strategy.md) – recommended mobile distribution approach

### Package-specific guides
- **Backend**
  - [backend/worker-architecture.md](backend/worker-architecture.md)
- **Frontend**
  - [frontend/map-schema.md](frontend/map-schema.md)

### Planning & status
- [planning/roadmap.md](planning/roadmap.md) – live initiatives and backlog
- [planning/codebase-cleanup.md](planning/codebase-cleanup.md) – technical debt tracker
- [planning/go-live-plan.md](planning/go-live-plan.md) – launch-blocker backlog and execution order
- [planning/typing-roadmap.md](planning/typing-roadmap.md) – schedule for removing remaining `any` types
- [planning/achievements-plan.md](planning/achievements-plan.md) – planned achievements milestones and dependencies
- [planning/ai-players-plan.md](planning/ai-players-plan.md) – AI player strategy and roadmap
- [planning/browser-push-notification-improvements.md](planning/browser-push-notification-improvements.md) – push notifications plan
- [planning/colorblind-mode-plan.md](planning/colorblind-mode-plan.md) – accessibility color‑blind palette plan
- [planning/forum-section-plan.md](planning/forum-section-plan.md) – community forum feature planning
- [planning/polygon-map-integration.md](planning/polygon-map-integration.md) – polygon map rendering approach
- [planning/profile-page-ux-review.md](planning/profile-page-ux-review.md) – profile UX audit and follow‑ups
- [planning/site-wide-chat.md](planning/site-wide-chat.md) – site‑wide chat concept and constraints
- [planning/slack-discord-notification-plan.md](planning/slack-discord-notification-plan.md) – Slack/Discord notifications plan

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
