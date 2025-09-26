import type { QueryResultRow } from 'pg'
import { query } from '../config/database'
import { logger } from '../utils/logger'
import { territoryModifierCache } from './cacheService'

export interface TerritoryModifierTemplate {
  id: string
  name: string
  icon: string
  color: string
  defense_bonus: number
  attack_bonus: number
  troop_generation_bonus: number
  movement_restriction: boolean
  supply_line_bonus: boolean
  description?: string
}

export interface GameTerritoryModifier {
  territory_id: string
  defense_bonus: number
  attack_bonus: number
  troop_generation_bonus: number
  movement_restriction: boolean
  supply_line_bonus: boolean
  icon: string
  color: string
  name: string
}

interface MapModifierRow extends QueryResultRow {
  territory_id: string
  defense_bonus: number
  attack_bonus: number
  troop_generation_bonus: number
  movement_restriction: boolean
  supply_line_bonus: boolean
  icon: string
  color: string
  name: string
}

export class TerritoryModifierService {
  /**
   * Get all available modifier templates (cached)
   */
  async getModifierTemplates(): Promise<TerritoryModifierTemplate[]> {
    // Check cache first
    let templates = (await territoryModifierCache.getTemplates()) as
      | TerritoryModifierTemplate[]
      | null
    if (templates) {
      return templates
    }

    // Cache miss - query database
    const result = await query('SELECT * FROM territory_modifier_templates ORDER BY name')
    templates = result.rows as TerritoryModifierTemplate[]

    // Cache the results
    await territoryModifierCache.setTemplates(templates)
    return templates
  }

  /**
   * Get modifiers for a specific map (cached)
   */
  async getMapModifiers(mapId: string): Promise<GameTerritoryModifier[]> {
    // Check cache first
    let modifiers = (await territoryModifierCache.getMapModifiers(mapId)) as
      | GameTerritoryModifier[]
      | null
    if (modifiers) {
      return modifiers
    }

    // Cache miss - query database
    const sql = `
      SELECT 
        mtm.*,
        tmt.name,
        tmt.icon,
        tmt.color,
        tmt.defense_bonus,
        tmt.attack_bonus,
        tmt.troop_generation_bonus,
        tmt.movement_restriction,
        tmt.supply_line_bonus,
        tmt.description
      FROM map_territory_modifiers mtm
      JOIN territory_modifier_templates tmt ON mtm.modifier_template_id = tmt.id
      WHERE mtm.map_id = $1
    `
    const result = await query<MapModifierRow>(sql, [mapId])
    modifiers = result.rows.map((row) => ({
      territory_id: row.territory_id,
      defense_bonus: row.defense_bonus,
      attack_bonus: row.attack_bonus,
      troop_generation_bonus: row.troop_generation_bonus,
      movement_restriction: row.movement_restriction,
      supply_line_bonus: row.supply_line_bonus,
      icon: row.icon,
      color: row.color,
      name: row.name,
    }))

    // Cache the results
    await territoryModifierCache.setMapModifiers(mapId, modifiers)
    return modifiers
  }

  /**
   * Initialize modifiers for a new game
   * @param gameId - The game room ID
   * @param mapId - The map being used
   * @param distribution - How modifiers should be distributed (none, sparse, balanced, abundant)
   */
  async initializeGameModifiers(
    gameId: string,
    mapId: string,
    distribution: string,
    territories: string[],
  ): Promise<void> {
    try {
      // Always prefer map-defined modifiers
      const mapModifiers = await this.getMapModifiers(mapId)

      if (mapModifiers.length > 0) {
        await this.applyMapModifiers(gameId, mapModifiers)
      } else if (distribution !== 'none') {
        // Only generate random modifiers if explicitly requested
        await this.generateRandomModifiers(gameId, territories, distribution)
      } else {
        logger.info(`No territory modifiers applied for game ${gameId}`)
        return
      }

      logger.info(
        `Initialized territory modifiers for game ${gameId} with distribution: ${distribution}`,
      )
    } catch (error) {
      logger.error('Failed to initialize game modifiers:', error)
      throw error
    }
  }

  /**
   * Apply predefined map modifiers to a game (optimized batch insert)
   */
  private async applyMapModifiers(
    gameId: string,
    mapModifiers: GameTerritoryModifier[],
  ): Promise<void> {
    if (mapModifiers.length === 0) return

    // Build batch insert with PostgreSQL VALUES clause
    const values: Array<string | number | boolean> = []
    const placeholders: string[] = []

    mapModifiers.forEach((modifier, index) => {
      const baseIndex = index * 10
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10})`,
      )

      values.push(
        gameId,
        modifier.territory_id,
        modifier.defense_bonus,
        modifier.attack_bonus,
        modifier.troop_generation_bonus,
        modifier.movement_restriction,
        modifier.supply_line_bonus,
        modifier.icon,
        modifier.color,
        modifier.name,
      )
    })

    const sql = `
      INSERT INTO game_territory_modifiers (
        game_id, territory_id, defense_bonus, attack_bonus, 
        troop_generation_bonus, movement_restriction, supply_line_bonus,
        icon, color, name
      ) VALUES ${placeholders.join(', ')}
    `

    await query(sql, values)
    logger.info(`Batch inserted ${mapModifiers.length} map modifiers for game ${gameId}`)
  }

  /**
   * Generate random modifiers for territories
   */
  private async generateRandomModifiers(
    gameId: string,
    territories: string[],
    distribution: string,
  ): Promise<void> {
    // Get all modifier templates
    const templates = await this.getModifierTemplates()
    if (templates.length === 0) return

    // Determine how many territories should have modifiers
    const modifierPercentage =
      {
        sparse: 0.15, // 15% of territories
        balanced: 0.3, // 30% of territories
        abundant: 0.5, // 50% of territories
      }[distribution] || 0.3

    const numModifiers = Math.floor(territories.length * modifierPercentage)

    // Randomly select territories to modify
    const shuffled = [...territories].sort(() => Math.random() - 0.5)
    const selectedTerritories = shuffled.slice(0, numModifiers)

    // Prepare batch insert data
    const modifiersToInsert: GameTerritoryModifier[] = []
    for (const territoryId of selectedTerritories) {
      const template = templates[Math.floor(Math.random() * templates.length)]
      modifiersToInsert.push({
        territory_id: territoryId,
        defense_bonus: template.defense_bonus,
        attack_bonus: template.attack_bonus,
        troop_generation_bonus: template.troop_generation_bonus,
        movement_restriction: template.movement_restriction,
        supply_line_bonus: template.supply_line_bonus,
        icon: template.icon,
        color: template.color,
        name: template.name,
      })
    }

    // Use the same batch insert logic
    await this.applyMapModifiers(gameId, modifiersToInsert)
  }

  /**
   * Get all modifiers for a specific game (cached)
   */
  async getGameModifiers(gameId: string): Promise<Map<string, GameTerritoryModifier>> {
    // Check cache first
    const cachedModifiers = await territoryModifierCache.getGameModifiers(gameId)
    if (cachedModifiers) {
      // Convert cached object back to Map
      const modifierMap = new Map<string, GameTerritoryModifier>()
      for (const [territoryId, modifier] of Object.entries(cachedModifiers)) {
        modifierMap.set(territoryId, modifier as GameTerritoryModifier)
      }
      return modifierMap
    }

    // Cache miss - query database
    const sql = `
      SELECT * FROM game_territory_modifiers 
      WHERE game_id = $1
    `
    const result = await query(sql, [gameId])

    const modifierMap = new Map<string, GameTerritoryModifier>()
    for (const row of result.rows) {
      modifierMap.set(row.territory_id, {
        territory_id: row.territory_id,
        defense_bonus: row.defense_bonus,
        attack_bonus: row.attack_bonus,
        troop_generation_bonus: row.troop_generation_bonus,
        movement_restriction: row.movement_restriction,
        supply_line_bonus: row.supply_line_bonus,
        icon: row.icon,
        color: row.color,
        name: row.name,
      })
    }

    // Cache the results
    await territoryModifierCache.setGameModifiers(gameId, modifierMap)
    return modifierMap
  }

  /**
   * Get modifier for a specific territory in a game (optimized)
   */
  async getTerritoryModifier(
    gameId: string,
    territoryId: string,
  ): Promise<GameTerritoryModifier | null> {
    // Get all game modifiers (cached) and extract the specific one
    const allModifiers = await this.getGameModifiers(gameId)
    return allModifiers.get(territoryId) || null
  }

  /**
   * Clean up modifiers for finished games
   */
  async cleanupFinishedGameModifiers(gameIds: string[]): Promise<void> {
    if (gameIds.length === 0) return

    // Remove from cache
    for (const gameId of gameIds) {
      await territoryModifierCache.removeGameModifiers(gameId)
    }

    // Remove from database in batch
    const placeholders = gameIds.map((_, index) => `$${index + 1}`).join(', ')
    const sql = `DELETE FROM game_territory_modifiers WHERE game_id IN (${placeholders})`

    await query(sql, gameIds)
    logger.info(`Cleaned up territory modifiers for ${gameIds.length} finished games`)
  }
}

export default new TerritoryModifierService()
