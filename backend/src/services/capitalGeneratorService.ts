import type { Pool } from 'pg'
import { logger } from '../utils/logger'

type BoundaryCoordinates = Array<[number, number]>

interface Territory {
  id: string
  name: string
  map_id: string
  boundary_coords: BoundaryCoordinates
  army_position: { x: number; y: number }
}

interface Adjacency {
  from_territory_id: string
  to_territory_id: string
}

interface CapitalAssignments {
  [playerCount: number]: string[]
}

/**
 * Service for generating optimal capital positions using maximin distance algorithm
 * Capitals are calculated once during map creation and stored for game use
 */
export class CapitalGeneratorService {
  constructor(private db: Pool) {}

  /**
   * Generate capital assignments for all player counts (2-12)
   * This is called once when a map is created/edited
   */
  async generateCapitalsForMap(mapId: string): Promise<CapitalAssignments> {
    try {
      // Get territories and adjacencies from database
      const territories = await this.getTerritories(mapId)
      const adjacencies = await this.getAdjacencies(mapId)

      if (territories.length < 2) {
        throw new Error('Map must have at least 2 territories to generate capitals')
      }

      // Build adjacency graph for distance calculations
      const graph = this.buildAdjacencyGraph(territories, adjacencies)

      // Check if graph is connected
      const connectedComponents = this.findConnectedComponents(territories, graph)
      if (connectedComponents.length > 1) {
        logger.warn('Map has disconnected components; using largest component', {
          mapId,
          componentCount: connectedComponents.length,
        })
        // Use only the largest connected component
        const largestComponent = connectedComponents.reduce((a, b) => (a.length > b.length ? a : b))
        territories.length = 0
        territories.push(...largestComponent)
      }

      // Generate capitals for each valid player count
      const capitalAssignments: CapitalAssignments = {}

      for (let playerCount = 2; playerCount <= 12; playerCount++) {
        // Skip if not enough territories for this player count
        if (territories.length < playerCount) {
          logger.info('Skipping capital generation due to insufficient territories', {
            mapId,
            playerCount,
            territoryCount: territories.length,
          })
          continue
        }

        logger.info('Generating capitals for player count', {
          mapId,
          playerCount,
        })
        capitalAssignments[playerCount] = this.selectOptimalCapitals(
          territories,
          graph,
          playerCount,
        )
      }

      return capitalAssignments
    } catch (error) {
      logger.error('❌ Error generating capitals for map', { mapId, error })
      throw error
    }
  }

  /**
   * Core algorithm: Select capitals maximizing minimum distance between them
   * Uses a greedy approach with maximin distance heuristic
   */
  private selectOptimalCapitals(
    territories: Territory[],
    graph: Map<string, Set<string>>,
    count: number,
  ): string[] {
    const capitals: string[] = []
    const territoryIds = territories.map((t) => t.id)

    // Step 1: Find the most "central" territory as first capital
    // This provides a good starting point for distribution
    const centerTerr = this.findMostCentralTerritory(territories, graph)
    capitals.push(centerTerr)
    logger.debug('Selected first capital (most central territory)', {
      centerTerritoryId: centerTerr,
      centerTerritoryName: territories.find((t) => t.id === centerTerr)?.name,
    })

    // Step 2: Iteratively add capitals maximizing minimum distance to existing capitals
    while (capitals.length < count) {
      let bestCandidate: string | null = null
      let bestMinDistance = -1

      // Evaluate each remaining territory
      for (const candidateId of territoryIds) {
        if (capitals.includes(candidateId)) continue

        // Calculate minimum distance to all existing capitals
        const minDistance = this.getMinDistanceToCapitals(candidateId, capitals, graph)

        // Select candidate with maximum minimum distance (maximin)
        if (minDistance > bestMinDistance) {
          bestMinDistance = minDistance
          bestCandidate = candidateId
        }
      }

      if (bestCandidate) {
        capitals.push(bestCandidate)
        const territory = territories.find((t) => t.id === bestCandidate)
        logger.debug('Selected additional capital candidate', {
          position: capitals.length,
          territoryId: territory?.id,
          territoryName: territory?.name,
          minDistance: bestMinDistance,
        })
      } else {
        logger.warn('Could not find additional capital; using fallback selection', {
          desiredCount: count,
        })
        // Fallback: select random territory if algorithm fails
        const remaining = territoryIds.filter((id) => !capitals.includes(id))
        if (remaining.length > 0) {
          capitals.push(remaining[Math.floor(Math.random() * remaining.length)])
        }
      }
    }

    return capitals
  }

  /**
   * Find the territory with the best "centrality" score
   * Centrality = low total distance to all territories + high connection count
   */
  private findMostCentralTerritory(
    territories: Territory[],
    graph: Map<string, Set<string>>,
  ): string {
    let bestTerritory = territories[0].id
    let bestScore = Infinity

    for (const territory of territories) {
      // Calculate sum of distances to all other territories
      const totalDistance = this.getTotalDistanceToAll(
        territory.id,
        territories.map((t) => t.id),
        graph,
      )

      // Bonus for having more connections (hubs are better capitals)
      const connectionCount = graph.get(territory.id)?.size || 0
      const connectionBonus = connectionCount * 2

      // Lower score is better (less total distance, more connections)
      const score = totalDistance - connectionBonus

      if (score < bestScore) {
        bestScore = score
        bestTerritory = territory.id
      }
    }

    logger.debug('Identified most central territory', {
      territoryId: bestTerritory,
      territoryName: territories.find((t) => t.id === bestTerritory)?.name,
    })
    return bestTerritory
  }

  /**
   * BFS (Breadth-First Search) to find shortest path distance between territories
   * Returns Infinity if territories are not connected
   */
  private getDistance(from: string, to: string, graph: Map<string, Set<string>>): number {
    if (from === to) return 0

    const visited = new Set<string>()
    const queue: [string, number][] = [[from, 0]]
    visited.add(from)

    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) {
        break
      }
      const [current, distance] = next

      const neighbors = graph.get(current) || new Set()
      for (const neighbor of neighbors) {
        if (neighbor === to) {
          return distance + 1
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push([neighbor, distance + 1])
        }
      }
    }

    return Infinity // Territories are not connected
  }

  /**
   * Find minimum distance from a candidate to any existing capital
   */
  private getMinDistanceToCapitals(
    candidateId: string,
    capitals: string[],
    graph: Map<string, Set<string>>,
  ): number {
    let minDistance = Infinity

    for (const capital of capitals) {
      const distance = this.getDistance(candidateId, capital, graph)
      minDistance = Math.min(minDistance, distance)
    }

    return minDistance
  }

  /**
   * Calculate total distance from one territory to all others
   * Used for centrality calculation
   */
  private getTotalDistanceToAll(
    from: string,
    allTerritories: string[],
    graph: Map<string, Set<string>>,
  ): number {
    let total = 0
    for (const territory of allTerritories) {
      if (territory !== from) {
        const distance = this.getDistance(from, territory, graph)
        // Cap at 1000 to avoid Infinity affecting calculations
        total += Math.min(distance, 1000)
      }
    }
    return total
  }

  /**
   * Find all connected components in the graph
   * Returns array of territory groups that are connected to each other
   */
  private findConnectedComponents(
    territories: Territory[],
    graph: Map<string, Set<string>>,
  ): Territory[][] {
    const visited = new Set<string>()
    const components: Territory[][] = []

    for (const territory of territories) {
      if (!visited.has(territory.id)) {
        const component: Territory[] = []
        const queue = [territory.id]

        while (queue.length > 0) {
          const nextNode = queue.shift()
          if (!nextNode) {
            break
          }
          const current = nextNode
          if (visited.has(current)) continue

          visited.add(current)
          const currentTerritory = territories.find((t) => t.id === current)
          if (currentTerritory) {
            component.push(currentTerritory)
          }

          const neighbors = graph.get(current) || new Set()
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor)
            }
          }
        }

        if (component.length > 0) {
          components.push(component)
        }
      }
    }

    return components
  }

  /**
   * Build bidirectional adjacency graph from territories and adjacencies
   */
  private buildAdjacencyGraph(
    territories: Territory[],
    adjacencies: Adjacency[],
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>()

    // Initialize all territories in graph
    for (const territory of territories) {
      graph.set(territory.id, new Set())
    }

    // Add edges (bidirectional by default)
    for (const adj of adjacencies) {
      // Only add if both territories exist in our territory list
      if (graph.has(adj.from_territory_id) && graph.has(adj.to_territory_id)) {
        graph.get(adj.from_territory_id)?.add(adj.to_territory_id)
        graph.get(adj.to_territory_id)?.add(adj.from_territory_id)
      }
    }

    return graph
  }

  /**
   * Get all territories for a map from the database
   */
  private async getTerritories(mapId: string): Promise<Territory[]> {
    const result = await this.db.query(
      `SELECT id, name, map_id, boundary_coords, army_position 
       FROM map_territories 
       WHERE map_id = $1
       ORDER BY name`,
      [mapId],
    )
    return result.rows
  }

  /**
   * Get all adjacencies for territories in a map
   */
  private async getAdjacencies(mapId: string): Promise<Adjacency[]> {
    const result = await this.db.query(
      `
      SELECT DISTINCT
        mt1.id AS from_territory_id,
        mt2.id AS to_territory_id
      FROM territory_adjacencies a
      JOIN map_territories mt1
        ON mt1.map_id = a.map_id
       AND mt1.name = a.territory_from
      JOIN map_territories mt2
        ON mt2.map_id = a.map_id
       AND mt2.name = a.territory_to
      WHERE a.map_id = $1
    `,
      [mapId],
    )
    return result.rows
  }

  /**
   * Manually update capitals for a specific player count
   */
  async updateCapitalsForPlayerCount(
    mapId: string,
    playerCount: number,
    territoryIds: string[],
  ): Promise<void> {
    // Validate territory IDs belong to this map
    const territories = await this.getTerritories(mapId)
    const validIds = new Set(territories.map((t) => t.id))

    for (const id of territoryIds) {
      if (!validIds.has(id)) {
        throw new Error(`Territory ${id} does not belong to map ${mapId}`)
      }
    }

    if (territoryIds.length !== playerCount) {
      throw new Error(`Must provide exactly ${playerCount} territories for ${playerCount} players`)
    }

    // Get existing assignments
    const result = await this.db.query(
      'SELECT capital_assignments, capital_metadata FROM maps WHERE id = $1',
      [mapId],
    )

    const capitals = result.rows[0]?.capital_assignments || {}
    const metadata = result.rows[0]?.capital_metadata || {}

    // Update capitals for this player count
    capitals[playerCount] = territoryIds

    // Mark as manually adjusted
    if (!metadata.manuallyAdjusted) {
      metadata.manuallyAdjusted = {}
    }
    metadata.manuallyAdjusted[playerCount] = true
    metadata.lastModified = new Date().toISOString()

    // Save to database
    await this.db.query(
      'UPDATE maps SET capital_assignments = $1, capital_metadata = $2 WHERE id = $3',
      [JSON.stringify(capitals), JSON.stringify(metadata), mapId],
    )
  }
}
