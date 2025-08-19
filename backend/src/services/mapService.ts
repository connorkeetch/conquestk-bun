import { query, getClient } from '../config/database';
import { logger } from '../utils/logger';
import { ContinentBonus } from '../types/game';
import {
  CustomMap,
  MapTerritory,
  MapContinent,
  TerritoryAdjacency,
  TerritoryAbilityType,
  GameMode,
  MapRating,
  MapSearchFilters,
  MapSearchResult,
  CreateMapRequest,
  UpdateMapRequest,
  CreateTerritoryRequest,
  CreateAdjacencyRequest,
  Coordinate
} from '../types/maps';

export class MapService {
  
  // ============= MAP CRUD OPERATIONS =============
  
  async createMap(userId: string, mapData: CreateMapRequest): Promise<CustomMap> {
    const client = await getClient();
    try {
      // Create the map record
      const mapResult = await client.query(`
        INSERT INTO maps (name, description, creator_id, is_public, tags)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `, [
        mapData.name,
        mapData.description || null,
        userId,
        mapData.isPublic || false,
        JSON.stringify(mapData.tags || [])
      ]);

      const map = mapResult.rows[0];
      logger.info(`Created new map: ${map.name} (${map.id})`);
      
      return this.formatMapFromDb(map);
    } finally {
      if (client.release) client.release();
    }
  }

  async getMap(mapId: string): Promise<CustomMap | null> {
    const result = await query('SELECT * FROM maps WHERE id = ?', [mapId]);
    return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null;
  }

  async getMapWithFullData(mapId: string): Promise<{
    map: CustomMap;
    continents: MapContinent[];
    territories: MapTerritory[];
    adjacencies: TerritoryAdjacency[];
    gameMode?: GameMode;
  } | null> {
    const map = await this.getMap(mapId);
    if (!map) return null;

    const [continents, territories, adjacencies] = await Promise.all([
      this.getMapContinents(mapId),
      this.getMapTerritories(mapId),
      this.getMapAdjacencies(mapId)
    ]);

    return { map, continents, territories, adjacencies };
  }

  async updateMap(mapId: string, userId: string, updates: UpdateMapRequest): Promise<CustomMap | null> {
    const client = await getClient();
    try {
      // Verify ownership
      const ownerCheck = await client.query('SELECT creator_id FROM maps WHERE id = ?', [mapId]);
      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].creator_id !== userId) {
        throw new Error('Map not found or access denied');
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(updates.name);
      }
      if (updates.description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(updates.description);
      }
      if (updates.isPublic !== undefined) {
        updateFields.push('is_public = ?');
        updateValues.push(updates.isPublic);
      }
      if (updates.tags !== undefined) {
        updateFields.push('tags = ?');
        updateValues.push(JSON.stringify(updates.tags));
      }

      if (updateFields.length === 0) {
        return await this.getMap(mapId);
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(mapId);

      const result = await client.query(`
        UPDATE maps SET ${updateFields.join(', ')}
        WHERE id = ?
        RETURNING *
      `, updateValues);

      return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null;
    } finally {
      if (client.release) client.release();
    }
  }

  async deleteMap(mapId: string, userId: string): Promise<boolean> {
    const client = await getClient();
    try {
      // Verify ownership
      const ownerCheck = await client.query('SELECT creator_id FROM maps WHERE id = ?', [mapId]);
      if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].creator_id !== userId) {
        return false;
      }

      // Delete map (cascades to all related tables)
      const result = await client.query('DELETE FROM maps WHERE id = ?', [mapId]);
      logger.info(`Deleted map ${mapId} by user ${userId}`);
      
      return (result.rowCount || 0) > 0;
    } finally {
      if (client.release) client.release();
    }
  }

  async searchMaps(filters: MapSearchFilters): Promise<MapSearchResult> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    if (filters.isPublic !== false) {
      whereConditions.push('is_public = TRUE');
    }

    if (filters.search) {
      whereConditions.push('(name LIKE ? OR description LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    if (filters.creator) {
      whereConditions.push('creator_id = ?');
      queryParams.push(filters.creator);
    }

    if (filters.isFeatured) {
      whereConditions.push('is_featured = TRUE');
    }

    if (filters.minRating) {
      whereConditions.push('rating_average >= ?');
      queryParams.push(filters.minRating);
    }

    if (filters.tags && filters.tags.length > 0) {
      // Simple tag matching - in production you might want better JSON querying
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' AND ');
      whereConditions.push(`(${tagConditions})`);
      filters.tags.forEach(tag => queryParams.push(`%"${tag}"%`));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const orderBy = this.buildOrderByClause(filters.sortBy, filters.sortOrder);
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    // Get total count
    const countResult = await query(`SELECT COUNT(*) as total FROM maps ${whereClause}`, queryParams);
    const total = countResult.rows[0].total;

    // Get maps with pagination
    queryParams.push(limit, offset);
    const mapsResult = await query(`
      SELECT * FROM maps ${whereClause} ${orderBy} LIMIT ? OFFSET ?
    `, queryParams);

    const maps = mapsResult.rows.map(row => this.formatMapFromDb(row));
    const hasMore = offset + limit < total;

    return { maps, total, hasMore };
  }

  // ============= TERRITORY OPERATIONS =============

  async createTerritory(territoryData: CreateTerritoryRequest): Promise<MapTerritory> {
    const client = await getClient();
    try {
      const result = await client.query(`
        INSERT INTO map_territories (
          map_id, territory_id, name, continent_id, boundary_coords,
          army_position_x, army_position_y, ability_type_id,
          starting_owner_slot, starting_armies
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, [
        territoryData.mapId,
        territoryData.territoryId,
        territoryData.name,
        territoryData.continentId || null,
        JSON.stringify(territoryData.boundaryCoords),
        territoryData.armyPosition.x,
        territoryData.armyPosition.y,
        territoryData.abilityTypeId || null,
        territoryData.startingOwnerSlot || null,
        territoryData.startingArmies || 1
      ]);

      return this.formatTerritoryFromDb(result.rows[0]);
    } finally {
      if (client.release) client.release();
    }
  }

  async getMapTerritories(mapId: string): Promise<MapTerritory[]> {
    const result = await query(`
      SELECT * FROM map_territories WHERE map_id = ? ORDER BY name
    `, [mapId]);
    
    return result.rows.map(row => this.formatTerritoryFromDb(row));
  }

  async updateTerritory(territoryId: string, updates: Partial<CreateTerritoryRequest>): Promise<MapTerritory | null> {
    const client = await getClient();
    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.name) {
        updateFields.push('name = ?');
        updateValues.push(updates.name);
      }
      if (updates.continentId !== undefined) {
        updateFields.push('continent_id = ?');
        updateValues.push(updates.continentId);
      }
      if (updates.boundaryCoords) {
        updateFields.push('boundary_coords = ?');
        updateValues.push(JSON.stringify(updates.boundaryCoords));
      }
      if (updates.armyPosition) {
        updateFields.push('army_position_x = ?, army_position_y = ?');
        updateValues.push(updates.armyPosition.x, updates.armyPosition.y);
      }
      if (updates.abilityTypeId !== undefined) {
        updateFields.push('ability_type_id = ?');
        updateValues.push(updates.abilityTypeId);
      }

      if (updateFields.length === 0) {
        const result = await client.query('SELECT * FROM map_territories WHERE id = ?', [territoryId]);
        return result.rows.length > 0 ? this.formatTerritoryFromDb(result.rows[0]) : null;
      }

      updateValues.push(territoryId);
      const result = await client.query(`
        UPDATE map_territories SET ${updateFields.join(', ')}
        WHERE id = ? RETURNING *
      `, updateValues);

      return result.rows.length > 0 ? this.formatTerritoryFromDb(result.rows[0]) : null;
    } finally {
      if (client.release) client.release();
    }
  }

  // ============= CONTINENT OPERATIONS =============

  async createContinent(mapId: string, name: string, bonusArmies: number, color?: string): Promise<MapContinent> {
    const client = await getClient();
    try {
      const result = await client.query(`
        INSERT INTO map_continents (map_id, name, bonus_armies, color)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `, [mapId, name, bonusArmies, color || '#cccccc']);

      return this.formatContinentFromDb(result.rows[0]);
    } finally {
      if (client.release) client.release();
    }
  }

  async getMapContinents(mapId: string): Promise<MapContinent[]> {
    const result = await query('SELECT * FROM map_continents WHERE map_id = ? ORDER BY name', [mapId]);
    return result.rows.map(row => this.formatContinentFromDb(row));
  }

  async getMapContinentBonuses(mapId: string): Promise<ContinentBonus[]> {
    const result = await query(`
      SELECT 
        mc.id,
        mc.name,
        mc.bonus_armies,
        GROUP_CONCAT(mt.territory_id) as territories
      FROM map_continents mc
      LEFT JOIN map_territories mt ON mc.id = mt.continent_id
      WHERE mc.map_id = ?
      GROUP BY mc.id, mc.name, mc.bonus_armies
      ORDER BY mc.name
    `, [mapId]);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      bonusArmies: row.bonus_armies,
      territories: row.territories ? row.territories.split(',') : []
    }));
  }

  // ============= ADJACENCY OPERATIONS =============

  async createAdjacency(adjacencyData: CreateAdjacencyRequest): Promise<TerritoryAdjacency> {
    const client = await getClient();
    try {
      const result = await client.query(`
        INSERT INTO territory_adjacencies (
          from_territory_id, to_territory_id, connection_type,
          is_bidirectional, special_requirements
        ) VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `, [
        adjacencyData.fromTerritoryId,
        adjacencyData.toTerritoryId,
        adjacencyData.connectionType || 'land',
        adjacencyData.isBidirectional !== false,
        adjacencyData.specialRequirements ? JSON.stringify(adjacencyData.specialRequirements) : null
      ]);

      return this.formatAdjacencyFromDb(result.rows[0]);
    } finally {
      if (client.release) client.release();
    }
  }

  async getMapAdjacencies(mapId: string): Promise<TerritoryAdjacency[]> {
    const result = await query(`
      SELECT ta.* FROM territory_adjacencies ta
      JOIN map_territories mt1 ON ta.from_territory_id = mt1.id
      JOIN map_territories mt2 ON ta.to_territory_id = mt2.id
      WHERE mt1.map_id = ? AND mt2.map_id = ?
    `, [mapId, mapId]);
    
    return result.rows.map(row => this.formatAdjacencyFromDb(row));
  }

  // ============= GAME MODE OPERATIONS =============

  async getGameModes(): Promise<GameMode[]> {
    const result = await query('SELECT * FROM game_modes ORDER BY is_default DESC, name');
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      config: JSON.parse(row.config),
      isDefault: row.is_default,
      createdAt: new Date(row.created_at)
    }));
  }

  async getTerritoryAbilityTypes(): Promise<TerritoryAbilityType[]> {
    const result = await query('SELECT * FROM territory_ability_types ORDER BY name');
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      effectConfig: JSON.parse(row.effect_config),
      createdAt: new Date(row.created_at)
    }));
  }

  // ============= RATING OPERATIONS =============

  async rateMap(mapId: string, userId: string, rating: number, review?: string): Promise<MapRating> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Insert or update rating
      const result = await client.query(`
        INSERT INTO map_ratings (map_id, user_id, rating, review)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (map_id, user_id) DO UPDATE SET
          rating = EXCLUDED.rating,
          review = EXCLUDED.review,
          created_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [mapId, userId, rating, review || null]);

      // Update map's average rating
      await this.updateMapRatingStats(client, mapId);
      
      await client.query('COMMIT');
      
      return {
        id: result.rows[0].id,
        mapId: result.rows[0].map_id,
        userId: result.rows[0].user_id,
        rating: result.rows[0].rating,
        review: result.rows[0].review,
        createdAt: new Date(result.rows[0].created_at)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client.release) client.release();
    }
  }

  // ============= PRIVATE HELPER METHODS =============

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
      downloadCount: row.download_count || 0,
      ratingAverage: parseFloat(row.rating_average) || 0,
      ratingCount: row.rating_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private formatTerritoryFromDb(row: any): MapTerritory {
    return {
      id: row.id,
      mapId: row.map_id,
      territoryId: row.territory_id,
      name: row.name,
      continentId: row.continent_id,
      boundaryCoords: JSON.parse(row.boundary_coords),
      armyPosition: { x: row.army_position_x, y: row.army_position_y },
      abilityTypeId: row.ability_type_id,
      customAbilityConfig: row.custom_ability_config ? JSON.parse(row.custom_ability_config) : undefined,
      startingOwnerSlot: row.starting_owner_slot,
      startingArmies: row.starting_armies || 1,
      createdAt: new Date(row.created_at)
    };
  }

  private formatContinentFromDb(row: any): MapContinent {
    return {
      id: row.id,
      mapId: row.map_id,
      name: row.name,
      bonusArmies: row.bonus_armies,
      color: row.color,
      specialRules: row.special_rules ? JSON.parse(row.special_rules) : undefined,
      createdAt: new Date(row.created_at)
    };
  }

  private formatAdjacencyFromDb(row: any): TerritoryAdjacency {
    return {
      id: row.id,
      fromTerritoryId: row.from_territory_id,
      toTerritoryId: row.to_territory_id,
      connectionType: row.connection_type,
      isBidirectional: row.is_bidirectional,
      specialRequirements: row.special_requirements ? JSON.parse(row.special_requirements) : undefined
    };
  }

  private buildOrderByClause(sortBy?: string, sortOrder?: string): string {
    const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
    
    switch (sortBy) {
      case 'name':
        return `ORDER BY name ${order}`;
      case 'rating':
        return `ORDER BY rating_average ${order}`;
      case 'downloads':
        return `ORDER BY download_count ${order}`;
      case 'created':
      default:
        return `ORDER BY created_at ${order}`;
    }
  }

  private async updateMapRatingStats(client: any, mapId: string): Promise<void> {
    await client.query(`
      UPDATE maps SET
        rating_average = (SELECT AVG(rating) FROM map_ratings WHERE map_id = ?),
        rating_count = (SELECT COUNT(*) FROM map_ratings WHERE map_id = ?)
      WHERE id = ?
    `, [mapId, mapId, mapId]);
  }
}

export const mapService = new MapService();