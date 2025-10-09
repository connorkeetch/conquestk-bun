"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_js_1 = require("../utils/logger.js");
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '.env') });
const parseArgs = () => {
    const opts = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--old' && args[i + 1])
            opts.old = args[++i];
        else if (a === '--new' && args[i + 1])
            opts.new = args[++i];
        else if (a === '--dry')
            opts.dry = true;
        else if (a === '--tables' && args[i + 1])
            opts.tables = args[++i]
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t === 'maps' || t === 'map_drafts');
    }
    return opts;
};
async function run() {
    const opts = parseArgs();
    const { query } = (await import('../config/database.js'));
    const endpoint = process.env.ASSET_ENDPOINT?.replace(/\/$/, '');
    const bucket = process.env.ASSET_BUCKET?.replace(/\/$/, '');
    const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '');
    const oldPrefix = (opts.old || (endpoint && bucket ? `${endpoint}/${bucket}` : '')).replace(/\/$/, '');
    const newPrefix = (opts.new || publicBase || '').replace(/\/$/, '');
    if (!oldPrefix || !newPrefix) {
        logger_js_1.logger.error('Missing prefixes. Provide --old and --new, or set ASSET_ENDPOINT/ASSET_BUCKET and PUBLIC_ASSET_BASE_URL in .env');
        process.exit(1);
    }
    const tables = opts.tables && opts.tables.length > 0 ? opts.tables : ['maps', 'map_drafts'];
    for (const table of tables) {
        const where = `${table}.image_url LIKE $1`;
        const like = `${oldPrefix}/%`;
        const countResult = await query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, [like]);
        const total = parseInt(countResult.rows[0]?.total || '0', 10);
        if (total === 0) {
            logger_js_1.logger.info(`No rows to update in ${table}`);
            continue;
        }
        logger_js_1.logger.info(`Preparing to update ${total} row(s) in ${table}`);
        if (opts.dry) {
            logger_js_1.logger.info(`DRY RUN: Skipping update in ${table}`);
            continue;
        }
        const update = await query(`UPDATE ${table} SET image_url = REPLACE(image_url, $1, $2) WHERE image_url LIKE $3`, [oldPrefix, newPrefix, like]);
        logger_js_1.logger.info(`Updated ${update.rowCount || 0} row(s) in ${table}`);
    }
}
run()
    .then(() => process.exit(0))
    .catch((err) => {
    logger_js_1.logger.error('Error fixing image URLs', err);
    process.exit(1);
});
//# sourceMappingURL=fixMapImageUrls.js.map