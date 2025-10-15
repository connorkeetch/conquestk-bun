# Soft Launch Timeline & Rollout

_Status: development-only; subject to change_

## Target
- Soft launch (friends-and-family): October 24, 2025
- Audience: Connor + close friends only for the first few months; no marketing push during this period.

## Principles
- Prefer clean, breaking changes over long-lived shims during the dev-only phase.
- Destructive migrations are acceptable; reseed local/staging data as needed.
- Coordinate FE/BE changes in the same PR to avoid temporary compatibility layers.
- Avoid risky multi-step migrations right before scheduled play sessions.

## Phases
- Phase 0 (Now → Soft launch):
  - Land high-impact refactors, remove deprecated sockets/routes, simplify APIs around `game-action`.
  - Update docs as behavior changes (AGENTS.md/CLAUDE.md remain in sync).
- Phase 1 (Soft launch months):
  - Focus on stability and UX polish for the small cohort.
  - Keep migrations straightforward; batch schema changes after sessions where possible.
  - Add minimal rollback notes to PRs.
- Phase 2 (Pre-marketing hardening):
  - Expand telemetry, accessibility presets, and operational guardrails.
  - Revisit any shortcuts taken during dev-only to confirm readiness for broader access.

## Owner Notes
- If plans change, update this file and the banner in `AGENTS.md` / `CLAUDE.md` so assistants ingest the current assumptions.

