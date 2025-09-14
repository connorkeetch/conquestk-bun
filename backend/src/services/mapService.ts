import { getClient, query } from '../config/database'
import type { ContinentBonus } from '../types/game'
import type {
  CreateAdjacencyRequest,
  CreateMapRequest,
  CreateTerritoryRequest,
  CustomMap,
  GameMode,
  MapContinent,
  MapRating,
  MapSearchFilters,
  MapSearchResult,
  MapTerritory,
  TerritoryAbilityType,
  TerritoryAdjacency,
  UpdateMapRequest,
} from '../types/maps'
import { logger } from '../utils/logger'

export class MapService {
  // ============= MAP CRUD OPERATIONS =============

  async createMap(
    userId: string,
    mapData: CreateMapRequest & { metadata?: any },
  ): Promise<CustomMap> {
    const client = await getClient()
    try {
      // Check if metadata column exists (add it if not)
      const hasMetadataColumn = true // We'll assume it exists or handle the error gracefully

      // Create the map record
      const mapQuery = hasMetadataColumn
        ? `
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, metadata, status, min_players, max_players)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `
        : `
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, status, min_players, max_players)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `

      const mapValues = hasMetadataColumn
        ? [
            mapData.name,
            mapData.description || null,
            userId,
            mapData.imageUrl || null,
            mapData.imageWidth || 800,
            mapData.imageHeight || 600,
            mapData.isPublic || false,
            mapData.tags || [],
            mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
            mapData.metadata ? JSON.stringify(mapData.metadata) : null,
            'pending_review', // status
            mapData.minPlayers || 2,
            mapData.maxPlayers || 6,
          ]
        : [
            mapData.name,
            mapData.description || null,
            userId,
            mapData.imageUrl || null,
            mapData.imageWidth || 800,
            mapData.imageHeight || 600,
            mapData.isPublic || false,
            mapData.tags || [],
            mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
            'pending_review', // status
            mapData.minPlayers || 2,
            mapData.maxPlayers || 6,
          ]

      const mapResult = await client.query(mapQuery, mapValues)

      const map = mapResult.rows[0]
      logger.info(`Created new map: ${map.name} (${map.id}) with metadata:`, {
        hasMetadata: !!mapData.metadata,
        territories: mapData.metadata?.territories?.length || 0,
        continents: mapData.metadata?.continents?.length || 0,
      })

      // Add to content approval queue for admin review
      try {
        await client.query(
          `
          INSERT INTO content_approval_queue (
            content_type, content_id, submitter_id, status, submitted_at
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          `,
          ['map', map.id, userId, 'pending']
        )
        logger.info(`Added map ${map.id} to approval queue`)
      } catch (queueError) {
        logger.warn('Failed to add map to approval queue (non-critical):', queueError)
        // Don't fail the map creation if queue insertion fails
      }

      return this.formatMapFromDb(map)
    } catch (error: any) {
      // If metadata column doesn't exist, try without it
      if (error.message && error.message.includes('metadata')) {
        logger.warn('Metadata column not found, creating map without metadata')
        const mapResult = await client.query(
          `
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
          [
            mapData.name,
            mapData.description || null,
            userId,
            mapData.imageUrl || null,
            mapData.imageWidth || 800,
            mapData.imageHeight || 600,
            mapData.isPublic || false,
            mapData.tags || [],
            mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
            'pending_review', // status
          ],
        )
        const map = mapResult.rows[0]
        logger.info(`Created new map without metadata: ${map.name} (${map.id})`)
        
        // Add to content approval queue for admin review
        try {
          await client.query(
            `
            INSERT INTO content_approval_queue (
              content_type, content_id, submitter_id, status, submitted_at
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `,
            ['map', map.id, userId, 'pending']
          )
          logger.info(`Added map ${map.id} to approval queue`)
        } catch (queueError) {
          logger.warn('Failed to add map to approval queue (non-critical):', queueError)
        }
        
        return this.formatMapFromDb(map)
      }
      throw error
    } finally {
      if (client.release) client.release()
    }
  }

  async getMap(mapId: string): Promise<CustomMap | null> {
    const result = await query('SELECT * FROM maps WHERE id = $1', [mapId])
    return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null
  }

  async getMapWithFullData(mapId: string): Promise<{
    map: CustomMap
    continents: MapContinent[]
    territories: MapTerritory[]
    adjacencies: TerritoryAdjacency[]
    gameMode?: GameMode
  } | null> {
    const map = await this.getMap(mapId)
    if (!map) return null

    const [continents, territories, adjacencies] = await Promise.all([
      this.getMapContinents(mapId),
      this.getMapTerritories(mapId),
      this.getMapAdjacencies(mapId),
    ])

    return { map, continents, territories, adjacencies }
  }

  async updateCapitalTerritories(
    mapId: string,
    userId: string,
    capitalTerritories: Record<string, number[]>,
  ): Promise<boolean> {
    try {
      // Validate capital territories
      const validationResult = await this.validateCapitalTerritories(mapId, capitalTerritories)
      if (!validationResult.valid) {
        throw new Error(`Invalid capital configuration: ${validationResult.error}`)
      }

      const result = await query(
        `
        UPDATE maps 
        SET capital_territories = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND creator_id = $3
      `,
        [JSON.stringify(capitalTerritories), mapId, userId],
      )

      return (result.rowCount ?? 0) > 0
    } catch (error) {
      logger.error('Error updating capital territories:', error)
      throw error
    }
  }

  async validateCapitalTerritories(
    mapId: string,
    capitalTerritories: Record<string, number[]>,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Get all territories for this map
      const territoriesResult = await query(
        `
        SELECT id, adjacencies FROM map_territories 
        WHERE map_id = ?
      `,
        [mapId],
      )

      const territories = territoriesResult.rows
      const territoryIds = new Set(territories.map((t) => t.id))

      // Validate each player count configuration
      for (const [playerCount, capitals] of Object.entries(capitalTerritories)) {
        const count = parseInt(playerCount, 10)

        // Check player count is valid (2-12)
        if (count < 2 || count > 12) {
          return { valid: false, error: `Invalid player count: ${count}` }
        }

        // Check correct number of capitals
        if (capitals.length !== count) {
          return {
            valid: false,
            error: `Player count ${count} requires exactly ${count} capitals, got ${capitals.length}`,
          }
        }

        // Check all capital IDs exist
        for (const capitalId of capitals) {
          if (!territoryIds.has(capitalId)) {
            return { valid: false, error: `Territory ${capitalId} does not exist in this map` }
          }
        }

        // Check capitals are not adjacent (minimum 2 territories apart)
        for (let i = 0; i < capitals.length; i++) {
          for (let j = i + 1; j < capitals.length; j++) {
            const territory1 = territories.find((t) => t.id === capitals[i])
            const territory2 = territories.find((t) => t.id === capitals[j])

            if (territory1 && territory2) {
              const adjacencies1 = this.safeJsonParse<number[]>(territory1.adjacencies, [])
              if (adjacencies1.includes(capitals[j])) {
                return {
                  valid: false,
                  error: `Capitals ${capitals[i]} and ${capitals[j]} are adjacent (too close)`,
                }
              }
            }
          }
        }
      }

      return { valid: true }
    } catch (error) {
      logger.error('Error validating capital territories:', error)
      return { valid: false, error: 'Validation failed' }
    }
  }

  async updateMap(
    mapId: string,
    userId: string,
    updates: UpdateMapRequest,
  ): Promise<CustomMap | null> {
    const client = await getClient()
    try {
      // Verify ownership
      const ownerCheck = await client.query('SELECT creator_id FROM maps WHERE id = $1', [mapId])
      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].creator_id !== userId) {
        throw new Error('Map not found or access denied')
      }

      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramCount = 0

      if (updates.name !== undefined) {
        updateFields.push(`name = $${++paramCount}`)
        updateValues.push(updates.name)
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${++paramCount}`)
        updateValues.push(updates.description)
      }
      if (updates.isPublic !== undefined) {
        updateFields.push(`is_public = $${++paramCount}`)
        updateValues.push(updates.isPublic)
      }
      if (updates.tags !== undefined) {
        updateFields.push(`tags = $${++paramCount}`)
        updateValues.push(updates.tags)
      }
      if (updates.imageUrl !== undefined) {
        updateFields.push(`image_url = $${++paramCount}`)
        updateValues.push(updates.imageUrl)
      }
      if (updates.imageWidth !== undefined) {
        updateFields.push(`image_width = $${++paramCount}`)
        updateValues.push(updates.imageWidth)
      }
      if (updates.imageHeight !== undefined) {
        updateFields.push(`image_height = $${++paramCount}`)
        updateValues.push(updates.imageHeight)
      }

      if (updateFields.length === 0) {
        return await this.getMap(mapId)
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP')
      updateValues.push(mapId)

      const result = await client.query(
        `
        UPDATE maps SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount}
        RETURNING *
      `,
        updateValues,
      )

      return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null
    } finally {
      if (client.release) client.release()
    }
  }

  async deleteMap(mapId: string, userId: string): Promise<boolean> {
    const client = await getClient()
    try {
      // Verify ownership
      const ownerCheck = await client.query('SELECT creator_id FROM maps WHERE id = $1', [mapId])
      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].creator_id !== userId) {
        return false
      }

      // Delete map (cascades to all related tables)
      const result = await client.query('DELETE FROM maps WHERE id = $1', [mapId])
      logger.info(`Deleted map ${mapId} by user ${userId}`)

      return (result.rowCount || 0) > 0
    } finally {
      if (client.release) client.release()
    }
  }

  async searchMaps(filters: MapSearchFilters): Promise<MapSearchResult> {
    const whereConditions: string[] = []
    const queryParams: any[] = []

    if (filters.isPublic !== false) {
      whereConditions.push('is_public = TRUE')
    }

    if (filters.search) {
      whereConditions.push('(name LIKE ? OR description LIKE ?)')
      // Escape special regex characters in search terms (Node.js 24+ RegExp.escape not yet in TypeScript)
      const escapedSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const searchTerm = `%${escapedSearch}%`
      queryParams.push(searchTerm, searchTerm)
    }

    if (filters.creator) {
      whereConditions.push('creator_id = ?')
      queryParams.push(filters.creator)
    }

    if (filters.isFeatured) {
      whereConditions.push('is_featured = TRUE')
    }

    if (filters.status) {
      whereConditions.push('status = ?')
      queryParams.push(filters.status)
    }

    if (filters.minRating) {
      whereConditions.push('rating_average >= ?')
      queryParams.push(filters.minRating)
    }

    if (filters.tags && filters.tags.length > 0) {
      // Simple tag matching - in production you might want better JSON querying
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' AND ')
      whereConditions.push(`(${tagConditions})`)
      filters.tags.forEach((tag) => {
        // Escape special regex characters in tag matching (Node.js 24+ RegExp.escape not yet in TypeScript)
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        queryParams.push(`%"${escapedTag}"%`)
      })
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    const orderBy = this.buildOrderByClause(filters.sortBy, filters.sortOrder)
    const limit = filters.limit || 20
    const offset = filters.offset || 0

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM maps ${whereClause}`,
      queryParams,
    )
    const total = countResult.rows[0].total

    // Get maps with pagination
    queryParams.push(limit, offset)
    const mapsResult = await query(
      `
      SELECT * FROM maps ${whereClause} ${orderBy} LIMIT ? OFFSET ?
    `,
      queryParams,
    )

    const maps = mapsResult.rows.map((row) => this.formatMapFromDb(row))
    const hasMore = offset + limit < total

    return { maps, total, hasMore }
  }

  // ============= TERRITORY OPERATIONS =============

  async createTerritory(territoryData: CreateTerritoryRequest): Promise<MapTerritory> {
    const client = await getClient()
    try {
      const result = await client.query(
        `
        INSERT INTO map_territories (
          map_id, name, polygon_data, continent, is_capital
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          territoryData.mapId,
          territoryData.name,
          JSON.stringify(territoryData.boundaryCoords || []),
          territoryData.continentId || null,
          false, // is_capital default
        ],
      )

      return this.formatTerritoryFromDb(result.rows[0])
    } finally {
      if (client.release) client.release()
    }
  }

  async getMapTerritories(mapId: string): Promise<MapTerritory[]> {
    const result = await query(
      `
      SELECT * FROM map_territories WHERE map_id = $1 ORDER BY name
    `,
      [mapId],
    )

    return result.rows.map((row) => this.formatTerritoryFromDb(row))
  }

  async updateTerritory(
    territoryId: string,
    updates: Partial<CreateTerritoryRequest>,
  ): Promise<MapTerritory | null> {
    const client = await getClient()
    try {
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramCount = 0

      if (updates.name) {
        updateFields.push(`name = $${++paramCount}`)
        updateValues.push(updates.name)
      }
      if (updates.continentId !== undefined) {
        updateFields.push(`continent = $${++paramCount}`)
        updateValues.push(updates.continentId)
      }
      if (updates.boundaryCoords) {
        updateFields.push(`polygon_data = $${++paramCount}`)
        updateValues.push(JSON.stringify(updates.boundaryCoords))
      }
      // armyPosition and abilityTypeId don't exist in current schema
      // Skip them to avoid errors

      if (updateFields.length === 0) {
        const result = await client.query('SELECT * FROM map_territories WHERE id = $1', [
          territoryId,
        ])
        return result.rows.length > 0 ? this.formatTerritoryFromDb(result.rows[0]) : null
      }

      updateValues.push(territoryId)
      const result = await client.query(
        `
        UPDATE map_territories SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount} RETURNING *
      `,
        updateValues,
      )

      return result.rows.length > 0 ? this.formatTerritoryFromDb(result.rows[0]) : null
    } finally {
      if (client.release) client.release()
    }
  }

  // ============= CONTINENT OPERATIONS =============

  async createContinent(
    mapId: string,
    name: string,
    bonusArmies: number,
    color?: string,
  ): Promise<MapContinent> {
    const client = await getClient()
    try {
      const result = await client.query(
        `
        INSERT INTO map_continents (map_id, name, bonus_armies, color)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [mapId, name, bonusArmies, color || '#cccccc'],
      )

      return this.formatContinentFromDb(result.rows[0])
    } finally {
      if (client.release) client.release()
    }
  }

  async getMapContinents(mapId: string): Promise<MapContinent[]> {
    const result = await query('SELECT * FROM map_continents WHERE map_id = $1 ORDER BY name', [
      mapId,
    ])
    return result.rows.map((row) => this.formatContinentFromDb(row))
  }

  async getMapContinentBonuses(mapId: string): Promise<ContinentBonus[]> {
    const result = await query(
      `
      SELECT 
        mc.id,
        mc.name,
        mc.bonus_armies,
        GROUP_CONCAT(mt.territory_id) as territories
      FROM map_continents mc
      LEFT JOIN map_territories mt ON mc.name = mt.continent
      WHERE mc.map_id = ?
      GROUP BY mc.id, mc.name, mc.bonus_armies
      ORDER BY mc.name
    `,
      [mapId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      bonusArmies: row.bonus_armies,
      territories: row.territories ? row.territories.split(',') : [],
    }))
  }

  // ============= ADJACENCY OPERATIONS =============

  async createAdjacency(adjacencyData: CreateAdjacencyRequest): Promise<TerritoryAdjacency> {
    const client = await getClient()
    try {
      const result = await client.query(
        `
        INSERT INTO territory_adjacencies (
          from_territory_id, to_territory_id, connection_type,
          is_bidirectional, special_requirements
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          adjacencyData.fromTerritoryId,
          adjacencyData.toTerritoryId,
          adjacencyData.connectionType || 'land',
          adjacencyData.isBidirectional !== false,
          adjacencyData.specialRequirements
            ? JSON.stringify(adjacencyData.specialRequirements)
            : null,
        ],
      )

      return this.formatAdjacencyFromDb(result.rows[0])
    } finally {
      if (client.release) client.release()
    }
  }

  async getMapAdjacencies(mapId: string): Promise<TerritoryAdjacency[]> {
    const result = await query(
      `
      SELECT ta.* FROM territory_adjacencies ta
      JOIN map_territories mt1 ON ta.from_territory_id = mt1.id
      JOIN map_territories mt2 ON ta.to_territory_id = mt2.id
      WHERE mt1.map_id = ? AND mt2.map_id = ?
    `,
      [mapId, mapId],
    )

    return result.rows.map((row) => this.formatAdjacencyFromDb(row))
  }

  // ============= GAME MODE OPERATIONS =============

  async getGameModes(): Promise<GameMode[]> {
    const result = await query('SELECT * FROM game_modes ORDER BY is_default DESC, name')
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      config: this.safeJsonParse(row.config, { type: 'classic' as const }), 
      isDefault: row.is_default,
      createdAt: new Date(row.created_at),
    }))
  }

  async getTerritoryAbilityTypes(): Promise<TerritoryAbilityType[]> {
    const result = await query('SELECT * FROM territory_ability_types ORDER BY name')
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      effectConfig: this.safeJsonParse(row.effect_config, { type: 'defense' as const }),
      createdAt: new Date(row.created_at),
    }))
  }

  // ============= RATING OPERATIONS =============

  async rateMap(
    mapId: string,
    userId: string,
    rating: number,
    review?: string,
  ): Promise<MapRating> {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // Insert or update rating
      const result = await client.query(
        `
        INSERT INTO map_ratings (map_id, user_id, rating, review)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (map_id, user_id) DO UPDATE SET
          rating = EXCLUDED.rating,
          review = EXCLUDED.review,
          created_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
        [mapId, userId, rating, review || null],
      )

      // Update map's average rating
      await this.updateMapRatingStats(client, mapId)

      await client.query('COMMIT')

      return {
        id: result.rows[0].id,
        mapId: result.rows[0].map_id,
        userId: result.rows[0].user_id,
        rating: result.rows[0].rating,
        review: result.rows[0].review,
        createdAt: new Date(result.rows[0].created_at),
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) client.release()
    }
  }

  // ============= PRIVATE HELPER METHODS =============

  /**
   * Safely parse tags from various PostgreSQL array formats
   * Handles: arrays, PostgreSQL array strings, JSON strings, comma-separated strings
   */
  private parseTags(tags: any): string[] {
    if (!tags) return []
    
    // Already an array
    if (Array.isArray(tags)) return tags
    
    // String handling
    if (typeof tags === 'string') {
      // PostgreSQL array format: {tag1,tag2,"tag with spaces"}
      if (tags.startsWith('{') && tags.endsWith('}')) {
        const content = tags.slice(1, -1)
        // Handle quoted values for tags with commas/spaces
        const result: string[] = []
        let current = ''
        let inQuotes = false
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i]
          if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            if (current) result.push(current)
            current = ''
          } else {
            current += char
          }
        }
        if (current) result.push(current)
        return result
      }
      
      // Try JSON parse
      try {
        const parsed = JSON.parse(tags)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        // Fallback to comma-separated
        return tags.split(',').map(t => t.trim()).filter(Boolean)
      }
    }
    
    return []
  }

  /**
   * Safely parse JSON with fallback to default value
   */
  private safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
    if (!json) return defaultValue
    try {
      return JSON.parse(json)
    } catch (error) {
      logger.warn('Failed to parse JSON:', { json, error })
      return defaultValue
    }
  }

  private formatMapFromDb(row: any): CustomMap {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      creatorId: row.creator_id,
      imageUrl: row.image_url,
      imageWidth: row.image_width || 600,
      imageHeight: row.image_height || 450,
      isPublic: row.is_public,
      isFeatured: row.is_featured,
      status: row.status || 'pending_review',
      version: row.version || 1,
      parentMapId: row.parent_map_id,
      downloadCount: row.download_count || 0,
      playCount: row.play_count || 0,
      ratingAverage: parseFloat(row.rating_average) || 0,
      ratingCount: row.rating_count || 0,
      tags: this.parseTags(row.tags),
      capitalTerritories: row.capital_territories ? this.safeJsonParse(row.capital_territories, undefined) : undefined,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      reviewedBy: row.reviewed_by,
      reviewNotes: row.review_notes,
      rejectionReason: row.rejection_reason,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private formatTerritoryFromDb(row: any): MapTerritory {
    return {
      id: row.id,
      mapId: row.map_id,
      territoryId: row.id, // Using id as territory_id doesn't exist
      name: row.name,
      continentId: row.continent,
      boundaryCoords: this.safeJsonParse(row.polygon_data, []),
      armyPosition: { x: 0, y: 0 }, // No army position columns in schema
      abilityTypeId: undefined, // No ability_type_id in schema
      customAbilityConfig: undefined,
      startingOwnerSlot: undefined,
      startingArmies: 1,
      createdAt: new Date(row.created_at),
    }
  }

  private formatContinentFromDb(row: any): MapContinent {
    return {
      id: row.id,
      mapId: row.map_id,
      name: row.name,
      bonusArmies: row.bonus_armies,
      color: row.color,
      specialRules: row.special_rules ? this.safeJsonParse(row.special_rules, undefined) : undefined,
      createdAt: new Date(row.created_at),
    }
  }

  private formatAdjacencyFromDb(row: any): TerritoryAdjacency {
    return {
      id: row.id,
      fromTerritoryId: row.from_territory_id,
      toTerritoryId: row.to_territory_id,
      connectionType: row.connection_type,
      isBidirectional: row.is_bidirectional,
      specialRequirements: row.special_requirements
        ? this.safeJsonParse(row.special_requirements, undefined)
        : undefined,
    }
  }

  private buildOrderByClause(sortBy?: string, sortOrder?: string): string {
    const order = sortOrder === 'desc' ? 'DESC' : 'ASC'

    switch (sortBy) {
      case 'name':
        return `ORDER BY name ${order}`
      case 'rating':
        return `ORDER BY rating_average ${order}`
      case 'downloads':
        return `ORDER BY download_count ${order}`
      default:
        return `ORDER BY created_at ${order}`
    }
  }

  private async updateMapRatingStats(client: any, mapId: string): Promise<void> {
    await client.query(
      `
      UPDATE maps SET
        rating_average = (SELECT AVG(rating) FROM map_ratings WHERE map_id = $1),
        rating_count = (SELECT COUNT(*) FROM map_ratings WHERE map_id = $2)
      WHERE id = $3
    `,
      [mapId, mapId, mapId],
    )
  }
}

export const mapService = new MapService()
