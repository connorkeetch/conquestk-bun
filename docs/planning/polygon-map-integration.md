# Polygon Map Support Integration Plan

## Overview
This document outlines the work required to support both token-based and polygon-based map creation and gameplay inside ConquestK. The current roadmap prioritizes the token editor (`/map-editor`), but the legacy polygon editor (`/map-editor-polygon`) still exists. We evaluate how much effort it would take to let creators author polygon maps again and allow games to run on either format.

## Current state analysis

### Map editors
- **Token editor** – `MapEditorTokens.tsx` is wired into the new map workflow API and persists drafts (including background uploads) through `/api/workflow/drafts` before publishing.【F:frontend/src/pages/MapEditorTokens.tsx†L11-L148】【F:frontend/src/pages/MapEditorTokens.tsx†L1088-L1191】
- **Polygon editor** – `MapEditor.tsx` still uses the older `/api/maps` endpoints. Saving a map walks through `mapService.createMap`, then issues follow-up calls per sector (formerly continent), territory, and adjacency, making it incompatible with the workflow-based publish/review pipeline we now use for community maps.【F:frontend/src/pages/MapEditor.tsx†L844-L883】
- The polygon editor stores polygon vertices locally while drawing (`boundaryCoords`) and posts them through the legacy APIs. The token editor only tracks token coordinates (`x`, `y`) and never captures polygon data.【F:frontend/src/pages/MapEditor.tsx†L496-L536】【F:frontend/src/pages/MapEditorTokens.tsx†L16-L112】

### Data & backend pipeline
- The shared map metadata format already supports both polygons and tokens; polygons provide a `boundaryCoords` array while tokens omit it.【F:docs/guides/map-format.md†L90-L160】
- When a draft is published, `MapWorkflowService.buildMapPayloadFromDraft` forwards whatever territory objects the editor collected into `MapMetadataPayload`. There is no polygon-specific logic, so polygon drafts would flow through if the editor submits the correct shape data.【F:backend/src/services/mapWorkflowService.ts†L672-L741】
- The map service persists polygon geometry in `map_territories.polygon_data` and rehydrates coordinates and centroid for gameplay access, so the backend is already polygon-aware.【F:backend/src/services/mapService.ts†L708-L759】【F:backend/src/services/mapService.ts†L1108-L1138】

### Gameplay rendering
- The live game board renders custom maps through `CustomMapDisplay`, which places clickable buttons at each territory’s `x`/`y` coordinates. It does not draw polygon outlines nor perform point-in-polygon hit testing, so a pure polygon map would render as blank background without territories.【F:frontend/src/components/CustomMapDisplay.tsx†L1-L119】【F:frontend/src/components/CustomMapDisplay.tsx†L120-L189】

**Conclusion:** The data layer already supports polygons, but the modern editor workflow and the in-game renderer are token-only. Supporting polygon maps requires work across the editor and game UI layers.

## Feasibility and recommended approach
Supporting both formats is achievable but not trivial. The highest-effort areas are migrating the polygon editor onto the workflow API and teaching the game client to render polygon territories (with hover, selection, and ownership styling). We recommend the following phased plan.

### Phase 1 – Workflow alignment (≈2–3 days)
1. **Normalize polygon metadata**: extend `MapEditorTokens` draft payloads to accept `boundaryCoords` when present so both editors can share the same draft schema. No UI change yet, just type updates and validation.
2. **Refactor polygon editor persistence**: replace the direct `/api/maps` calls with the workflow draft endpoints so polygon maps pass through the same review/publish path as token maps. Introduce a serializer that converts polygon editor state into `MapDraftPayload` (territories with `boundaryCoords`, continents, adjacencies, capital assignments).
3. **Draft migration utilities**: add scripts or admin endpoints to import existing legacy polygon maps into the draft workflow for QA and regression testing.

### Phase 2 – Editor UX integration (≈3–5 days)
1. **Mode switcher**: surface a toggle or landing screen inside `/map-editor` that lets creators choose “Token mode” or “Polygon mode” and routes to the appropriate editor.
2. **Shared assets**: consolidate image upload/cropping flows so both modes reuse the new `ImageProcessor` pipeline (currently only the token editor uses it).
3. **Validation & onboarding**: align validation messages, terms acceptance, and autosave behaviour between the two editors so the experience feels consistent.

### Phase 3 – Gameplay support (≈5–7 days)
1. **Polygon rendering**: update `CustomMapDisplay` (and any other map renderers) to draw SVG polygons when `boundaryCoords` exist, while still showing tokens when only centroids are provided. Implement hover/selection highlighting and keep accessibility cues.
2. **Hit testing**: add point-in-polygon checks for clicks/touches to select the correct polygon territory and fall back to token hitboxes when polygons are absent.
3. **Responsive scaling**: ensure polygons scale alongside the map background within `ResponsiveMapContainer` and validate on mobile/touch devices.
4. **QA automation**: add integration tests or Cypress/Playwright scripts that load sample polygon maps to verify rendering and interaction paths.

### Phase 4 – Polishing & rollout (≈1–2 days)
- Update documentation (map format guide, creator onboarding docs) to explain the two editing modes and when to use each.
- Provide migration guidance for any existing polygon map JSON exports.
- Capture analytics/telemetry to understand adoption and catch regressions.

## Risks & considerations
- **Technical debt**: the legacy polygon editor codebase predates the workflow service and may require cleanup while refactoring it to use drafts.
- **Performance**: large polygon maps may introduce rendering costs; we should profile SVG performance and consider simplification tools.
- **Gameplay parity**: features like fog of war, modifiers, or future mechanics tied to token positions need polygon equivalents (e.g., where to show army counts when territories are irregular).

## Recommendation
Treat polygon support as a secondary initiative after the token editor ships. The incremental plan above lets us stage the work—first unifying persistence, then integrating the UI, and finally upgrading gameplay rendering. If we commit to all phases, expect roughly 2–3 weeks of engineering time with design/QA support to reach production quality. Until then, restrict new map creation to the token editor to avoid inconsistent player experiences.
