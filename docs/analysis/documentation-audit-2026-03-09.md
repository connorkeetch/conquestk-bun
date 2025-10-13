# Documentation Audit – March 9, 2026

_Last updated: March 9, 2026_

## Objective
Ensure all public documentation reflects the March 2026 feature set: match service observability, admin dashboard updates, AI evaluator changes, and refreshed launch planning.

## Updated in this pass
| Document | Status | Key notes |
| --- | --- | --- |
| [`README.md`](../../README.md) | ✅ Up to date | Go-live snapshot now reflects the Spring 2026 early-access target, admin dashboard improvements, and AI evaluator split between WASM (Grandmaster) and TypeScript (Recruit/Commander). |
| [`docs/reference/architecture.md`](../reference/architecture.md) | ✅ Up to date | Captures the `/api/matchsvc/status` proxy, match service subscriber lifecycle, and observability coverage surfacing in admin tooling. |
| [`docs/reference/matchsvc.md`](../reference/matchsvc.md) | ✅ Up to date | Documents Prometheus metrics, the Node status proxy, subscriber readiness, and admin dashboard consumption. |
| [`docs/reference/changelog.md`](../reference/changelog.md) | ✅ Up to date | Adds a March 2026 entry covering match service observability, admin dashboard uplift, AI WASM hardening, and client typing fixes. |
| [`docs/planning/roadmap.md`](../planning/roadmap.md) | ✅ Up to date | Moves the roadmap to March 2026, highlighting recently completed observability/AI milestones and the current Spring focus areas. |
| [`docs/planning/go-live-plan.md`](../planning/go-live-plan.md) | ✅ Up to date (historical) | Marks every P0 item as complete, adds an audit banner, and refreshes P1 statuses to reflect ongoing QA and AI work. |
| [`docs/planning/ai-players-plan.md`](../planning/ai-players-plan.md) | ✅ Up to date | Notes the WASM evaluator rollout, current tier availability, and revised implementation phase statuses. |
| [`docs/index.md`](../index.md) | ✅ Up to date | Bumps the index timestamp and links to this audit. |

## Reviewed with no changes required
- [`docs/reference/development.md`](../reference/development.md) – command catalog and tooling guidance remain accurate after the latest automation updates.
- [`docs/reference/ai-discovery.md`](../reference/ai-discovery.md) – pipeline description still aligns with current AI integration after the WASM evaluator changes.

## Follow-ups / watch list
- Update `docs/planning/browser-push-notification-improvements.md` once the creator/moderator fan-out work (roadmap Spring 2026 focus) ships.
- Expand `docs/reference/matchsvc.md` with deployment runbook details after the rollout guardrails and alerting work land.
- Revisit `docs/planning/game-modes-plan.md` after the March 2026 King of the Hill + Hidden Treasures smoke tests.
