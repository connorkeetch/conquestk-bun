"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const winston_1 = __importDefault(require("winston"));
const transports = [];
if (process.env.NODE_ENV === 'production') {
    transports.push(new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    }));
}
else {
    try {
        const logsDir = node_path_1.default.join(process.cwd(), 'logs');
        if (!node_fs_1.default.existsSync(logsDir)) {
            node_fs_1.default.mkdirSync(logsDir, { recursive: true });
        }
        transports.push(new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }), new winston_1.default.transports.File({ filename: 'logs/combined.log' }), new winston_1.default.transports.Console({
            format: winston_1.default.format.simple(),
        }));
    }
    catch (_error) {
        transports.push(new winston_1.default.transports.Console({
            format: winston_1.default.format.simple(),
        }));
    }
}
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'risk-game-backend' },
    transports,
});
//# sourceMappingURL=logger.js.map