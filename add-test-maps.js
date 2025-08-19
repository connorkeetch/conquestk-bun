const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'backend', 'risk_game.db');

console.log('🗺️ Adding test maps to database...');

if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file does not exist! Run npm run dev first.');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// Get a user ID to assign as creator
db.get('SELECT id FROM users LIMIT 1', (err, user) => {
  if (err || !user) {
    console.log('❌ No users found. Please register a user first.');
    db.close();
    return;
  }
  
  console.log('👤 Using user ID:', user.id);
  
  const creatorId = user.id;
  
  // Simple test maps data
  const testMaps = [
    {
      id: 'test-simple-world',
      name: 'Simple World',
      description: 'A basic world map with 6 territories for quick games',
      territories: [
        { id: 'north-america', name: 'North America', x: 150, y: 100, coords: [[100,50],[200,50],[200,150],[100,150]] },
        { id: 'south-america', name: 'South America', x: 150, y: 250, coords: [[100,200],[200,200],[200,300],[100,300]] },
        { id: 'europe', name: 'Europe', x: 350, y: 100, coords: [[300,50],[400,50],[400,150],[300,150]] },
        { id: 'africa', name: 'Africa', x: 350, y: 200, coords: [[300,175],[400,175],[400,275],[300,275]] },
        { id: 'asia', name: 'Asia', x: 450, y: 100, coords: [[425,50],[550,50],[550,150],[425,150]] },
        { id: 'australia', name: 'Australia', x: 500, y: 250, coords: [[450,225],[550,225],[550,275],[450,275]] }
      ],
      adjacencies: [
        ['north-america', 'south-america'],
        ['north-america', 'europe'],
        ['south-america', 'africa'],
        ['europe', 'africa'],
        ['europe', 'asia'],
        ['africa', 'asia'],
        ['asia', 'australia']
      ],
      continents: [
        { id: 'americas', name: 'Americas', bonus: 2, color: '#4CAF50', territories: ['north-america', 'south-america'] },
        { id: 'old-world', name: 'Old World', bonus: 3, color: '#2196F3', territories: ['europe', 'africa', 'asia'] },
        { id: 'oceania', name: 'Oceania', bonus: 1, color: '#FF9800', territories: ['australia'] }
      ]
    },
    {
      id: 'test-mini-risk',
      name: 'Mini Risk',
      description: 'Tiny 4-territory map for testing game mechanics',
      territories: [
        { id: 'territory-1', name: 'Territory 1', x: 100, y: 100, coords: [[50,50],[150,50],[150,150],[50,150]] },
        { id: 'territory-2', name: 'Territory 2', x: 250, y: 100, coords: [[200,50],[300,50],[300,150],[200,150]] },
        { id: 'territory-3', name: 'Territory 3', x: 100, y: 200, coords: [[50,175],[150,175],[150,275],[50,275]] },
        { id: 'territory-4', name: 'Territory 4', x: 250, y: 200, coords: [[200,175],[300,175],[300,275],[200,275]] }
      ],
      adjacencies: [
        ['territory-1', 'territory-2'],
        ['territory-1', 'territory-3'],
        ['territory-2', 'territory-4'],
        ['territory-3', 'territory-4'],
        ['territory-2', 'territory-3'] // Cross connection for more interesting gameplay
      ],
      continents: [
        { id: 'north-region', name: 'North Region', bonus: 1, color: '#E91E63', territories: ['territory-1', 'territory-2'] },
        { id: 'south-region', name: 'South Region', bonus: 1, color: '#9C27B0', territories: ['territory-3', 'territory-4'] }
      ]
    }
  ];
  
  let mapsCompleted = 0;
  
  testMaps.forEach((mapData, index) => {
    console.log(`\n📍 Creating map: ${mapData.name}...`);
    
    // Insert the map
    const insertMap = `INSERT OR REPLACE INTO maps (id, name, description, creator_id, image_width, image_height, is_public, is_featured, created_at) 
                     VALUES (?, ?, ?, ?, 600, 400, 1, 1, datetime('now'))`;
    
    db.run(insertMap, [mapData.id, mapData.name, mapData.description, creatorId], function(err) {
      if (err) {
        console.log('❌ Error inserting map:', err);
        return;
      }
      
      console.log(`✅ Map created: ${mapData.name}`);
      
      // Insert continents
      let continentsInserted = 0;
      const continentIds = {};
      
      mapData.continents.forEach(continent => {
        const continentUUID = generateSimpleId();
        continentIds[continent.id] = continentUUID;
        
        const insertContinent = `INSERT OR REPLACE INTO map_continents (id, map_id, name, bonus_armies, color) 
                                VALUES (?, ?, ?, ?, ?)`;
        
        db.run(insertContinent, [continentUUID, mapData.id, continent.name, continent.bonus, continent.color], (err) => {
          if (err) console.log('❌ Error inserting continent:', err);
          else console.log(`  📊 Continent: ${continent.name} (+${continent.bonus} armies)`);
          
          continentsInserted++;
          if (continentsInserted === mapData.continents.length) {
            insertTerritories();
          }
        });
      });
      
      function insertTerritories() {
        // Insert territories
        let territoriesInserted = 0;
        const territoryIds = {};
        
        mapData.territories.forEach(territory => {
          const territoryUUID = generateSimpleId();
          territoryIds[territory.id] = territoryUUID;
          
          // Find which continent this territory belongs to
          const continent = mapData.continents.find(c => c.territories.includes(territory.id));
          const continentId = continent ? continentIds[continent.id] : null;
          
          const insertTerritory = `INSERT OR REPLACE INTO map_territories 
                                  (id, map_id, territory_id, name, continent_id, boundary_coords, army_position_x, army_position_y) 
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
          
          db.run(insertTerritory, [
            territoryUUID, mapData.id, territory.id, territory.name, 
            continentId, JSON.stringify(territory.coords), territory.x, territory.y
          ], (err) => {
            if (err) console.log('❌ Error inserting territory:', err);
            else console.log(`  🏠 Territory: ${territory.name}`);
            
            territoriesInserted++;
            if (territoriesInserted === mapData.territories.length) {
              insertAdjacencies();
            }
          });
        });
        
        function insertAdjacencies() {
          // Insert adjacencies
          let adjacenciesInserted = 0;
          
          mapData.adjacencies.forEach(([from, to]) => {
            const fromId = territoryIds[from];
            const toId = territoryIds[to];
            
            if (!fromId || !toId) {
              console.log(`❌ Missing territory IDs for adjacency: ${from} -> ${to}`);
              return;
            }
            
            const insertAdjacency = `INSERT OR REPLACE INTO territory_adjacencies 
                                    (id, from_territory_id, to_territory_id, connection_type, is_bidirectional) 
                                    VALUES (?, ?, ?, 'land', TRUE)`;
            
            db.run(insertAdjacency, [generateSimpleId(), fromId, toId], (err) => {
              if (err) console.log('❌ Error inserting adjacency:', err);
              else console.log(`  🔗 Connected: ${from} <-> ${to}`);
              
              adjacenciesInserted++;
              if (adjacenciesInserted === mapData.adjacencies.length) {
                mapsCompleted++;
                if (mapsCompleted === testMaps.length) {
                  finishUp();
                }
              }
            });
          });
        }
      }
    });
  });
  
  function finishUp() {
    console.log('\n🎉 Test maps added successfully!');
    console.log('\nNext steps:');
    console.log('1. Start the frontend: npm run dev:frontend');
    console.log('2. Go to /maps to see the new test maps');
    console.log('3. Create a game room and select one of these maps');
    console.log('4. Test the core game functionality');
    
    db.close();
  }
});

// Simple ID generator for testing (not cryptographically secure)
function generateSimpleId() {
  return 'test-' + Math.random().toString(36).substr(2, 9);
}