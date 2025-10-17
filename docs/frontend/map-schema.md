# Map Schema Documentation

All production maps are stored in PostgreSQL and surfaced via `/api/maps` and the workflow draft endpoints. The JSON snippets below describe how the editor and services serialize map metadata; use them when authoring imports or writing migrations.

## Top-Level Structure

```json
{
  "sectors": [
    {
      "id": "north",
      "name": "Northern Front",
      "bonusArmies": 5,
      "color": "#4CAF50",
      "territories": ["alaska", "nwt", "greenland"]
    }
  ],
  "territories": [
    {
      "id": "alaska",
      "name": "Alaska",
      "sectorId": "north",
      "adjacentTerritories": ["nwt", "kamchatka"],
      "armyPosition": { "x": 120, "y": 240 },
      "boundaryCoords": [
        { "x": 100, "y": 200 },
        { "x": 140, "y": 220 },
        { "x": 120, "y": 260 }
      ]
    }
  ],
  "adjacencies": [
    { "fromTerritoryId": "alaska", "toTerritoryId": "nwt", "isBidirectional": true }
  ],
  "capitalAssignments": {
    "3": ["alaska", "nwt", "greenland"]
  }
}
```

### Sectors

- **id**: Stable identifier (lowercase, snake_case recommended).
- **name**: Display name shown in the editor and sector bonus UI.
- **bonusArmies**: Extra armies granted when a player controls every territory in the sector.
- **color**: Hex code used for highlighting.
- **territories**: List of territory ids contained within the sector. This is derived data and can be regenerated from the territories array if omitted.

### Territories

- **id**: Unique identifier (string).
- **name**: Human-friendly display name.
- **sectorId**: Id of the sector this territory belongs to. Required for reinforcement bonuses.
- **adjacentTerritories**: Territory ids that are reachable from this territory.
- **armyPosition**: Canvas coordinates used when rendering the army token for this territory.
- **boundaryCoords** *(optional)*: Polygon describing the territory outline for the polygon editor.
- **ability / modifiers**: Additional keys may appear when modifiers or special rules are enabled. These mirror the fields in `backend/src/types/maps.ts`.

### Adjacencies

Adjacency entries are optional; polygon-editor imports and workflow submissions include them. Each entry supports:

- **fromTerritoryId / toTerritoryId**: Territory ids that share an adjacency.
- **connectionType**: `'land' | 'sea' | 'air' | 'tunnel' | 'special'` (defaults to `'land'`).
- **isBidirectional**: Whether movement is allowed in both directions (default `true`).
- **specialRequirements**: Optional record of gating requirements (`requiresNavalBase`, etc.).

## Validation Rules

- Sector ids must be unique.
- Territory ids must be unique.
- Every territory must reference a valid sector (unless explicitly unassigned in drafts).
- Adjacencies should be bidirectional unless intentionally asymmetric.
- Sector colors should provide clear contrast.
- Army positions must sit inside the territory polygon when one is supplied.

## Authoring Notes

- The legacy `continents` and `continentBonuses` keys are no longer read. Use `sectors`/`sectorBonuses` exclusively.
- Map drafts saved via the workflow endpoints accept the same shape. When migrating old JSON files, map `continent` → `sectorId` and `continents` → `sectors`.
- The editor automatically normalizes coordinates and augments territory records; prefer importing maps through the editor whenever possible.
