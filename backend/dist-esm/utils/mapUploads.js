"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMapStagingDir = exports.getMapUploadsDir = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_js_1 = require("./logger.js");
let cachedMapUploadsDir = null;
let cachedStagingDir = null;
const ensureDirectory = (dirPath) => {
    if (!node_fs_1.default.existsSync(dirPath)) {
        node_fs_1.default.mkdirSync(dirPath, { recursive: true });
        logger_js_1.logger.info('Created uploads directory:', dirPath);
    }
    return dirPath;
};
const getMapUploadsDir = () => {
    if (cachedMapUploadsDir)
        return cachedMapUploadsDir;
    const uploadsRoot = node_path_1.default.join(__dirname, '../../uploads');
    const mapsDir = node_path_1.default.join(uploadsRoot, 'maps');
    cachedMapUploadsDir = ensureDirectory(mapsDir);
    return cachedMapUploadsDir;
};
exports.getMapUploadsDir = getMapUploadsDir;
const getMapStagingDir = () => {
    if (cachedStagingDir)
        return cachedStagingDir;
    const stagingDir = node_path_1.default.join((0, exports.getMapUploadsDir)(), 'staging');
    cachedStagingDir = ensureDirectory(stagingDir);
    return cachedStagingDir;
};
exports.getMapStagingDir = getMapStagingDir;
//# sourceMappingURL=mapUploads.js.map