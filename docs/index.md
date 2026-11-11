# 📚 ConquestK Documentation

_Public-source status reviewed: November 11, 2026_

> **Maintenance status — November 11, 2026:** This is an inactive personal project, shared for reference and experimentation. No ongoing feature work, releases, or support response times are planned. Issues and pull requests may go unanswered.

This directory preserves historical guides and design notes for **conquestk-bun**. Start with the [current README](../README.md) for the correct runtime, repository/branch, local setup, required services, known gaps, licensing status, and support expectations. Old launch dates, “active” roadmaps, production/staging URLs, and environment examples do not describe an available deployment of this snapshot. Source code and package manifests take precedence when older guides disagree.

Operational scripts are for databases and services you control. A fresh install does not need access to the original infrastructure.
---

## 🚀 Quick start checklist

- Project overview & onboarding → [../README.md](../README.md)
- Local development setup → [reference/development.md](reference/development.md)
- Architecture & technical overview → [reference/architecture.md](reference/architecture.md)
- Coding & review standards → [guides/coding-standards.md](guides/coding-standards.md)
- Troubleshooting playbook → [operations/troubleshooting.md](operations/troubleshooting.md)
- Owner expectations & AI usage → [../AGENTS.md](../AGENTS.md)
- AI assistant guidelines → [../CLAUDE.md](../CLAUDE.md)
 - Soft launch timeline → [planning/soft-launch-timeline.md](planning/soft-launch-timeline.md)
- Roadmap & follow-up work → [planning/roadmap.md](planning/roadmap.md)

---

## 🗂️ Directory index

### Core reference
- [reference/architecture.md](reference/architecture.md) – system design, packages, and deployment shape
- [reference/development.md](reference/development.md) – local environment setup and workflow commands
- [reference/deployment.md](reference/deployment.md) – promotion checklist for staging and production
- [reference/matchsvc.md](reference/matchsvc.md) – Go microservice for presence, matchmaking, and ratings
- [reference/ai-discovery.md](reference/ai-discovery.md) – AI opponent turn pipeline, telemetry, and decision contract
- [reference/changelog.md](reference/changelog.md) – notable changes and release notes
- [guides/coding-standards.md](guides/coding-standards.md) – linting, testing, and review expectations
- [operations/troubleshooting.md](operations/troubleshooting.md) – common issues and quick fixes

### Platform operations
- [operations/database-schema.md](operations/database-schema.md) – exported catalog of tables and relationships
- [operations/migration-guide.md](operations/migration-guide.md) – writing, testing, and shipping migrations
- [operations/logging-standards.md](operations/logging-standards.md) – structured logging patterns
- [operations/security-audit.md](operations/security-audit.md) – recurring security review checklist
- [operations/player-stats-smoke-test.md](operations/player-stats-smoke-test.md) – smoke tests for player stats accuracy

### Feature & product deep dives
- [guides/game-options.md](guides/game-options.md) – Create Game options and what they do today
- [guides/map-format.md](guides/map-format.md) – map JSON schema and editor workflow
- [guides/map-import-packages.md](guides/map-import-packages.md) – bulk import format and packaging
- [guides/theme-system.md](guides/theme-system.md) – design tokens and theming strategy
- [guides/email-verification.md](guides/email-verification.md) – verification, password reset, and notifications
- [guides/achievements.md](guides/achievements.md) – achievements system overview and rules
- [guides/hidden-treasures.md](guides/hidden-treasures.md) – Hidden Treasures ruleset and configuration
- [guides/real-time-reliability.md](guides/real-time-reliability.md) – real-time reliability features
- [planning/game-room-plan.md](planning/game-room-plan.md) – canonical Game Room UI/UX plan and implementation notes
- [planning/clan-system-plan.md](planning/clan-system-plan.md) – future social/clan feature planning
- [planning/mobile-app-strategy.md](planning/mobile-app-strategy.md) – recommended mobile distribution approach

### Package-specific guides
- **Frontend**
  - [frontend/map-schema.md](frontend/map-schema.md)

### Planning & status
- [planning/roadmap.md](planning/roadmap.md) – historical initiatives and backlog
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

### Analysis & audits
- [analysis/documentation-audit-2026-03-09.md](analysis/documentation-audit-2026-03-09.md) – March 2026 documentation audit outcomes

---

## ✍️ Contributing to documentation

1. Use descriptive filenames in `KEBAB-CASE.md`.
2. Update this index whenever you add or retire a document.
3. Cross-link related guides to avoid duplicating explanations.
4. Include a "Last updated" line in substantive docs so we can review stale content quickly.

---

## 🔍 Need something else?

Search the code, tests, and existing issues first. If you document a missing topic in a fork or pull request, distinguish observed behavior from a proposed design and link it here. Replies and documentation updates are not guaranteed.

Looking for end-to-end or worker architecture details? See [reference/development.md](reference/development.md#playwright-smoke-tests) for the Playwright harness and [reference/architecture.md](reference/architecture.md#workers--queues) for BullMQ worker coverage.
