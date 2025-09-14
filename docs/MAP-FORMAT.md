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

### ✅ **Map Editor (Implemented)**
The Map Editor is now fully functional with a modern tabbed interface located at `/map-editor-tokens`.

#### Interface Organization
The editor uses a **tabbed navigation system** with contextual sidebar panels:

**Main Tabs:**
1. **📋 Properties** - Map metadata, validation checklist
2. **🖼️ Image** - Background upload, processing, cropping
3. **🎯 Territories** - Token placement, display settings, labels
4. **🌍 Continents** - Continent management, bonus configuration
5. **🔗 Connections** - Territory adjacency linking
6. **👑 Capitals** - Player starting positions, auto-generation

**Key Features:**
- **Dynamic Sidebar**: Context-specific controls for each tab
- **Visual Token Editor**: Drag-and-drop territory placement
- **Token Customization**: Shape (hexagon/circle), size, grid overlay
- **Label System**: Customizable territory labels with font/color options
- **Connection Visualization**: Visual lines showing territory adjacencies
- **Capital Assignment**: Auto-generate or manually assign starting positions
- **Real-time Validation**: Instant feedback on map completeness
- **Local & Server Storage**: Auto-save drafts, server persistence

**Technical Details:**
- Fixed token clickable area alignment (direct positioning, no transform)
- Progressive disclosure UI pattern for better UX
- Supports 2-12 player configurations
- Image processing with compression and cropping
- JSON import/export for map data

## 📋 Map Creation Workflow

### Using the Visual Map Editor
1. **Navigate to `/map-editor-tokens`** - Access the editor interface
2. **Properties Tab**: Set map name, description, player counts
3. **Image Tab**: Upload background image (JPG/PNG, max 10MB)
4. **Territories Tab**: Click to place tokens, drag to position
5. **Continents Tab**: Create continents, assign territories, set bonuses
6. **Connections Tab**: Click territories to link adjacencies
7. **Capitals Tab**: Auto-generate or manually set starting positions
8. **Save & Validate**: Check validation panel, save as draft or publish

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
├── docs/
│   └── MAP-FORMAT.md       # This documentation
├── add-test-maps.js        # Script to add test maps
├── backend/
│   ├── migrations/
│   │   └── 001_extended_maps_schema.sql
│   └── uploads/maps/       # Map background images
└── frontend/
    └── src/pages/
        ├── MapEditorTokens.tsx  # Visual map editor with tabbed interface
        ├── MapEditor.tsx        # Alternative editor (grid-based)
        └── Maps.tsx             # Map browser
```

---

*Last updated: September 2025*
*Status: Map Editor fully implemented with tabbed interface*