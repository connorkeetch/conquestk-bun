"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_readline_1 = __importDefault(require("node:readline"));
const redis_js_1 = require("../config/redis.js");
const logger_js_1 = require("../utils/logger.js");
async function promptConfirm(message) {
    if (process.argv.includes('--yes') || process.argv.includes('-y'))
        return true;
    const rl = node_readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question(`${message} (yes/no): `, (ans) => resolve(ans.trim().toLowerCase())));
    rl.close();
    return answer === 'y' || answer === 'yes';
}
function parsePrefixes() {
    const idx = process.argv.indexOf('--prefixes');
    if (idx >= 0 && process.argv[idx + 1]) {
        return process.argv[idx + 1]
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
    }
    return ['game:state:', 'territory_modifiers:game:', 'room:treasure-config:', 'lock:game:ready:'];
}
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const prefixes = parsePrefixes();
    await (0, redis_js_1.initializeRedis)();
    const redis = (0, redis_js_1.getRedisClient)();
    if (!redis) {
        logger_js_1.logger.warn('Redis client not configured; nothing to clean');
        return;
    }
    logger_js_1.logger.warn(`Wipe Redis (game-related) starting${dryRun ? ' (dry-run)' : ''}`);
    logger_js_1.logger.info(`Prefixes: ${prefixes.join(', ')}`);
    const plan = [];
    for (const prefix of prefixes) {
        const keys = await redis.keys(`${prefix}*`);
        plan.push({ prefix, keys });
    }
    const total = plan.reduce((sum, p) => sum + p.keys.length, 0);
    logger_js_1.logger.info(`Found ${total} key(s) across ${plan.length} prefix(es)`);
    if (dryRun) {
        for (const p of plan) {
            logger_js_1.logger.info(`- ${p.prefix}* : ${p.keys.length}`);
        }
        return;
    }
    if (!(await promptConfirm('This will delete the keys listed above. Proceed?'))) {
        logger_js_1.logger.info('Aborted by user');
        return;
    }
    let deleted = 0;
    for (const p of plan) {
        if (p.keys.length > 0) {
            await redis.del(...p.keys);
            deleted += p.keys.length;
        }
    }
    logger_js_1.logger.info(`Deleted ${deleted} key(s) from Redis.`);
}
main().catch((e) => {
    logger_js_1.logger.error('Fatal error in wipeRedisGames script', e);
    process.exit(1);
});
//# sourceMappingURL=wipeRedisGames.js.map