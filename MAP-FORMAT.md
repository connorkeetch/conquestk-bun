# 🗺️ Risk Game Map Data Format

This document defines the map data structure for the Risk game system, both for the current implementation and future map editor development.

## 📊 Database Schema Overview

### Core Tables

#### 1. **maps** - Main map metadata
```sql
- id: TEXT PRIMARY KEY (UUID)
- name: TEXT NOT NULL
- description: TEXT
- creator_id: TEXT (references users.id)
- image_url: TEXT (background image path)
- image_width: INTEGER (default 600)
- image_height: INTEGER (default 450)
- is_public: BOOLEAN
- is_featured: BOOLEAN
- tags: TEXT (JSON array)
```

#### 2. **map_territories** - Territory definitions
```sql
- id: TEXT PRIMARY KEY (UUID)
- map_id: TEXT (references maps.id)
- territory_id: TEXT (unique within map)
- name: TEXT NOT NULL
- continent_id: TEXT (references map_continents.id)
- boundary_coords: TEXT (JSON polygon coordinates)
- army_position_x: INTEGER (army counter position)
- army_position_y: INTEGER (army counter position)
- ability_type_id: TEXT (special abilities)
```

#### 3. **map_continents** - Continent groupings
```sql
- id: TEXT PRIMARY KEY (UUID)
- map_id: TEXT (references maps.id)
- name: TEXT NOT NULL
- bonus_armies: INTEGER (continent control bonus)
- color: TEXT (hex color code)
```

#### 4. **territory_adjacencies** - Territory connections
```sql
- from_territory_id: TEXT
- to_territory_id: TEXT
- connection_type: TEXT ('land', 'sea', 'air', 'tunnel')
- is_bidirectional: BOOLEAN (default TRUE)
```

## 🎮 Map Data Format Examples

### Simple Map Structure
```javascript
{
  id: "simple-world",
  name: "Simple World",
  description: "A basic world map with 6 territories",
  image_width: 600,
  image_height: 400,
  territories: [
    {
      id: "north-america",
      name: "North America",
      continent: "americas",
      boundary_coords: [[100,50],[200,50],[200,150],[100,150]],
      army_position: { x: 150, y: 100 }
    }
    // ... more territories
  ],
  continents: [
    {
      id: "americas",
      name: "Americas",
      bonus_armies: 2,
      color: "#4CAF50",
      territories: ["north-america", "south-america"]
    }
    // ... more continents
  ],
  adjacencies: [
    ["north-america", "south-america"],
    ["north-america", "europe"]
    // ... more connections
  ]
}
```

## 🎯 Current Implementation Status

### ✅ **Working Features**
- Database schema fully implemented
- Test maps with territories and adjacencies
- Continent bonus system
- Territory special abilities framework
- Map selection in game creation

### 🚧 **Map Editor (Coming Soon)**
- Visual territory boundary drawing
- Interactive adjacency management
- Background image upload and positioning
- Real-time validation
- Map testing and preview

## 📋 Map Creation Workflow (Future)

### For Map Creators
1. **Upload Background**: JPG/PNG image (max 10MB)
2. **Draw Territories**: Click to create polygon boundaries
3. **Define Continents**: Group territories and set bonuses
4. **Set Adjacencies**: Connect territories that can attack each other
5. **Add Special Abilities**: Assign fortress, naval base, etc.
6. **Test & Validate**: Ensure all territories are reachable
7. **Publish**: Make available to community

### For Developers Adding Maps
1. **Prepare Data**: Create map object with territories, continents, adjacencies
2. **Run Script**: Use `add-test-maps.js` as template
3. **Validate**: Ensure proper foreign key relationships
4. **Test**: Create game room and verify functionality

## 🛠️ Technical Requirements

### Map Images
- **Format**: JPG, PNG, GIF, WebP
- **Size**: Max 10MB
- **Dimensions**: Recommended 600x400 to 1200x800
- **Storage**: `/backend/uploads/maps/`

### Territory Boundaries
- **Format**: JSON array of [x,y] coordinate pairs
- **Shape**: Closed polygon (first and last points should match)
- **Validation**: No overlapping territories, complete map coverage

### Adjacency Rules
- **Bidirectional**: Most connections work both ways
- **Connection Types**: Land (default), sea, air, tunnel
- **Validation**: Symmetric connections, no orphaned territories

## 📝 Test Maps Available

### 1. **Simple World** (`test-simple-world`)
- 6 territories across 3 continents
- Basic world geography
- Good for learning the game

### 2. **Mini Risk** (`test-mini-risk`)
- 4 territories, 2 continents
- Ultra-fast games (5-10 minutes)
- Perfect for testing mechanics

## 🔮 Future Enhancements

### Advanced Features (v2.0)
- **Conditional Connections**: Bridges, seasonal routes
- **Multi-level Maps**: Underground/surface layers
- **Dynamic Territories**: Changing boundaries mid-game
- **Environmental Effects**: Weather, disasters
- **Custom Victory Conditions**: Control specific territories

### Map Editor Features (v1.5)
- **Collaborative Editing**: Multiple creators
- **Version Control**: Map updates and rollbacks
- **Asset Library**: Reusable territory templates
- **Automated Validation**: Balance checking
- **Community Features**: Ratings, comments, favorites

## 🎨 Design Guidelines

### Visual Standards
- **Clear Boundaries**: High contrast territory borders
- **Readable Text**: Army positions don't overlap borders
- **Color Accessibility**: Consider colorblind users
- **Balanced Layout**: No tiny/huge territories

### Gameplay Balance
- **Territory Count**: 15-50 territories for good gameplay
- **Continent Ratios**: Bonus should be ~1/3 of territory count
- **Connectivity**: Average 2.5 connections per territory
- **Chokepoints**: Strategic bottlenecks for interesting decisions

## 📄 File Organization

```
project/
├── MAP-FORMAT.md           # This documentation
├── add-test-maps.js        # Script to add test maps
├── backend/
│   ├── migrations/
│   │   └── 001_extended_maps_schema.sql
│   └── uploads/maps/       # Map background images
└── frontend/
    └── src/pages/
        ├── ComingSoon.tsx  # Map editor placeholder
        └── Maps.tsx        # Map browser
```

---

*Last updated: August 2025*
*Status: Core functionality complete, Map Editor in development*