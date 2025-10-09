"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eloService = exports.EloService = exports.SKILL_TIERS = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
exports.SKILL_TIERS = [
    { name: 'Chieftain', minRating: 0, maxRating: 599, icon: '🛡️', color: '#8B4513' },
    { name: 'Warlord', minRating: 600, maxRating: 799, icon: '⚔️', color: '#DC143C' },
    { name: 'Raider King', minRating: 800, maxRating: 999, icon: '⚓', color: '#4682B4' },
    { name: 'Sultan', minRating: 1000, maxRating: 1199, icon: '☪️', color: '#228B22' },
    { name: 'Caesar', minRating: 1200, maxRating: 1399, icon: '🦅', color: '#FFD700' },
    { name: 'Khan', minRating: 1400, maxRating: 1599, icon: '🏹', color: '#FF8C00' },
    { name: 'Emperor', minRating: 1600, maxRating: 1799, icon: '👑', color: '#9370DB' },
    { name: 'The Great King', minRating: 1800, maxRating: 1999, icon: '☀️', color: '#FF6347' },
    { name: 'Overlord', minRating: 2000, maxRating: 2199, icon: '💀', color: '#2F4F4F' },
    { name: 'Worldbreaker', minRating: 2200, maxRating: 9999, icon: '☄️', color: '#8B0000' },
];
class EloService {
    calculateKFactor(gamesPlayed, currentRating, numberOfPlayers) {
        let baseK;
        if (gamesPlayed < 30) {
            baseK = 32;
        }
        else if (gamesPlayed < 100) {
            baseK = 24;
        }
        else {
            baseK = 16;
        }
        const playerAdjustment = numberOfPlayers / 4;
        const adjustedK = baseK * playerAdjustment;
        if (currentRating > 1800) {
            return adjustedK * 0.8;
        }
        if (currentRating > 1600) {
            return adjustedK * 0.9;
        }
        return adjustedK;
    }
    calculateExpectedScore(playerRating, opponentRatings) {
        const expectedScores = opponentRatings.map((opponentRating) => {
            const ratingDiff = (opponentRating - playerRating) / 400;
            return 1 / (1 + 10 ** ratingDiff);
        });
        return expectedScores.reduce((sum, score) => sum + score, 0) / expectedScores.length;
    }
    calculateActualScore(position, totalPlayers) {
        if (position === 1) {
            return 1.0;
        }
        const baseScore = (totalPlayers - position) / (totalPlayers - 1);
        if (position === 2) {
            return baseScore * 0.75;
        }
        if (position === 3) {
            return baseScore * 0.5;
        }
        return baseScore * 0.25;
    }
    calculateRatingChanges(players) {
        if (players.length < 3) {
            throw new Error('Ranked games require at least 3 players');
        }
        const changes = [];
        for (const player of players) {
            const opponentRatings = players
                .filter((p) => p.userId !== player.userId)
                .map((p) => p.currentRating);
            const kFactor = this.calculateKFactor(player.gamesPlayed, player.currentRating, players.length);
            const expectedScore = this.calculateExpectedScore(player.currentRating, opponentRatings);
            const actualScore = this.calculateActualScore(player.position, players.length);
            const ratingChange = Math.round(kFactor * (actualScore - expectedScore));
            const newRating = Math.max(0, player.currentRating + ratingChange);
            changes.push({
                userId: player.userId,
                oldRating: player.currentRating,
                newRating,
                change: ratingChange,
                expectedScore,
                actualScore,
                kFactor,
            });
        }
        return changes;
    }
    async applyRatingChanges(gameId, changes, client) {
        if (changes.length === 0)
            return;
        const persist = async (dbClient) => {
            await this.bulkInsertRatingHistory(dbClient, gameId, changes);
            await this.bulkUpdateUserRatings(dbClient, changes);
        };
        logger_js_1.logger.info('Persisting rating changes for ranked game', {
            gameId,
            players: changes.length,
            updates: changes.map((change) => ({
                userId: change.userId,
                oldRating: change.oldRating,
                newRating: change.newRating,
                delta: change.change,
            })),
        });
        try {
            if (client) {
                await persist(client);
            }
            else {
                await (0, database_js_1.transaction)(async (dbClient) => {
                    await persist(dbClient);
                });
            }
            logger_js_1.logger.info('Finished persisting rating changes for ranked game', {
                gameId,
            });
        }
        catch (error) {
            logger_js_1.logger.error('Failed to persist rating changes for ranked game', {
                gameId,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }
    async bulkInsertRatingHistory(client, gameId, changes) {
        if (changes.length === 0)
            return;
        const values = [];
        const placeholders = [];
        changes.forEach((change, index) => {
            const baseIndex = index * 6;
            placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`);
            values.push(change.userId, change.oldRating, change.newRating, change.change, gameId, 'match_completed');
        });
        await client.query(`
        INSERT INTO rating_history (
          user_id,
          old_rating,
          new_rating,
          rating_change,
          game_room_id,
          reason
        ) VALUES ${placeholders.join(', ')}
      `, values);
    }
    async bulkUpdateUserRatings(client, changes) {
        if (changes.length === 0)
            return;
        const ratingCases = [];
        const values = [];
        changes.forEach((change, index) => {
            const baseIndex = index * 2;
            ratingCases.push(`WHEN id = $${baseIndex + 1}::uuid THEN $${baseIndex + 2}::int`);
            values.push(change.userId, change.newRating);
        });
        const idPlaceholders = changes
            .map((_, index) => `$${changes.length * 2 + index + 1}::uuid`)
            .join(', ');
        values.push(...changes.map((change) => change.userId));
        await client.query(`
        UPDATE users SET
          skill_rating = CASE ${ratingCases.join(' ')} END,
          updated_at = NOW()
        WHERE id IN (${idPlaceholders})
      `, values);
    }
    getSkillTier(rating) {
        return (exports.SKILL_TIERS.find((tier) => rating >= tier.minRating && rating <= tier.maxRating) ||
            exports.SKILL_TIERS[0]);
    }
    canJoinRankedGame(playerRating, gameAvgRating, maxSkillGap = 500) {
        return Math.abs(playerRating - gameAvgRating) <= maxSkillGap;
    }
    async getRatingHistory(userId, limit = 30) {
        const result = await (0, database_js_1.query)(`
        SELECT *
        FROM rating_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, limit]);
        return result.rows;
    }
    async getLeaderboard(limit = 100, offset = 0) {
        const result = await (0, database_js_1.query)(`
        SELECT
          (entry.data ->> 'userId')::uuid AS user_id,
          entry.data ->> 'username' AS username,
          (entry.data ->> 'skillRating')::int AS skill_rating,
          (entry.data ->> 'rank')::int AS rank_position
        FROM skill_leaderboard_cache cache,
        LATERAL jsonb_array_elements(cache.rankings) WITH ORDINALITY AS entry(data, ord)
        WHERE cache.period_type = 'all_time'
        ORDER BY ord
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
        if ((result.rowCount ?? 0) > 0) {
            return result.rows;
        }
        const fallback = await (0, database_js_1.query)(`
        SELECT
          id as user_id,
          username,
          skill_rating,
          ROW_NUMBER() OVER (ORDER BY skill_rating DESC, created_at ASC) + $2 AS rank_position
        FROM users
        ORDER BY skill_rating DESC, created_at ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
        return fallback.rows;
    }
    async updateLeaderboardCache(client) {
        const executeQuery = async (sql, params) => {
            if (client) {
                const result = await client.query(sql, params);
                return {
                    rows: result.rows,
                    rowCount: result.rowCount ?? null,
                };
            }
            return (0, database_js_1.query)(sql, params);
        };
        const leaderboard = await executeQuery(`
        SELECT id as user_id, username, skill_rating,
               ROW_NUMBER() OVER (ORDER BY skill_rating DESC, created_at ASC) AS rank_position
        FROM users
        ORDER BY skill_rating DESC, created_at ASC
        LIMIT 100
      `);
        const rankings = leaderboard.rows.map((row) => ({
            userId: row.user_id,
            username: row.username,
            skillRating: row.skill_rating,
            rank: row.rank_position,
        }));
        await executeQuery(`
        INSERT INTO skill_leaderboard_cache (
          period_type,
          period_start,
          period_end,
          rankings,
          generated_at
        ) VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (period_type, period_start, period_end)
        DO UPDATE SET rankings = EXCLUDED.rankings, generated_at = EXCLUDED.generated_at
      `, ['all_time', '1970-01-01', '9999-12-31', JSON.stringify(rankings)]);
    }
}
exports.EloService = EloService;
exports.eloService = new EloService();
//# sourceMappingURL=eloService.js.map