"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.achievementService = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const profileService_js_1 = require("./profileService.js");
class AchievementService {
    constructor() {
        this.nameToId = new Map();
    }
    async getAchievementIdByName(name) {
        if (this.nameToId.has(name))
            return this.nameToId.get(name) ?? null;
        try {
            const res = await (0, database_js_1.query)('SELECT id FROM achievements WHERE name = $1', [name]);
            const id = res.rows?.[0]?.id ?? null;
            if (id)
                this.nameToId.set(name, id);
            return id;
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to resolve achievement id by name', { name, error: e });
            return null;
        }
    }
    async unlockByName(userId, name) {
        const id = await this.getAchievementIdByName(name);
        if (!id)
            return;
        try {
            await profileService_js_1.profileService.unlockAchievement(userId, id);
        }
        catch (e) {
            logger_js_1.logger.debug('Unlock achievement skipped', { userId, name, error: e });
        }
    }
    async handleGameCompleted(gameId, rankings) {
        if (!rankings || rankings.length === 0)
            return;
        try {
            const roomRes = await (0, database_js_1.query)('SELECT game_mode FROM game_rooms WHERE id = $1', [gameId]);
            const gameMode = (roomRes.rows?.[0]?.game_mode || 'normal').toLowerCase();
            const winners = rankings.filter((r) => r.isWinner);
            if (winners.length === 0)
                return;
            const others = rankings.filter((r) => !r.isWinner);
            const allOthersEliminated = others.length > 0 && others.every((r) => r.eliminated);
            for (const w of winners) {
                try {
                    const winsRes = await (0, database_js_1.query)('SELECT COUNT(*)::int AS count FROM player_game_results WHERE user_id = $1 AND is_winner = TRUE', [w.userId]);
                    const winCount = Number(winsRes.rows?.[0]?.count ?? 0);
                    if (winCount === 1) {
                        await this.unlockByName(w.userId, 'World Eater');
                    }
                }
                catch (e) {
                    logger_js_1.logger.warn('Failed checking first win count', { userId: w.userId, error: e });
                }
                if (gameMode === 'capitals' || gameMode === 'capital') {
                    await this.unlockByName(w.userId, 'Crown Jewel');
                }
                if ((gameMode === 'normal' ||
                    gameMode === 'classic' ||
                    gameMode === '' ||
                    gameMode === 'standard') &&
                    allOthersEliminated) {
                    await this.unlockByName(w.userId, 'Classic Conqueror');
                }
            }
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to evaluate achievements on game completion', { gameId, error: e });
        }
    }
}
exports.achievementService = new AchievementService();
exports.default = exports.achievementService;
//# sourceMappingURL=achievementService.js.map