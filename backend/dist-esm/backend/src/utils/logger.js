import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
const transports = [];
if (process.env.NODE_ENV === 'production') {
    transports.push(new winston.transports.Console({
        format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    }));
}
else {
    try {
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }), new winston.transports.File({ filename: 'logs/combined.log' }), new winston.transports.Console({
            format: winston.format.simple(),
        }));
    }
    catch (_error) {
        transports.push(new winston.transports.Console({
            format: winston.format.simple(),
        }));
    }
}
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    defaultMeta: { service: 'risk-game-backend' },
    transports,
});
//# sourceMappingURL=logger.js.map