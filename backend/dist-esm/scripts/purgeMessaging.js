"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
async function tableExists(table) {
    const result = await (0, database_js_1.query)(`SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`, [table]);
    return Number(result.rows[0]?.count ?? 0) > 0;
}
async function countRows(table) {
    const exists = await tableExists(table);
    if (!exists)
        return 0;
    const result = await (0, database_js_1.query)(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
    return Number(result.rows[0]?.count ?? 0);
}
async function purge({ includeUserBlocks }) {
    const hasConversations = await tableExists('conversations');
    const hasClanChat = await tableExists('clan_chat_messages');
    const hasUserBlocks = includeUserBlocks && (await tableExists('user_blocks'));
    const tablesToTruncate = [];
    if (hasConversations)
        tablesToTruncate.push('conversations');
    if (hasClanChat)
        tablesToTruncate.push('clan_chat_messages');
    if (hasUserBlocks)
        tablesToTruncate.push('user_blocks');
    if (tablesToTruncate.length === 0) {
        logger_js_1.logger.warn('No messaging tables found to truncate');
        return;
    }
    const sql = `TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE`;
    logger_js_1.logger.info('Executing purge:', { sql });
    await (0, database_js_1.query)(sql);
    logger_js_1.logger.info('Purge complete');
}
function parseArgs() {
    const args = new Set(process.argv.slice(2));
    return {
        yes: args.has('--yes') || args.has('-y'),
        dryRun: args.has('--dry-run') || args.has('-n'),
        includeUserBlocks: args.has('--include-user-blocks'),
    };
}
async function main() {
    const { yes, dryRun, includeUserBlocks } = parseArgs();
    const before = {
        conversations: await countRows('conversations'),
        conversation_messages: await countRows('conversation_messages'),
        conversation_members: await countRows('conversation_members'),
        clan_chat_messages: await countRows('clan_chat_messages'),
        user_blocks: includeUserBlocks ? await countRows('user_blocks') : undefined,
    };
    logger_js_1.logger.info('Current messaging row counts', before);
    if (dryRun || !yes) {
        logger_js_1.logger.warn('Dry run or confirmation missing. Pass --yes to execute, and optionally --include-user-blocks to wipe block lists.');
        return;
    }
    await purge({ includeUserBlocks });
    const after = {
        conversations: await countRows('conversations'),
        conversation_messages: await countRows('conversation_messages'),
        conversation_members: await countRows('conversation_members'),
        clan_chat_messages: await countRows('clan_chat_messages'),
        user_blocks: includeUserBlocks ? await countRows('user_blocks') : undefined,
    };
    logger_js_1.logger.info('Post-purge messaging row counts', after);
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
    logger_js_1.logger.error('purgeMessaging failed', { error });
    process.exit(1);
});
//# sourceMappingURL=purgeMessaging.js.map