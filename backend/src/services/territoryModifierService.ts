import { query } from '../config/database';
import { logger } from '../utils/logger';

export interface TerritoryModifierTemplate {
  id: string;
  name: string;
  icon: string;
  color: string;
  defense_bonus: number;
  attack_bonus: number;
  troop_generation_bonus: number;
  movement_restriction: boolean;
  supply_line_bonus: boolean;
  description?: string;
}

export interface GameTerritoryModifier {
  territory_id: string;
  defense_bonus: number;
  attack_bonus: number;
  troop_generation_bonus: number;
  movement_restriction: boolean;
  supply_line_bonus: boolean;
  icon: string;
  color: string;
  name: string;
}

export class TerritoryModifierService {
  /**
   * Get all available modifier templates
   */
  async getModifierTemplates(): Promise<TerritoryModifierTemplate[]> {
    const result = await query('SELECT * FROM territory_modifier_templates ORDER BY name');
    return result.rows;
  }

  /**
   * Get modifiers for a specific map
   */
  async getMapModifiers(mapId: string): Promise<any[]> {
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
      WHERE mtm.map_id = ?
    `;
    const result = await query(sql, [mapId]);
    return result.rows;
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
    distribution: string = 'balanced',
    territories: string[]
  ): Promise<void> {
    try {
      // If distribution is 'none', don't add any modifiers
      if (distribution === 'none') {
        logger.info(`No modifiers for game ${gameId}`);
        return;
      }

      // Get map-specific modifiers if they exist
      const mapModifiers = await this.getMapModifiers(mapId);
      
      if (mapModifiers.length > 0) {
        // Use predefined map modifiers
        await this.applyMapModifiers(gameId, mapModifiers);
      } else {
        // Generate random modifiers based on distribution
        await this.generateRandomModifiers(gameId, territories, distribution);
      }

      logger.info(`Initialized territory modifiers for game ${gameId} with distribution: ${distribution}`);
    } catch (error) {
      logger.error('Failed to initialize game modifiers:', error);
      throw error;
    }
  }

  /**
   * Apply predefined map modifiers to a game
   */
  private async applyMapModifiers(gameId: string, mapModifiers: any[]): Promise<void> {
    for (const modifier of mapModifiers) {
      const sql = `
        INSERT INTO game_territory_modifiers (
          game_id, territory_id, defense_bonus, attack_bonus, 
          troop_generation_bonus, movement_restriction, supply_line_bonus,
          icon, color, name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await query(sql, [
        gameId,
        modifier.territory_id,
        modifier.defense_bonus,
        modifier.attack_bonus,
        modifier.troop_generation_bonus,
        modifier.movement_restriction,
        modifier.supply_line_bonus,
        modifier.icon,
        modifier.color,
        modifier.name
      ]);
    }
  }

  /**
   * Generate random modifiers for territories
   */
  private async generateRandomModifiers(
    gameId: string, 
    territories: string[], 
    distribution: string
  ): Promise<void> {
    // Get all modifier templates
    const templates = await this.getModifierTemplates();
    if (templates.length === 0) return;

    // Determine how many territories should have modifiers
    const modifierPercentage = {
      sparse: 0.15,    // 15% of territories
      balanced: 0.30,  // 30% of territories
      abundant: 0.50   // 50% of territories
    }[distribution] || 0.30;

    const numModifiers = Math.floor(territories.length * modifierPercentage);
    
    // Randomly select territories to modify
    const shuffled = [...territories].sort(() => Math.random() - 0.5);
    const selectedTerritories = shuffled.slice(0, numModifiers);

    // Assign random modifiers to selected territories
    for (const territoryId of selectedTerritories) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      
      const sql = `
        INSERT INTO game_territory_modifiers (
          game_id, territory_id, defense_bonus, attack_bonus, 
          troop_generation_bonus, movement_restriction, supply_line_bonus,
          icon, color, name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await query(sql, [
        gameId,
        territoryId,
        template.defense_bonus,
        template.attack_bonus,
        template.troop_generation_bonus,
        template.movement_restriction,
        template.supply_line_bonus,
        template.icon,
        template.color,
        template.name
      ]);
    }
  }

  /**
   * Get all modifiers for a specific game
   */
  async getGameModifiers(gameId: string): Promise<Map<string, GameTerritoryModifier>> {
    const sql = `
      SELECT * FROM game_territory_modifiers 
      WHERE game_id = ?
    `;
    const result = await query(sql, [gameId]);
    
    const modifierMap = new Map<string, GameTerritoryModifier>();
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
        name: row.name
      });
    }
    
    return modifierMap;
  }

  /**
   * Get modifier for a specific territory in a game
   */
  async getTerritoryModifier(gameId: string, territoryId: string): Promise<GameTerritoryModifier | null> {
    const sql = `
      SELECT * FROM game_territory_modifiers 
      WHERE game_id = ? AND territory_id = ?
    `;
    const result = await query(sql, [gameId, territoryId]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      territory_id: row.territory_id,
      defense_bonus: row.defense_bonus,
      attack_bonus: row.attack_bonus,
      troop_generation_bonus: row.troop_generation_bonus,
      movement_restriction: row.movement_restriction,
      supply_line_bonus: row.supply_line_bonus,
      icon: row.icon,
      color: row.color,
      name: row.name
    };
  }
}

export default new TerritoryModifierService();