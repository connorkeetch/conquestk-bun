"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerritoryModifierService = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const cacheService_js_1 = require("./cacheService.js");
class TerritoryModifierService {
    async getModifierTemplates() {
        let templates = (await cacheService_js_1.territoryModifierCache.getTemplates());
        if (templates) {
            return templates;
        }
        const result = await (0, database_js_1.query)('SELECT * FROM territory_modifier_templates ORDER BY name');
        templates = result.rows;
        await cacheService_js_1.territoryModifierCache.setTemplates(templates);
        return templates;
    }
    async getMapModifiers(mapId) {
        let modifiers = (await cacheService_js_1.territoryModifierCache.getMapModifiers(mapId));
        if (modifiers) {
            return modifiers;
        }
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
    `;
        const result = await (0, database_js_1.query)(sql, [mapId]);
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
        }));
        await cacheService_js_1.territoryModifierCache.setMapModifiers(mapId, modifiers);
        return modifiers;
    }
    async initializeGameModifiers(gameId, mapId, _territories) {
        try {
            const mapModifiers = await this.getMapModifiers(mapId);
            if (mapModifiers.length > 0) {
                await this.applyMapModifiers(gameId, mapModifiers);
            }
            else {
                logger_js_1.logger.info(`No territory modifiers applied for game ${gameId}`);
                return;
            }
            logger_js_1.logger.info(`Initialized territory modifiers for game ${gameId} from map definitions`);
        }
        catch (error) {
            logger_js_1.logger.error('Failed to initialize game modifiers:', error);
            throw error;
        }
    }
    async applyMapModifiers(gameId, mapModifiers) {
        if (mapModifiers.length === 0)
            return;
        const values = [];
        const placeholders = [];
        mapModifiers.forEach((modifier, index) => {
            const baseIndex = index * 10;
            placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10})`);
            values.push(gameId, modifier.territory_id, modifier.defense_bonus, modifier.attack_bonus, modifier.troop_generation_bonus, modifier.movement_restriction, modifier.supply_line_bonus, modifier.icon, modifier.color, modifier.name);
        });
        const sql = `
      INSERT INTO game_territory_modifiers (
        game_id, territory_id, defense_bonus, attack_bonus, 
        troop_generation_bonus, movement_restriction, supply_line_bonus,
        icon, color, name
      ) VALUES ${placeholders.join(', ')}
    `;
        await (0, database_js_1.query)(sql, values);
        logger_js_1.logger.info(`Batch inserted ${mapModifiers.length} map modifiers for game ${gameId}`);
    }
    async getGameModifiers(gameId) {
        const cachedModifiers = await cacheService_js_1.territoryModifierCache.getGameModifiers(gameId);
        if (cachedModifiers) {
            const modifierMap = new Map();
            for (const [territoryId, modifier] of Object.entries(cachedModifiers)) {
                modifierMap.set(territoryId, modifier);
            }
            return modifierMap;
        }
        const sql = `
      SELECT * FROM game_territory_modifiers 
      WHERE game_id = $1
    `;
        const result = await (0, database_js_1.query)(sql, [gameId]);
        const modifierMap = new Map();
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
            });
        }
        await cacheService_js_1.territoryModifierCache.setGameModifiers(gameId, modifierMap);
        return modifierMap;
    }
    async getTerritoryModifier(gameId, territoryId) {
        const allModifiers = await this.getGameModifiers(gameId);
        return allModifiers.get(territoryId) || null;
    }
    async cleanupFinishedGameModifiers(gameIds) {
        if (gameIds.length === 0)
            return;
        for (const gameId of gameIds) {
            await cacheService_js_1.territoryModifierCache.removeGameModifiers(gameId);
        }
        const placeholders = gameIds.map((_, index) => `$${index + 1}`).join(', ');
        const sql = `DELETE FROM game_territory_modifiers WHERE game_id IN (${placeholders})`;
        await (0, database_js_1.query)(sql, gameIds);
        logger_js_1.logger.info(`Cleaned up territory modifiers for ${gameIds.length} finished games`);
    }
}
exports.TerritoryModifierService = TerritoryModifierService;
exports.default = new TerritoryModifierService();
//# sourceMappingURL=territoryModifierService.js.map