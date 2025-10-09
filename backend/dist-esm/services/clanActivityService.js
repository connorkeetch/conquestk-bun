"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logClanActivity = logClanActivity;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
async function logClanActivity({ clanId, actorUserId, actionType, metadata, targetId, client, }) {
    try {
        const params = [
            clanId,
            actorUserId ?? null,
            actionType,
            metadata ? JSON.stringify(metadata) : '{}',
            targetId ?? null,
        ];
        const sql = `
      INSERT INTO clan_activity_log (clan_id, actor_user_id, action_type, metadata, target_id)
      VALUES ($1, $2, $3, $4::jsonb, $5)
    `;
        if (client) {
            await client.query(sql, params);
        }
        else {
            await (0, database_js_1.query)(sql, params);
        }
    }
    catch (error) {
        logger_js_1.logger.warn('Failed to append clan activity', {
            clanId,
            actionType,
            error,
        });
    }
}
//# sourceMappingURL=clanActivityService.js.map