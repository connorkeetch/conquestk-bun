import { query } from '../config/database';
import { testWorldMap } from '../data/defaultMaps';
import { v4 as uuidv4 } from 'uuid';

async function seedTestMap() {
  try {
    console.log('🗺️ Seeding test map into database...');
    
    // Check if test map already exists
    const existingMap = await query(
      'SELECT id FROM maps WHERE name = ?',
      [testWorldMap.name]
    ) as unknown as any[];
    
    if (existingMap && existingMap.length > 0) {
      console.log('✅ Test map already exists');
      return existingMap[0].id;
    }
    
    // Create map
    const mapId = uuidv4();
    await query(
      `INSERT INTO maps (
        id, name, description, image_url, image_width, image_height, 
        is_public, creator_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        mapId,
        testWorldMap.name,
        testWorldMap.description,
        testWorldMap.imageUrl,
        testWorldMap.imageWidth,
        testWorldMap.imageHeight,
        testWorldMap.isPublic ? 1 : 0,
        1 // System user
      ]
    );
    
    console.log('✅ Map created:', mapId);
    
    // Create continents
    const continentMap = new Map();
    for (const continent of testWorldMap.continents) {
      const continentId = uuidv4();
      continentMap.set(continent.name, continentId);
      
      await query(
        `INSERT INTO map_continents (
          id, map_id, name, color, bonus_armies
        ) VALUES (?, ?, ?, ?, ?)`,
        [continentId, mapId, continent.name, continent.color, continent.bonusArmies]
      );
    }
    
    console.log('✅ Continents created:', continentMap.size);
    
    // Create territories
    const territoryMap = new Map();
    for (const territory of testWorldMap.territories) {
      const territoryId = uuidv4();
      territoryMap.set(territory.name, territoryId);
      
      const continentName = testWorldMap.continents.find(c => 
        c.territories?.includes(territory.name)
      )?.name;
      
      await query(
        `INSERT INTO map_territories (
          id, map_id, territory_id, name, boundary_coords, 
          army_position_x, army_position_y, continent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          territoryId,
          mapId,
          territory.name.toLowerCase().replace(/\s+/g, '_'),
          territory.name,
          JSON.stringify(territory.boundaryCoords),
          territory.armyPosition.x,
          territory.armyPosition.y,
          continentName ? continentMap.get(continentName) : null
        ]
      );
    }
    
    console.log('✅ Territories created:', territoryMap.size);
    
    // Create adjacencies
    let adjacencyCount = 0;
    for (const adj of testWorldMap.adjacencies) {
      const fromId = territoryMap.get(adj.from);
      const toId = territoryMap.get(adj.to);
      
      if (fromId && toId) {
        // Create bidirectional adjacency
        await query(
          `INSERT INTO territory_adjacencies (
            from_territory_id, to_territory_id, connection_type
          ) VALUES (?, ?, 'land')`,
          [fromId, toId]
        );
        
        await query(
          `INSERT INTO territory_adjacencies (
            from_territory_id, to_territory_id, connection_type
          ) VALUES (?, ?, 'land')`,
          [toId, fromId]
        );
        
        adjacencyCount += 2;
      }
    }
    
    console.log('✅ Adjacencies created:', adjacencyCount);
    console.log('🎉 Test map seeded successfully!');
    console.log('📍 Map ID:', mapId);
    
    return mapId;
    
  } catch (error) {
    console.error('❌ Error seeding test map:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedTestMap()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default seedTestMap;