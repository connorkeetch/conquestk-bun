# Map Schema Documentation

## File Naming Convention
Maps should be named: `territories-[mapname].json`

Examples:
- `territories-classic.json` - Classic Risk world map
- `territories-example.json` - Example/test map for development

## Map Structure

Each map JSON file should follow this schema:

```json
{
  "continents": {
    "[continent_id]": {
      "name": "Display Name",
      "bonus": 5,          // Army bonus for controlling entire continent
      "color": "#4CAF50"   // Display color for the continent
    }
  },
  "territories": {
    "[territory_id]": {
      "name": "Display Name",
      "continent": "[continent_id]",
      "adjacentTerritories": ["territory_id1", "territory_id2"],
      "svgPath": "M100,200 L150,250...",  // Optional: SVG path data
      "armyPosition": {                    // Position for army count display
        "x": 125,
        "y": 225
      }
    }
  }
}
```

## Field Descriptions

### Continents
- **id**: Unique identifier (lowercase, underscores for spaces)
- **name**: Human-readable display name
- **bonus**: Number of bonus armies for controlling the entire continent
- **color**: Hex color code for visual distinction

### Territories
- **id**: Unique identifier (lowercase, underscores/hyphens for spaces)
- **name**: Human-readable display name
- **continent**: ID of the continent this territory belongs to
- **adjacentTerritories**: Array of territory IDs that are connected
- **svgPath**: (Optional) SVG path data for rendering the territory shape
- **armyPosition**: X,Y coordinates for displaying army count

## Current Maps

### territories-classic.json
- Classic Risk world map
- 6 continents (North America, South America, Europe, Africa, Asia, Australia)
- 42 territories
- Used by: RiskGameBoard component

### territories-example.json  
- Example fantasy-themed map for testing
- 4 continents (Northern Lands, Central Kingdoms, Southern Realms, Eastern Empire)
- 20 territories
- Used by: SimpleRiskGameBoard component

## Adding New Maps

1. Create a new file: `territories-[mapname].json`
2. Follow the schema structure above
3. Ensure all territory IDs in adjacentTerritories exist
4. Verify continent IDs match between continents and territories sections
5. Test the map in the game editor before using in gameplay

## Validation Rules

- All territory IDs must be unique
- All continent IDs must be unique
- Adjacent territories must be bidirectional (if A connects to B, B must connect to A)
- Every territory must belong to exactly one continent
- Continent colors should be visually distinct
- Army positions should be within the territory bounds