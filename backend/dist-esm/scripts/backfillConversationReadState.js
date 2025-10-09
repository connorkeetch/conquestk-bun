"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const DRY_RUN = process.argv.includes('--dry-run');
async function fetchRowsNeedingUpdate() {
    const result = await (0, database_js_1.query)(`
    SELECT
      cm.id,
      cm.conversation_id,
      cm.user_id,
      cm.last_read_message_id,
      cm.last_read_at,
      last_msg.id AS last_message_id,
      last_msg.created_at AS last_message_created_at
    FROM conversation_members cm
    JOIN LATERAL (
      SELECT id, created_at
      FROM conversation_messages m
      WHERE m.conversation_id = cm.conversation_id
      ORDER BY created_at DESC
      LIMIT 1
    ) last_msg ON TRUE
    WHERE last_msg.id IS NOT NULL
      AND (cm.last_read_message_id IS NULL OR cm.last_read_at IS NULL)
  `);
    return result.rows;
}
async function run() {
    logger_js_1.logger.info('Starting conversation read-state backfill', { dryRun: DRY_RUN });
    const rows = await fetchRowsNeedingUpdate();
    if (rows.length === 0) {
        logger_js_1.logger.info('No conversation members require backfill');
        return;
    }
    if (DRY_RUN) {
        logger_js_1.logger.info('Dry run complete', { rowsNeedingUpdate: rows.length });
        return;
    }
    const updateResult = await (0, database_js_1.query)(`
    UPDATE conversation_members cm
    SET
      last_read_message_id = src.last_message_id,
      last_read_at = src.last_message_created_at,
      updated_at = NOW()
    FROM (
      SELECT
        cm.id,
        last_msg.id AS last_message_id,
        last_msg.created_at AS last_message_created_at
      FROM conversation_members cm
      JOIN LATERAL (
        SELECT id, created_at
        FROM conversation_messages m
        WHERE m.conversation_id = cm.conversation_id
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      WHERE (cm.last_read_message_id IS NULL OR cm.last_read_at IS NULL)
    ) src
    WHERE cm.id = src.id
  `);
    logger_js_1.logger.info('Conversation read-state backfill complete', {
        rowsEvaluated: rows.length,
        rowsUpdated: updateResult.rowCount ?? rows.length,
    });
}
run()
    .then(() => {
    logger_js_1.logger.info('Backfill finished successfully');
    process.exit(0);
})
    .catch((error) => {
    logger_js_1.logger.error('Backfill failed', { error });
    process.exit(1);
});
//# sourceMappingURL=backfillConversationReadState.js.map