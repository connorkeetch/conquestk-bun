# 🗺️ Risk Game Map Data Reference

This document consolidates the previous *Map Format* and *Map Schema* guides into a single source of truth for how maps are modeled, edited, stored, and reviewed inside ConquestK.

## 1. System overview

Maps flow through three layers that share a common data shape:

1. **Draft & editor metadata** – JSON produced by the map editor (`/map-editor`) or imported from JSON files. Drafts live in `map_drafts` until they are published.
2. **Published map records** – When a draft is published it becomes a row in `maps`, with related rows in `map_territories`, `map_continents`, and `territory_adjacencies`. The original editor JSON is persisted in `maps.metadata` for round-tripping.
3. **Runtime game state** – Game rooms read from the published tables and expand each territory into the richer in-memory structures used by the engine.

The sections below describe each part of this pipeline in detail.

---

## 2. Database schema summary

The full, authoritative schema lives in [`docs/DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md). The most relevant tables are summarised here for quick reference.

### 2.1 `maps`

| Column | Notes |
| --- | --- |
| `id` (`uuid`) | Primary key for the map. |
| `name`, `description` | Display metadata (name must be unique, ≥3 characters). |
| `creator_id` | Authoring user; used for ownership & permissions. |
| `status` | Workflow status (`draft`, `pending_review`, `approved`, `rejected`, `archived`). |
| `image_url`, `image_width`, `image_height` | Background image path served by the backend plus its pixel dimensions. |
| `is_public`, `is_featured`, `is_vip_only`, `min_premium_tier` | Visibility flags and gating controls. |
| `min_players`, `max_players` | Recommended player counts (2–12 enforced). |
| `tags` | Text array used for search filters. |
| `capital_assignments`, `capital_territories`, `capital_metadata` | JSON blobs for capital placement metadata. `capital_territories` stores `{ territoryId: [playerCounts...] }`. |
| `metadata` | The editor payload (territories, continents, adjacencies, dimensions, capitals). Keeps the JSON the editor understands. |
| `rating_average`, `rating_count`, `play_count` | Aggregated engagement metrics. |
| `created_at`, `updated_at`, `submitted_at`, `reviewed_at`, `reviewed_by`, `review_notes`, `rejection_reason` | Workflow bookkeeping fields. |

### 2.2 `map_territories`

Each row represents a single territory on a published map.

| Column | Notes |
| --- | --- |
| `id` (`uuid`) | Unique identifier; reused as `territoryId` when the map is loaded. |
| `map_id` | Foreign key → `maps.id`. |
| `name` | Display label shown in the UI. |
| `polygon_data` (`jsonb`) | Serialized geometry & display metadata. See [Section 4](#4-territory-serialization) for the exact shape. |
| `continent` | Name of the continent this territory belongs to. |
| `is_capital` | Boolean flag for capital territories. |
| `capital_for_players` (`jsonb`) | Array of player counts where this territory is a valid capital. |
| `created_at` | Timestamp. |

### 2.3 `map_continents`

| Column | Notes |
| --- | --- |
| `id` (`uuid`) | Unique identifier. |
| `map_id` | Foreign key → `maps.id`. |
| `name` | Display label. |
| `bonus_troops` | Bonus armies awarded for continent control (≥0 enforced). |
| `color` | Hex string used by the frontend. |
| `requirements` (`jsonb`) | Reserved for advanced rule metadata. |
| `created_at` | Timestamp. |

### 2.4 `territory_adjacencies`

Connections are stored as **directed edges**; the import pipeline writes both directions for bidirectional links.

| Column | Notes |
| --- | --- |
| `id` (`uuid`) | Unique identifier. |
| `map_id` | Foreign key → `maps.id`. |
| `territory_from`, `territory_to` | Territory identifiers (by name/ID) that can interact. |

### 2.5 Workflow-supporting tables

| Table | Purpose |
| --- | --- |
| `map_images_staging` | Temporary storage for uploaded background images before publish. |
| `map_drafts` | Autosaved editor state (metadata, territories, continents, adjacencies, capital assignments, and image metadata). |
| `map_review_queue` | Queue of maps awaiting moderator action. |
| `map_reviews` | Moderator decisions and optional ratings/comments. |
| `map_submission_logs` | Audit log of workflow actions (submitted, approved, rejected, archived). |
| `map_versions` | Historical snapshots whenever a map is edited. |

---

## 3. Map metadata & draft JSON schema

The editor, draft service, and `maps.metadata` column all share the following structure (TypeScript reference: `MapMetadataPayload`).

```jsonc
{
  "name": "Frozen Isles",
  "description": "Compact 12-territory skirmish map",
  "width": 1920,
  "height": 1080,
  "territories": [
    {
      "id": "frozen_wastes",
      "name": "Frozen Wastes",
      "continentId": "northern_lands",
      "armyPosition": { "x": 150, "y": 80 },
      "boundaryCoords": [
        { "x": 120, "y": 60 },
        { "x": 190, "y": 65 },
        { "x": 200, "y": 120 }
      ],
      "connections": ["ice_peaks", "tundra_plains"],
      "isCapital": false
    },
    {
      "id": "ice_peaks",
      "name": "Ice Peaks",
      "continentId": "northern_lands",
      "armyPosition": { "x": 300, "y": 80 },
      "connections": ["frozen_wastes", "tundra_plains", "mountain_pass"]
    }
  ],
  "continents": [
    {
      "id": "northern_lands",
      "name": "Northern Lands",
      "bonus": 3,
      "color": "#4CAF50"
    },
    {
      "id": "central_kingdoms",
      "name": "Central Kingdoms",
      "bonus": 4,
      "color": "#2196F3"
    }
  ],
  "adjacencies": [
    { "from": "frozen_wastes", "to": "ice_peaks" },
    { "from": "ice_peaks", "to": "mountain_pass", "connectionType": "land" },
    { "from": "tundra_plains", "to": "forest_realm", "isBidirectional": true }
  ],
  "capitalAssignments": {
    "2": ["frozen_wastes", "jade_peaks"],
    "3": ["frozen_wastes", "mountain_pass", "trade_crossroads"]
  },
  "minPlayers": 2,
  "maxPlayers": 6,
  "image": {
    "mimeType": "image/png",
    "data": "data:image/png;base64,..."
  }
}
```

### Field notes

- **IDs** – Territory and continent IDs should be stable, lowercase strings. These IDs are used when linking adjacencies and capital assignments.
- **`boundaryCoords`** – Optional array of `{ x, y }` coordinates for polygonal boundaries. If omitted the editor stores the territory as a token with a centre point.
- **`armyPosition`** – Required coordinate where army counts render. For polygonal territories this should be the centroid; for token territories it matches the token position.
- **`connections`** – Convenience array used by the editor. When publishing, the workflow normalises these into `adjacencies` and writes entries to `territory_adjacencies`.
- **`adjacencies`** – Explicit connections. Either supply this array *or* rely on each territory’s `connections`; both formats are accepted.
- **`capitalAssignments`** – Maps a player count to an array of territory IDs that should be considered valid capitals for that configuration.
- **`image`** – Optional data URL payload used when uploading a new background. If omitted, `imageUrl`/`imageWidth`/`imageHeight` fields from the draft are reused.

Legacy static JSON files (e.g. [`frontend/src/data/territories-example.json`](../frontend/src/data/territories-example.json)) follow the same logical shape but omit some optional fields. They remain useful as fixtures for quick prototyping.

---

## 4. Territory serialization

Published territories store their geometry inside `map_territories.polygon_data`. The workflow writes one of two shapes:

```jsonc
// Polygon territory
{
  "type": "polygon",
  "points": [
    { "x": 120, "y": 60 },
    { "x": 190, "y": 65 },
    { "x": 200, "y": 120 }
  ],
  "armyPosition": { "x": 150, "y": 90 },
  "originalId": "frozen_wastes"
}

// Token territory (no polygon drawn)
{
  "type": "token",
  "x": 600,
  "y": 420,
  "armyPosition": { "x": 600, "y": 420 },
  "originalId": "mystic_isles"
}
```

The server rehydrates `boundaryCoords` and `armyPosition` from this JSON when maps are requested via `/api/maps/:id`.

---

## 5. Map editor & workflow

### 5.1 Editor entry points

- **Primary editor**: `/map-editor` (token-first experience driven by `MapEditorTokens.tsx`).
- **Legacy polygon editor**: `/map-editor-polygon` for direct canvas drawing. The new editor still stores polygonal outlines when you switch to polygon mode inside the territories tab.

### 5.2 Editor modes

The token editor is organised into tabs:

1. **Properties** – Name, description, visibility, player counts, draft validation checklist.
2. **Image** – Upload, crop, or replace the background image. Supports drag-and-drop with progress feedback.
3. **Territories** – Create token or polygon territories, adjust army labels, and manage duplicate detection.
4. **Continents** – Group territories and assign bonus values with color previews.
5. **Connections** – Click-to-link territory adjacencies; displays warnings for isolated nodes.
6. **Capitals** – Assign capital slots per player count and generate suggestions.

Autosave runs after changes and writes to `map_drafts`. Drafts can be resumed from the Properties tab or the draft drawer.

### 5.3 Publish & review

1. **Save draft** – `/api/workflow/drafts` stores the metadata JSON, territories, continents, adjacencies, image info, and capital assignments.
2. **Publish** – `/api/workflow/drafts/:id/publish` converts the draft into a new `maps` row, writes supporting rows, uploads the background image (if a new data URL was provided), and queues the map for review.
3. **Approval** – Moderators act through `/api/workflow/admin/...` endpoints, updating `map_review_queue`, `map_reviews`, and the map’s status. Approved maps become selectable in the game lobby once `status = 'approved'`.

Quota guardrails limit non-admin users to five unpublished items across drafts, staged images, and pending submissions.

---

## 6. Validation guidelines

- **Connectivity** – Every territory must have at least one adjacency, and the published graph must be fully connected. The editor enforces this via `mapService.validateMapData`.
- **Unique identifiers** – Territory and continent IDs must be unique within a map; adjacencies should reference the IDs exactly.
- **Bidirectional links** – Provide both directions for undirected links (the editor handles this automatically when publishing).
- **Player counts** – Only define capital assignments for player counts between 2 and 12. The workflow converts these into the stored `{ territoryId: [playerCounts] }` map.
- **Images** – Recommended resolutions fall between 1200×800 and 2560×1440. Accepted file types follow the upload service (`image/png`, `image/jpeg`, `image/webp`, `image/gif`). Draft uploads larger than the quota are rejected server-side.

---

## 7. Developer tips

- **Programmatic seeding** – When generating maps via scripts, build a `CreateMapRequest` payload (see `backend/src/services/mapWorkflowService.ts`) and call `mapService.createMap`. Populate `metadata` so the editor can round-trip the map later.
- **Testing maps locally** – Authenticate, open `/map-editor`, create a draft, publish it, then launch a game from `/create-game` selecting your map (it will appear once approved or if you are the creator viewing unpublished drafts via admin tools).
- **Admin review tooling** – `/admin/map-reviews` and `/admin/maps` surfaces queues driven by the workflow tables above.

---

*Last updated: February 2025.*
