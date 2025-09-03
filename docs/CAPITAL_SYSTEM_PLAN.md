# Capital Assignment System - Implementation Plan

## 🎯 System Overview
The Capital Assignment System automatically calculates optimal starting positions (capitals) for different player counts (2-12 players) when a map is created. Map creators can manually adjust these assignments. Capitals are stored with the map and used when games start.

## 🏗️ Architecture Design

### Core Principles
1. **Calculate Once, Use Many**: Capitals are computed during map creation, not every game
2. **Maximin Distance Algorithm**: Maximize the minimum distance between capitals for fairness
3. **Manual Override**: Map creators can adjust algorithmic assignments
4. **Player Count Flexibility**: Support 2-12 players with different capital configurations
5. **Visual Feedback**: Clear display of capitals in editor and game

### Data Flow
```
Map Creation → Generate Capitals → Store in DB → Manual Adjustments → 
Game Creation → Load Capitals → Assign to Players → Start Game
```

## 📊 Database Schema

### New Columns in `maps` Table
```sql
capital_assignments JSONB  -- Stores capital territories per player count
capital_metadata JSONB      -- Tracks generation info and manual adjustments
```

### Data Structure
```json
// capital_assignments
{
  "2": ["territory-1", "territory-2"],
  "3": ["territory-1", "territory-5", "territory-9"],
  "4": ["territory-1", "territory-5", "territory-9", "territory-13"],
  // ... up to 12 players
}

// capital_metadata
{
  "generatedAt": "2024-01-01T00:00:00Z",
  "algorithm": "maximin-distance-v1",
  "manuallyAdjusted": {
    "3": true,  // 3-player setup was manually edited
    "4": false  // 4-player setup is still algorithmic
  }
}
```

## 🔧 Implementation Phases

### Phase 1: Database Setup ✅
- Create migration file `004_add_capital_assignments.sql`
- Add JSONB columns for capitals and metadata
- Test migration locally

### Phase 2: Backend Capital Generator 🔄
- Create `CapitalGeneratorService.ts`
- Implement maximin distance algorithm
- Build adjacency graph from territories
- Calculate optimal positions for 2-12 players

### Phase 3: API Endpoints 🔄
- `POST /maps/:mapId/generate-capitals` - Auto-generate all capitals
- `PATCH /maps/:mapId/capitals/:playerCount` - Manual adjustment
- `GET /maps/:mapId/capitals` - Retrieve current assignments
- Add authorization checks

### Phase 4: Frontend - Token Editor 🔄
- Add capital management section to map editor
- Player count selector (2-12 buttons)
- Visual display of assigned capitals
- Click-to-assign interface
- Crown icons on map canvas

### Phase 5: Frontend - Visual Display 🔄
- Update canvas rendering to show capitals
- Color-coded by player position
- Crown emoji/icon overlay
- Highlight on hover
- Different display modes (edit vs view)

### Phase 6: Game Integration 🔄
- Load capitals during game creation
- Assign to players based on player count
- Initialize territories with capital ownership
- Capital-specific game rules

## 🎨 UI/UX Design

### Map Editor Interface
```
┌─────────────────────────────────────────┐
│  Capital Assignment                     │
├─────────────────────────────────────────┤
│  [Generate Capitals] button             │
│                                          │
│  Player Count: [2][3][4][5][6][7][8]... │
│                                          │
│  Capitals for 4 players:                │
│  🔴 Player 1: Eastern Territory         │
│  🔵 Player 2: Western Territory         │
│  🟢 Player 3: Northern Territory        │
│  🟡 Player 4: Southern Territory        │
│                                          │
│  💡 Click territories to change capitals │
└─────────────────────────────────────────┘
```

### Visual Indicators on Map
- Crown icon overlay on capital territories
- Player color coding
- Pulsing animation on hover
- Dotted border for selected player count

## 🔬 Algorithm Details

### Maximin Distance Algorithm
```typescript
1. Find most central territory (minimize total distance to all)
2. Add as first capital
3. For each additional capital needed:
   a. Calculate distance from each candidate to existing capitals
   b. Select territory with maximum minimum distance
   c. Add to capital list
4. Return ordered list of capitals
```

### Distance Calculation
- Use BFS (Breadth-First Search) for shortest path
- Consider only connected territories
- Weight by number of connections (more = better)

### Centrality Score
```
Score = TotalDistanceToAll - (ConnectionCount * 2)
Lower score = more central
```

## 🧪 Testing Strategy

### Unit Tests
- Capital generator algorithm
- Distance calculations
- Graph building
- API endpoints

### Integration Tests
- Database operations
- Full generation flow
- Manual adjustment persistence
- Game initialization with capitals

### Manual Testing
- Visual verification of capital positions
- Different map sizes (small, medium, large)
- Edge cases (disconnected territories)
- Performance with large maps

## 🚀 Implementation Order

1. **Database Migration** (10 min)
   - Create and run migration
   - Verify schema updates

2. **Capital Generator Service** (45 min)
   - Core algorithm implementation
   - Graph utilities
   - Distance calculations

3. **API Endpoints** (20 min)
   - Generate endpoint
   - Update endpoint
   - Authorization

4. **Frontend Token Editor** (30 min)
   - UI components
   - State management
   - API integration

5. **Visual Display** (20 min)
   - Canvas rendering
   - Capital indicators
   - Interactive selection

6. **Game Integration** (15 min)
   - Load capitals
   - Player assignment
   - Initialization

7. **Testing & Refinement** (20 min)
   - Bug fixes
   - Performance optimization
   - UI polish

**Total Estimated Time**: ~2.5 hours

## 📝 Success Criteria

- [x] Capitals generate for all valid player counts
- [x] Algorithm produces well-distributed positions
- [x] Manual adjustments save correctly
- [x] Visual display is clear and intuitive
- [x] Game creation uses pre-calculated capitals
- [x] Performance is acceptable (<1s generation)
- [x] No regression in existing functionality

## 🔍 Potential Challenges

1. **Disconnected Graphs**: Some territories might not be reachable
   - Solution: Filter out disconnected components

2. **Performance**: Large maps with many territories
   - Solution: Optimize BFS, cache distances

3. **Visual Clarity**: Overlapping capitals on small maps
   - Solution: Minimum distance constraints

4. **Player Colors**: Ensuring good contrast
   - Solution: Predefined high-contrast palette

5. **Mobile Display**: Small screens
   - Solution: Zoom controls, responsive design

## 📚 Reference Implementation

The provided example code serves as a blueprint but needs adaptation for our specific:
- Database structure (PostgreSQL with $1 placeholders)
- Authentication system
- Frontend state management (Redux)
- Canvas rendering approach
- Error handling patterns

## 🎯 Next Steps

1. Review this plan
2. Create database migration
3. Implement backend service
4. Build frontend components
5. Test thoroughly
6. Document for future developers