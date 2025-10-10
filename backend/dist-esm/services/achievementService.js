import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { profileService } from './profileService.js';
class AchievementService {
    nameToId = new Map();
    async getAchievementIdByName(name) {
        if (this.nameToId.has(name))
            return this.nameToId.get(name) ?? null;
        try {
            const res = await query('SELECT id FROM achievements WHERE name = $1', [name]);
            const id = res.rows?.[0]?.id ?? null;
            if (id)
                this.nameToId.set(name, id);
            return id;
        }
        catch (e) {
            logger.warn('Failed to resolve achievement id by name', { name, error: e });
            return null;
        }
    }
    async unlockByName(userId, name) {
        const id = await this.getAchievementIdByName(name);
        if (!id)
            return;
        try {
            await profileService.unlockAchievement(userId, id);
        }
        catch (e) {
            logger.debug('Unlock achievement skipped', { userId, name, error: e });
        }
    }
    async handleGameCompleted(gameId, rankings) {
        if (!rankings || rankings.length === 0)
            return;
        try {
            const roomRes = await query('SELECT game_mode FROM game_rooms WHERE id = $1', [gameId]);
            const gameMode = (roomRes.rows?.[0]?.game_mode || 'normal').toLowerCase();
            const winners = rankings.filter((r) => r.isWinner);
            if (winners.length === 0)
                return;
            const others = rankings.filter((r) => !r.isWinner);
            const allOthersEliminated = others.length > 0 && others.every((r) => r.eliminated);
            for (const w of winners) {
                try {
                    const winsRes = await query('SELECT COUNT(*)::int AS count FROM player_game_results WHERE user_id = $1 AND is_winner = TRUE', [w.userId]);
                    const winCount = Number(winsRes.rows?.[0]?.count ?? 0);
                    if (winCount === 1) {
                        await this.unlockByName(w.userId, 'World Eater');
                    }
                }
                catch (e) {
                    logger.warn('Failed checking first win count', { userId: w.userId, error: e });
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
            logger.warn('Failed to evaluate achievements on game completion', { gameId, error: e });
        }
    }
}
export const achievementService = new AchievementService();
export default achievementService;
//# sourceMappingURL=achievementService.js.map