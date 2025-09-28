# 📦 Bulk Map Import Packages

Use this guide when sending map images and data for initial seeding without using the in-app editor. It defines the expected folder layout and JSON shape so we can ingest and review maps quickly.

Last updated: September 2025

---

## What to send

- A single .zip containing one folder per map
- Each map folder should include:
  - `map.json` – metadata and gameplay data (schema below)
  - `background.(png|jpg|webp)` – the map image (preferred)
  - Optional: `README.md` with any notes

Example structure:

```
maps-package/
  frozen-isles/
    map.json
    background.png
  jade-realm/
    map.json
    background.webp
```

---

## JSON schema (authoring metadata)

This is the same payload our editor and workflow use (`MapMetadataPayload` embedded in a create-map request). You can either:
- Reference a separate image file via `imageFilename`, or
- Embed a base64 data URL under `image.data` + `image.mimeType` (larger zips).

```jsonc
{
  "name": "Frozen Isles",
  "description": "Compact 12-territory skirmish map",
  "minPlayers": 2,
  "maxPlayers": 6,
  "tags": ["quick", "snow"],

  // Image: pick ONE of the following
  "imageFilename": "background.png",           // preferred
  // or
  "image": { "mimeType": "image/png", "data": "data:image/png;base64,..." },

  // Canvas dimensions (optional; we auto-detect from image when absent)
  "width": 1920,
  "height": 1080,

  "territories": [
    {
      "id": "frozen_wastes",
      "name": "Frozen Wastes",
      "continentId": "northern_lands",
      // Pixel coordinates (origin top-left); normalized fields optional
      "armyPosition": { "x": 150, "y": 80 },
      // For polygonal territories provide boundary points; omit for token-only
      "boundaryCoords": [
        { "x": 120, "y": 60 },
        { "x": 190, "y": 65 },
        { "x": 200, "y": 120 }
      ],
      // Convenience link list; we normalize these to adjacencies when importing
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
    { "id": "northern_lands", "name": "Northern Lands", "bonus": 3, "color": "#4CAF50" },
    { "id": "central_kingdoms", "name": "Central Kingdoms", "bonus": 4, "color": "#2196F3" }
  ],

  // Optional alternative to per-territory connections
  "adjacencies": [
    { "from": "frozen_wastes", "to": "ice_peaks" },
    { "from": "ice_peaks", "to": "mountain_pass" },
    { "from": "tundra_plains", "to": "forest_realm", "isBidirectional": true }
  ],

  // Capital assignments per player count (2–12)
  "capitalAssignments": {
    "2": ["frozen_wastes", "jade_peaks"],
    "3": ["frozen_wastes", "mountain_pass", "trade_crossroads"]
  }
}
```

Notes:
- IDs should be stable, lowercase, and unique per map; they are referenced by `connections`, `adjacencies`, and `capitalAssignments`.
- Coordinates use image pixels with origin at the top-left; `armyPosition` is required. If polygonal, use the territory centroid; otherwise place it where tokens render.
- You can omit `adjacencies` if every territory lists `connections`; we generate bidirectional edges during import.
- Omit `width`/`height` if unknown; we read dimensions from the image file.

---

## Image requirements

- Formats: PNG, JPEG, or WebP
- Recommended resolution: 1200×800 to 2560×1440
- Keep files under ~10 MB each; we’ll optimize on upload
- Naming: match `imageFilename` in `map.json` (case sensitive)

---

## Validation we run on import

- Unique territory and continent IDs
- Every territory linked at least once (no isolated nodes)
- Graph connectivity (one connected component)
- Adjacencies reference valid territory IDs
- Player-count bounds: capitals only for 2–12
- Optional: basic size and MIME checks on images

We’ll return a per-map report listing any issues and fixes applied.

---

## How we ingest it

- We read each `map.json`, upload the image to asset storage, and create the map via the workflow (`maps` + `map_territories` + `map_continents` + `territory_adjacencies`).
- The entire authoring payload is stored in `maps.metadata` so the in-app editor can round-trip edits later.

---

## Related docs

- guides/map-format.md – full schema and editor workflow
- operations/database-schema.md – storage tables referenced by the importer

---

## Send-off checklist

- One folder per map with `map.json` and image
- IDs are consistent across territories, adjacencies, and capitals
- Every territory has at least one connection
- Zip the top-level folder and share it via a link

