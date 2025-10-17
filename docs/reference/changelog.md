# Changelog

## 2026-03-09 — Match Service observability & AI eval hardening

Summary
- Added `/api/matchsvc/status` on the Node backend to aggregate health, Redis reachability, subscriber readiness, HMAC auth validation, and Prometheus metrics from the Go match service. The Admin Dashboard now renders a dedicated card showing health, matches formed, presence online, and per-mode queue depths.
- Promoted the match service status data to the frontend admin dashboard with a refresh action so operators can inspect queue pressure without leaving the app.
- Upgraded the Rust/WASM AI evaluator to support persistent handles and bulk typed-array odds calculation. Grandmaster difficulty now routes through the WASM engine exclusively, while Recruit/Commander stick with the TypeScript heuristics to preserve throughput.
- Hardened the shared `@conquestk/match-client` so `hmacSecret` is always a concrete string under exact optional property typing.

Operational checks
- Verify `/api/matchsvc/status` returns `ok: true` when the Go service, Redis, and subscriber are healthy, and that metrics include queue depth and totals.
- Confirm the Admin Dashboard’s Match Service card displays health, subscriber state, presence total, matches formed, and queue chips per mode.
- Trigger `Run Odds Shadow Verification` from the Admin Dashboard and confirm divergence metrics update alongside WASM odds.

## 2025-10-16 — Sector cleanup & migration 018

Summary
- Removed the final continent fallbacks across backend services, shared types, and the frontend UI.
- Dropped legacy `continent_id`/`continent_bonuses` columns, renamed `map_sectors` constraints, and scrubbed JSON metadata via migration `20251016221139_018_remove_continent_fallbacks.sql`.
- Deleted the `/api/maps/:mapId/continents` alias; `sectorBonuses` is now the sole config key and `sectorCount` the only aggregate exposed to clients.
- Updated the map editor, admin dashboards, selectors, and reinforcement helpers to assume sector-only metadata.

Operational checks
- Apply the migration with `cd backend && npm run migrate`; verify it completes without manual intervention.
- Confirm admin map listings show `sectorCount` (no duplicate continent column) and that map drafts save `sectors` metadata.
- Run a game on a custom map and ensure sector bonus panels render and reinforcement calculations match expectations.

Breaking changes
- API responses no longer include `continent_count` or `continentBonuses` fields. Update any scripts or tests expecting them.
- Requests supplying `continentId` are rejected; clients must send `sectorId`.

## 2025-09-29 — Terminology Update: Continents → Sectors

Summary
- Replaced the term “continent(s)” with “sector(s)” across frontend, backend, shared types, and docs.
- Schema snapshot now exposes `map_sectors` and `map_territories.sector` in `backend/migrations/001_baseline_schema.sql`.
- Client/server remain backward-compatible for a transition period.

Database migration
- `backend/migrations/001_baseline_schema.sql` (re-exported snapshot) defines `map_sectors`, updates `map_versions.sectors`, and maps territory rows to the new `sector` column.
- Existing environments created before this date should apply the archived migration from the release branch or run the provided SQL one-off. Verify with `\d+ map_sectors`.

API compatibility
- New endpoints:
  - `POST /api/maps/:mapId/sectors`
- Backward-compatible alias (deprecated as of 2025-10-16):
  - `POST /api/maps/:mapId/continents` → handled as sectors.
- Payload compatibility:
  - Territory accepts `sectorId` (preferred) or `continentId` (deprecated until 2025-10-16).
  - Map metadata uses `sectors` array (preferred). `continents` is still read and mapped to sectors via `mapWorkflowService` during the transition window.

Game config compatibility
- Preferred config key: `sectorBonuses`.
- Legacy key: `continentBonuses` still read and applied prior to 2025-10-16.

Frontend compatibility
- Map Editor initially used internal `continents` state to avoid a large refactor; the service layer mapped backend `sectors` → editor `continents` on read. Visible UI strings said “Sectors”. (Fully sectorized in the 2025-10-16 entry.)

Operational checks
- After deploy/migration:
  - Admin Maps list shows “Sectors” count and loads without errors.
  - Creating a sector via new route succeeds; legacy `/continents` works.
  - Starting a game on a custom map shows sector bonuses in reinforcement breakdown.

Breaking changes
- Direct DB consumers must update queries from `map_continents`/`continent` to `map_sectors`/`sector`.
- Client code or integrations referencing `continent_count` should adopt `sector_count` (we return both fields for a transition window).
