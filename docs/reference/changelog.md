# Changelog

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
- Backward-compatible alias (still supported):
  - `POST /api/maps/:mapId/continents` → handled as sectors.
- Payload compatibility:
  - Territory accepts `sectorId` (preferred) or `continentId` (deprecated).
  - Map metadata uses `sectors` array (preferred). `continents` is still read and mapped to sectors via `mapWorkflowService`.

Game config compatibility
- Preferred config key: `sectorBonuses`.
- Legacy key: `continentBonuses` still read and applied.

Frontend compatibility
- Map Editor still uses internal `continents` state to avoid a large refactor; the service layer maps backend `sectors` → editor `continents` on read. Visible UI strings say “Sectors”.

Operational checks
- After deploy/migration:
  - Admin Maps list shows “Sectors” count and loads without errors.
  - Creating a sector via new route succeeds; legacy `/continents` works.
  - Starting a game on a custom map shows sector bonuses in reinforcement breakdown.

Breaking changes
- Direct DB consumers must update queries from `map_continents`/`continent` to `map_sectors`/`sector`.
- Client code or integrations referencing `continent_count` should adopt `sector_count` (we return both fields for a transition window).
