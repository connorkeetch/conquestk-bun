"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_readline_1 = __importDefault(require("node:readline"));
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
function parseFilters() {
    const getArg = (flag) => {
        const idx = process.argv.indexOf(flag);
        return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
    };
    const idsArg = getArg('--ids');
    const nameLike = getArg('--name-like');
    const statusInArg = getArg('--status-in');
    const createdBefore = getArg('--created-before');
    const createdAfter = getArg('--created-after');
    return {
        ids: idsArg
            ? idsArg
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        nameLike,
        statusIn: statusInArg
            ? statusInArg
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        createdBefore,
        createdAfter,
    };
}
function hasAnyFilter(f) {
    return Boolean(f.ids?.length || f.nameLike || f.statusIn?.length || f.createdAfter || f.createdBefore);
}
async function promptConfirm(message) {
    if (process.argv.includes('--yes') || process.argv.includes('-y'))
        return true;
    const rl = node_readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question(`${message} (yes/no): `, (ans) => resolve(ans.trim().toLowerCase())));
    rl.close();
    return answer === 'y' || answer === 'yes';
}
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const filters = parseFilters();
    logger_js_1.logger.warn(`Wipe Games Script starting${dryRun ? ' (dry-run)' : ''}${hasAnyFilter(filters) ? ' (filtered)' : ''}`);
    const client = await (0, database_js_1.getClient)();
    try {
        await client.query('BEGIN');
        let idSelectionSQL = 'SELECT id FROM game_rooms';
        const conds = [];
        const params = [];
        if (filters.ids && filters.ids.length > 0) {
            const placeholders = filters.ids.map((_id, i) => `$${params.length + i + 1}`).join(',');
            conds.push(`id IN (${placeholders})`);
            params.push(...filters.ids);
        }
        if (filters.nameLike) {
            conds.push(`name ILIKE $${params.length + 1}`);
            params.push(filters.nameLike);
        }
        if (filters.statusIn && filters.statusIn.length > 0) {
            conds.push(`status = ANY($${params.length + 1})`);
            params.push(filters.statusIn);
        }
        if (filters.createdBefore) {
            conds.push(`created_at < $${params.length + 1}`);
            params.push(filters.createdBefore);
        }
        if (filters.createdAfter) {
            conds.push(`created_at > $${params.length + 1}`);
            params.push(filters.createdAfter);
        }
        if (conds.length > 0) {
            idSelectionSQL += ` WHERE ${conds.join(' AND ')}`;
        }
        const targetRes = await client.query(idSelectionSQL, params);
        const targetIds = targetRes.rows.map((r) => r.id);
        const gameRoomCount = targetIds.length;
        if (gameRoomCount === 0) {
            logger_js_1.logger.info('No game rooms found; nothing to delete');
            await client.query('ROLLBACK');
            return;
        }
        logger_js_1.logger.warn(`Found ${gameRoomCount} game room(s) to delete`);
        logger_js_1.logger.debug(`Target IDs: ${targetIds.join(', ')}`);
        if (!(await promptConfirm('This will permanently delete ALL games and related data. Proceed?'))) {
            await client.query('ROLLBACK');
            logger_js_1.logger.info('Aborted by user');
            return;
        }
        if (dryRun) {
            const tablesToCheck = [
                'room_players',
                'game_states',
                'game_moves',
                'game_move_archive',
                'game_results',
                'game_territory_modifiers',
                'capital_eliminations',
                'rating_history',
            ];
            for (const t of tablesToCheck) {
                const res = await client.query(`SELECT COUNT(*)::int as count FROM ${t} WHERE (
             ($1::text = 'room_players' AND room_id = ANY($2)) OR
             ($1::text = 'game_states' AND room_id = ANY($2)) OR
             ($1::text = 'game_moves' AND room_id = ANY($2)) OR
             ($1::text = 'game_move_archive' AND room_id = ANY($2)) OR
             ($1::text = 'game_results' AND room_id = ANY($2)) OR
             ($1::text = 'game_territory_modifiers' AND game_id = ANY($2)) OR
             ($1::text = 'capital_eliminations' AND game_id = ANY($2)) OR
             ($1::text = 'rating_history' AND game_room_id = ANY($2))
           )`, [t, targetIds]);
                logger_js_1.logger.info(`${t}: ~${res.rows[0]?.count ?? 0} row(s) associated`);
            }
            await client.query('ROLLBACK');
            logger_js_1.logger.info('Dry-run complete; no changes applied');
            return;
        }
        const steps = [
            {
                label: 'Null conversations.game_id references',
                sql: `UPDATE conversations SET game_id = NULL WHERE game_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Null clan_war_matches.game_id references',
                sql: `UPDATE clan_war_matches SET game_id = NULL WHERE game_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete rating_history rows',
                sql: `DELETE FROM rating_history WHERE game_room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete capital_eliminations',
                sql: `DELETE FROM capital_eliminations WHERE game_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_territory_modifiers',
                sql: `DELETE FROM game_territory_modifiers WHERE game_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_moves',
                sql: `DELETE FROM game_moves WHERE room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_move_archive',
                sql: `DELETE FROM game_move_archive WHERE room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_results',
                sql: `DELETE FROM game_results WHERE room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_states',
                sql: `DELETE FROM game_states WHERE room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete room_players',
                sql: `DELETE FROM room_players WHERE room_id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Delete game_rooms',
                sql: `DELETE FROM game_rooms WHERE id = ANY($1)`,
                params: [targetIds],
            },
            {
                label: 'Reset game_room_code_seq (if present)',
                sql: `DO $$ BEGIN IF EXISTS (
                SELECT 1 FROM information_schema.sequences 
                WHERE sequence_schema='public' AND sequence_name='game_room_code_seq'
              ) THEN
                EXECUTE 'ALTER SEQUENCE public.game_room_code_seq RESTART WITH 1';
              END IF; END $$;`,
            },
        ];
        const results = [];
        for (const step of steps) {
            try {
                const res = await client.query(step.sql, step.params ?? []);
                results.push({ label: step.label, affected: res.rowCount ?? null });
            }
            catch (err) {
                results.push({ label: `${step.label} (skipped/error)`, affected: null });
                logger_js_1.logger.warn(`Step failed or skipped: ${step.label}`, {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        await client.query('COMMIT');
        logger_js_1.logger.info('Wipe complete. Summary:');
        for (const r of results) {
            logger_js_1.logger.info(`- ${r.label}: ${r.affected ?? 'n/a'}`);
        }
    }
    catch (error) {
        await client.query('ROLLBACK');
        logger_js_1.logger.error('Wipe games failed; rolled back', error);
        process.exitCode = 1;
    }
    finally {
        client.release();
    }
}
main().catch((e) => {
    logger_js_1.logger.error('Fatal error in wipeGames script', e);
    process.exit(1);
});
//# sourceMappingURL=wipeGames.js.map