"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlock = createBlock;
exports.removeBlock = removeBlock;
exports.isBlocked = isBlocked;
exports.getBlocksForUser = getBlocksForUser;
exports.getBlockRecords = getBlockRecords;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const mapRow = (row) => ({
    id: row.id,
    blockerId: row.blocker_id,
    blockedId: row.blocked_id,
    createdAt: row.created_at,
});
async function createBlock(blockerId, blockedId) {
    if (blockerId === blockedId) {
        throw new Error('Cannot block yourself');
    }
    try {
        const insertResult = await (0, database_js_1.query)(`
      INSERT INTO user_blocks (blocker_id, blocked_id)
      VALUES ($1, $2)
      ON CONFLICT (blocker_id, blocked_id) DO UPDATE
      SET blocker_id = EXCLUDED.blocker_id
      RETURNING *
    `, [blockerId, blockedId]);
        if (insertResult.rows.length > 0) {
            return mapRow(insertResult.rows[0]);
        }
        const existingResult = await (0, database_js_1.query)('SELECT * FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
        if (existingResult.rows.length === 0) {
            throw new Error('Failed to create block');
        }
        return mapRow(existingResult.rows[0]);
    }
    catch (error) {
        logger_js_1.logger.error('Failed to create user block', { blockerId, blockedId, error });
        throw error;
    }
}
async function removeBlock(blockerId, blockedId) {
    try {
        const result = await (0, database_js_1.query)('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id', [blockerId, blockedId]);
        return (result.rowCount ?? 0) > 0;
    }
    catch (error) {
        logger_js_1.logger.error('Failed to remove user block', { blockerId, blockedId, error });
        throw error;
    }
}
async function isBlocked(userA, userB) {
    try {
        const result = await (0, database_js_1.query)(`
      SELECT 1
      FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1
    `, [userA, userB]);
        return (result.rowCount ?? 0) > 0;
    }
    catch (error) {
        logger_js_1.logger.error('Failed to check block status', { userA, userB, error });
        throw error;
    }
}
async function getBlocksForUser(userId) {
    try {
        const result = await (0, database_js_1.query)(`
      SELECT *
      FROM user_blocks
      WHERE blocker_id = $1
      ORDER BY created_at DESC
    `, [userId]);
        return result.rows.map(mapRow);
    }
    catch (error) {
        logger_js_1.logger.error('Failed to fetch user blocks', { userId, error });
        throw error;
    }
}
async function getBlockRecords(options) {
    const { limit = 100, offset = 0, blockerId, blockedId } = options;
    const conditions = [];
    const params = [];
    if (blockerId) {
        params.push(blockerId);
        conditions.push(`blocker_id = $${params.length}`);
    }
    if (blockedId) {
        params.push(blockedId);
        conditions.push(`blocked_id = $${params.length}`);
    }
    params.push(limit);
    const limitPosition = params.length;
    params.push(offset);
    const offsetPosition = params.length;
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
        const result = await (0, database_js_1.query)(`
      SELECT *
      FROM user_blocks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitPosition}
      OFFSET $${offsetPosition}
    `, params);
        return result.rows.map(mapRow);
    }
    catch (error) {
        logger_js_1.logger.error('Failed to fetch block records', { options, error });
        throw error;
    }
}
//# sourceMappingURL=userBlockService.js.map