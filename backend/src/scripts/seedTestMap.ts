import { v4 as uuidv4 } from 'uuid'
import { query } from '../config/database'
import { testWorldMap } from '../data/defaultMaps'

async function seedTestMap() {
  // Check if test map already exists
  const existingMap = (await query('SELECT id FROM maps WHERE name = $1', [
    testWorldMap.name,
  ])) as any as any[]

  if (existingMap && existingMap.length > 0) {
    return existingMap[0].id
  }

  // Create map
  const mapId = uuidv4()
  await query(
    `INSERT INTO maps (
        id, name, description, image_url, image_width, image_height, 
        is_public, creator_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      mapId,
      testWorldMap.name,
      testWorldMap.description,
      testWorldMap.imageUrl,
      testWorldMap.imageWidth,
      testWorldMap.imageHeight,
      testWorldMap.isPublic ? 1 : 0,
      1, // System user
    ],
  )

  // Create continents
  const continentMap = new Map()
  for (const continent of testWorldMap.continents) {
    const continentId = uuidv4()
    continentMap.set(continent.name, continentId)

    await query(
      `INSERT INTO map_continents (
          id, map_id, name, color, bonus_armies
        ) VALUES ($1, $2, $3, $4, $5)`,
      [continentId, mapId, continent.name, continent.color, continent.bonusArmies],
    )
  }

  // Create territories
  const territoryMap = new Map()
  for (const territory of testWorldMap.territories) {
    const territoryId = uuidv4()
    territoryMap.set(territory.name, territoryId)

    const continentName = testWorldMap.continents.find((c) =>
      c.territories?.includes(territory.name),
    )?.name

    await query(
      `INSERT INTO map_territories (
          id, map_id, territory_id, name, boundary_coords, 
          army_position_x, army_position_y, continent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        territoryId,
        mapId,
        territory.name.toLowerCase().replace(/\s+/g, '_'),
        territory.name,
        JSON.stringify(territory.boundaryCoords),
        territory.armyPosition.x,
        territory.armyPosition.y,
        continentName ? continentMap.get(continentName) : null,
      ],
    )
  }

  // Create adjacencies
  let _adjacencyCount = 0
  for (const adj of testWorldMap.adjacencies) {
    const fromId = territoryMap.get(adj.from)
    const toId = territoryMap.get(adj.to)

    if (fromId && toId) {
      // Create bidirectional adjacency
      await query(
        `INSERT INTO territory_adjacencies (
            from_territory_id, to_territory_id, connection_type
          ) VALUES ($1, $2, 'land')`,
        [fromId, toId],
      )

      await query(
        `INSERT INTO territory_adjacencies (
            from_territory_id, to_territory_id, connection_type
          ) VALUES ($1, $2, 'land')`,
        [toId, fromId],
      )

      _adjacencyCount += 2
    }
  }

  return mapId
}

// Run if called directly
if (require.main === module) {
  seedTestMap()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

export default seedTestMap
