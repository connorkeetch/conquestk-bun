"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkerHeartbeat = startWorkerHeartbeat;
const redis_js_1 = require("../config/redis.js");
const logger_js_1 = require("../utils/logger.js");
const DEFAULT_TTL_SECONDS = 10;
const DEFAULT_INTERVAL_MS = 5000;
function startWorkerHeartbeat(queueName, options) {
    const redis = (0, redis_js_1.getRedisClient)();
    if (!redis)
        return null;
    const ttl = Math.max(2, Math.trunc(options?.ttlSeconds ?? DEFAULT_TTL_SECONDS));
    const interval = Math.max(1000, Math.trunc(options?.intervalMs ?? DEFAULT_INTERVAL_MS));
    const instanceId = `${process.pid}`;
    const key = `worker:hb:${queueName}:${instanceId}`;
    let timer = null;
    const send = async () => {
        try {
            await redis.set(key, String(Date.now()), 'EX', ttl);
        }
        catch (e) {
            logger_js_1.logger.debug('Failed to send worker heartbeat', {
                queue: queueName,
                error: e instanceof Error ? e.message : e,
            });
        }
    };
    void send();
    timer = setInterval(send, interval);
    if (typeof timer.unref === 'function')
        timer.unref();
    return {
        key,
        stop: () => {
            if (timer)
                clearInterval(timer);
            timer = null;
        },
    };
}
//# sourceMappingURL=workerHeartbeat.js.map