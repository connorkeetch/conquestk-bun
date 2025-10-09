"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const achievementService_js_1 = __importDefault(require("../services/achievementService.js"));
const profileService_js_1 = require("../services/profileService.js");
const logger_js_1 = require("../utils/logger.js");
async function ensureUsers() {
    const existing = await (0, database_js_1.query)(`SELECT id, username FROM users WHERE username IN ('player1','player2')`);
    const map = new Map(existing.rows.map((r) => [r.username, r.id]));
    async function create(username, email, passwordHash) {
        const res = await (0, database_js_1.query)(`INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`, [username, email, passwordHash]);
        return res.rows[0].id;
    }
    const dummyHash = '$2a$10$CVM2rB8F/p86p2s2mQtQeuZyGgfcx7jYkYoRHGOLfaHM8r7yqXo/m';
    const p1Id = map.get('player1') || (await create('player1', 'player1@example.com', dummyHash));
    const p2Id = map.get('player2') || (await create('player2', 'player2@example.com', dummyHash));
    return { p1: { id: p1Id }, p2: { id: p2Id } };
}
async function insertResult(gameId, gameMode, winnerId, loserId, dominated) {
    await (0, database_js_1.query)(`INSERT INTO game_rooms (id, name, host_id, map_id, game_mode, status, started_at, ended_at, winner_id, turn_timer)
     SELECT $1, $2, $3, m.id, $4, 'completed', NOW() - INTERVAL '5 minutes', NOW(), $3, 86400
     FROM maps m
     ORDER BY m.created_at ASC
     LIMIT 1
     ON CONFLICT (id) DO NOTHING`, [gameId, `${gameMode}-test`, winnerId, gameMode]);
    await (0, database_js_1.query)(`INSERT INTO game_results (room_id, map_id, winner_id, duration_seconds, total_turns, final_state, player_summary, battle_log)
     SELECT $1, m.id, $2, 300, 10, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb
     FROM maps m
     ORDER BY m.created_at ASC
     LIMIT 1
     ON CONFLICT (room_id) DO NOTHING`, [gameId, winnerId]);
    await (0, database_js_1.query)(`INSERT INTO player_game_results (
       room_id, user_id, position, is_winner, eliminated, territories, armies, elimination_order, rating_before, rating_after, rating_change
     ) VALUES 
       ($1, $2, 1, TRUE, FALSE, 20, 100, NULL, 1000, 1010, 10),
       ($1, $3, 2, FALSE, $4, 0, 10, 1, 1000, 990, -10)
     ON CONFLICT (room_id, user_id) DO NOTHING`, [gameId, winnerId, loserId, dominated]);
}
async function simulate() {
    await (0, database_js_1.initDatabase)();
    const { p1, p2 } = await ensureUsers();
    const normalGameId = (0, uuid_1.v4)();
    await insertResult(normalGameId, 'classic', p1.id, p2.id, true);
    await achievementService_js_1.default.handleGameCompleted(normalGameId, [
        { userId: p1.id, isWinner: true, eliminated: false },
        { userId: p2.id, isWinner: false, eliminated: true },
    ]);
    const capitalsGameId = (0, uuid_1.v4)();
    await insertResult(capitalsGameId, 'capital', p1.id, p2.id, false);
    await achievementService_js_1.default.handleGameCompleted(capitalsGameId, [
        { userId: p1.id, isWinner: true, eliminated: false },
        { userId: p2.id, isWinner: false, eliminated: false },
    ]);
    const { unlocked } = await profileService_js_1.profileService.getAchievements(p1.id);
    const names = unlocked.map((u) => u.name ?? 'unknown');
    logger_js_1.logger.info('Unlocked achievements for player1:', { names });
}
simulate()
    .then(() => process.exit(0))
    .catch((e) => {
    logger_js_1.logger.error('Simulation failed', e);
    process.exit(1);
});
//# sourceMappingURL=simulateAchievements.js.map