import { query, transaction } from '../config/database.js';
import { logClanActivity } from './clanActivityService.js';
const OBJECTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_OBJECTIVE_POOL = [
    {
        objectiveType: 'earn_xp',
        targetValue: 5000,
        reward: { bonus_xp: 500 },
    },
    {
        objectiveType: 'play_matches',
        targetValue: 10,
        reward: { crest_tokens: 5 },
    },
    {
        objectiveType: 'win_matches',
        targetValue: 5,
        reward: { banner_fragment: 1 },
    },
    {
        objectiveType: 'earn_xp',
        targetValue: 8000,
        reward: { bonus_xp: 900, flair: 'radiant' },
    },
];
const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};
export class ClanProgressionServiceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
class ClanProgressionService {
    getLevelIncrement(level) {
        const base = 1000;
        const step = 500;
        return base + (level - 1) * step;
    }
    calculateLevelInternal(totalXp) {
        let level = 1;
        let currentFloor = 0;
        let nextLevelRequirement = this.getLevelIncrement(level);
        let nextLevelTotal = currentFloor + nextLevelRequirement;
        while (totalXp >= nextLevelTotal) {
            currentFloor = nextLevelTotal;
            level += 1;
            nextLevelRequirement = this.getLevelIncrement(level);
            nextLevelTotal = currentFloor + nextLevelRequirement;
        }
        const xpIntoLevel = totalXp - currentFloor;
        const xpToNextLevel = Math.max(nextLevelTotal - currentFloor, 1);
        const progressPercent = clamp(xpIntoLevel / xpToNextLevel, 0, 1);
        return {
            level,
            currentLevelXp: currentFloor,
            nextLevelXp: nextLevelTotal,
            xpIntoLevel,
            xpToNextLevel,
            progressPercent,
        };
    }
    mapProgression(clanId, totalXp) {
        const calculated = this.calculateLevelInternal(totalXp);
        return {
            clanId,
            totalXp,
            level: calculated.level,
            currentLevelXp: calculated.currentLevelXp,
            nextLevelXp: calculated.nextLevelXp,
            xpIntoLevel: calculated.xpIntoLevel,
            xpToNextLevel: calculated.xpToNextLevel,
            progressPercent: calculated.progressPercent,
        };
    }
    mapObjective(row) {
        return {
            id: row.id,
            clanId: row.clan_id,
            objectiveType: row.objective_type,
            targetValue: typeof row.target_value === 'string'
                ? Number.parseInt(row.target_value, 10)
                : Number(row.target_value),
            progressValue: typeof row.progress_value === 'string'
                ? Number.parseInt(row.progress_value, 10)
                : Number(row.progress_value),
            startAt: row.start_at,
            endAt: row.end_at,
            reward: typeof row.reward === 'string'
                ? JSON.parse(row.reward)
                : (row.reward ?? {}),
        };
    }
    async getProgressionRow(clanId, client) {
        const sql = 'SELECT total_xp, level FROM clans WHERE id = $1 FOR UPDATE';
        const result = client
            ? await client.query(sql, [clanId])
            : await query(sql, [clanId]);
        const rows = Array.isArray(result?.rows)
            ? result.rows
            : [];
        return rows[0] ?? null;
    }
    pickObjectiveTemplates(clanId, windowStart) {
        const seedSource = `${clanId}:${windowStart.toISOString()}`;
        let seed = 0;
        for (let index = 0; index < seedSource.length; index += 1) {
            seed = (seed * 31 + seedSource.charCodeAt(index)) % 10_000;
        }
        const weighted = DEFAULT_OBJECTIVE_POOL.map((template, index) => ({
            template,
            weight: (seed + index * 1373) % 10_000,
        }));
        weighted.sort((a, b) => a.weight - b.weight);
        return weighted.slice(0, 3).map((item) => item.template);
    }
    async getActiveObjectivesInternal(clanId, now, client, forUpdate = false) {
        const sql = `
      SELECT id, clan_id, objective_type, target_value, progress_value, start_at, end_at, reward
      FROM clan_objectives
      WHERE clan_id = $1 AND start_at <= $2 AND end_at >= $2
      ${forUpdate ? 'FOR UPDATE' : ''}
    `;
        const params = [clanId, now];
        const result = client
            ? await client.query(sql, params)
            : await query(sql, params);
        const rows = Array.isArray(result?.rows)
            ? result.rows
            : [];
        return rows;
    }
    getObjectiveWindow(now) {
        const start = new Date(now);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + OBJECTIVE_WINDOW_MS);
        return { start, end };
    }
    async getProgressionSummary(clanId) {
        const sql = 'SELECT total_xp FROM clans WHERE id = $1';
        const result = await query(sql, [clanId]);
        const row = result.rows[0];
        if (!row) {
            throw new ClanProgressionServiceError('CLAN_NOT_FOUND', 'Clan not found');
        }
        const totalXp = typeof row.total_xp === 'string' ? Number(row.total_xp) : Number(row.total_xp ?? 0);
        return this.mapProgression(clanId, totalXp);
    }
    async ensureWeeklyObjectives(clanId, now = new Date()) {
        return transaction(async (client) => {
            const active = await this.getActiveObjectivesInternal(clanId, now, client);
            if (active.length > 0) {
                return active.map((objective) => this.mapObjective(objective));
            }
            const { start, end } = this.getObjectiveWindow(now);
            const templates = this.pickObjectiveTemplates(clanId, start);
            const created = [];
            for (const template of templates) {
                const insertResult = client
                    ? await client.query(`
            INSERT INTO clan_objectives (
              clan_id,
              objective_type,
              target_value,
              progress_value,
              start_at,
              end_at,
              reward
            )
            VALUES ($1, $2, $3, 0, $4, $5, $6::jsonb)
            RETURNING id, clan_id, objective_type, target_value, progress_value, start_at, end_at, reward
          `, [
                        clanId,
                        template.objectiveType,
                        template.targetValue,
                        start,
                        end,
                        JSON.stringify(template.reward),
                    ])
                    : await query(`
            INSERT INTO clan_objectives (
              clan_id,
              objective_type,
              target_value,
              progress_value,
              start_at,
              end_at,
              reward
            )
            VALUES ($1, $2, $3, 0, $4, $5, $6::jsonb)
            RETURNING id, clan_id, objective_type, target_value, progress_value, start_at, end_at, reward
          `, [
                        clanId,
                        template.objectiveType,
                        template.targetValue,
                        start,
                        end,
                        JSON.stringify(template.reward),
                    ]);
                created.push(this.mapObjective(insertResult.rows[0]));
            }
            await logClanActivity({
                clanId,
                actionType: 'clan_objectives_rotated',
                metadata: {
                    count: created.length,
                    windowStart: start.toISOString(),
                    windowEnd: end.toISOString(),
                },
                client,
            });
            return created;
        });
    }
    async applyObjectiveProgress(clanId, { xpGain, matchesPlayed, matchesWon, now, client, }) {
        if (xpGain <= 0 && matchesPlayed <= 0 && matchesWon <= 0) {
            return [];
        }
        const objectives = await this.getActiveObjectivesInternal(clanId, now, client, true);
        if (objectives.length === 0) {
            return [];
        }
        const updates = [];
        for (const objective of objectives) {
            let delta = 0;
            if (objective.objective_type === 'earn_xp' && xpGain > 0) {
                delta = xpGain;
            }
            else if (objective.objective_type === 'play_matches' && matchesPlayed > 0) {
                delta = matchesPlayed;
            }
            else if (objective.objective_type === 'win_matches' && matchesWon > 0) {
                delta = matchesWon;
            }
            if (delta <= 0) {
                continue;
            }
            const currentProgress = typeof objective.progress_value === 'string'
                ? Number.parseInt(objective.progress_value, 10)
                : Number(objective.progress_value);
            const targetValue = typeof objective.target_value === 'string'
                ? Number.parseInt(objective.target_value, 10)
                : Number(objective.target_value);
            const newProgress = Math.min(currentProgress + delta, targetValue);
            const completed = currentProgress < targetValue && newProgress >= targetValue;
            if (client) {
                await client.query('UPDATE clan_objectives SET progress_value = $1 WHERE id = $2', [
                    newProgress,
                    objective.id,
                ]);
            }
            else {
                await query('UPDATE clan_objectives SET progress_value = $1 WHERE id = $2', [
                    newProgress,
                    objective.id,
                ]);
            }
            updates.push({ objectiveId: objective.id, progressValue: newProgress, completed });
            if (completed) {
                await logClanActivity({
                    clanId,
                    actionType: 'clan_objective_completed',
                    targetId: objective.id,
                    metadata: { objectiveType: objective.objective_type },
                    client,
                });
            }
        }
        return updates;
    }
    async awardContribution(options) {
        const now = options.now ?? new Date();
        const xpGain = Math.max(0, Math.floor(options.xp));
        const matchesPlayed = Math.max(0, options.matchesPlayed ?? 0);
        const matchesWon = Math.max(0, options.matchesWon ?? 0);
        return transaction(async (client) => {
            const progressionRow = await this.getProgressionRow(options.clanId, client);
            if (!progressionRow) {
                throw new ClanProgressionServiceError('CLAN_NOT_FOUND', 'Clan not found');
            }
            const memberResult = client
                ? await client.query(`SELECT id, status FROM clan_members WHERE clan_id = $1 AND user_id = $2 FOR UPDATE`, [options.clanId, options.userId])
                : await query(`SELECT id, status FROM clan_members WHERE clan_id = $1 AND user_id = $2 FOR UPDATE`, [options.clanId, options.userId]);
            const memberRow = memberResult.rows[0];
            if (!memberRow || memberRow.status !== 'active') {
                throw new ClanProgressionServiceError('MEMBER_NOT_ACTIVE', 'User is not an active clan member');
            }
            if (xpGain > 0 || matchesPlayed > 0) {
                if (client) {
                    await client.query(`
            UPDATE clan_members
            SET contribution_xp = contribution_xp + $1,
                contribution_matches = contribution_matches + $2,
                last_active_at = $3
            WHERE id = $4
          `, [xpGain, matchesPlayed, now, memberRow.id]);
                }
                else {
                    await query(`
            UPDATE clan_members
            SET contribution_xp = contribution_xp + $1,
                contribution_matches = contribution_matches + $2,
                last_active_at = $3
            WHERE id = $4
          `, [xpGain, matchesPlayed, now, memberRow.id]);
                }
            }
            const currentTotalXp = typeof progressionRow.total_xp === 'string'
                ? Number.parseInt(progressionRow.total_xp, 10)
                : Number(progressionRow.total_xp ?? 0);
            const newTotalXp = currentTotalXp + xpGain;
            const calculated = this.calculateLevelInternal(newTotalXp);
            if (xpGain > 0) {
                if (client) {
                    await client.query('UPDATE clans SET total_xp = $1, level = $2 WHERE id = $3', [
                        newTotalXp,
                        calculated.level,
                        options.clanId,
                    ]);
                }
                else {
                    await query('UPDATE clans SET total_xp = $1, level = $2 WHERE id = $3', [
                        newTotalXp,
                        calculated.level,
                        options.clanId,
                    ]);
                }
            }
            const objectiveUpdates = await this.applyObjectiveProgress(options.clanId, {
                xpGain,
                matchesPlayed,
                matchesWon,
                now,
                client,
            });
            if (xpGain > 0) {
                await logClanActivity({
                    clanId: options.clanId,
                    actorUserId: options.actorUserId ?? options.userId,
                    actionType: 'clan_xp_awarded',
                    metadata: {
                        amount: xpGain,
                        source: options.source ?? 'unspecified',
                        matchesPlayed,
                        ...(options.metadata ?? {}),
                    },
                    client,
                });
            }
            const previousLevel = typeof progressionRow.level === 'string'
                ? Number.parseInt(progressionRow.level, 10)
                : Number(progressionRow.level ?? 1);
            const leveledUp = calculated.level > previousLevel;
            if (leveledUp) {
                await logClanActivity({
                    clanId: options.clanId,
                    actionType: 'clan_level_up',
                    metadata: { fromLevel: previousLevel, toLevel: calculated.level },
                    client,
                });
            }
            return {
                clanId: options.clanId,
                totalXp: newTotalXp,
                level: calculated.level,
                leveledUp,
                progression: this.mapProgression(options.clanId, newTotalXp),
                objectiveUpdates,
            };
        });
    }
}
export const clanProgressionService = new ClanProgressionService();
//# sourceMappingURL=clanProgressionService.js.map