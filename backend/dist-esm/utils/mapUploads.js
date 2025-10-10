import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
let cachedMapUploadsDir = null;
let cachedStagingDir = null;
const ensureDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info('Created uploads directory:', dirPath);
    }
    return dirPath;
};
export const getMapUploadsDir = () => {
    if (cachedMapUploadsDir)
        return cachedMapUploadsDir;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const uploadsRoot = path.join(__dirname, '../../uploads');
    const mapsDir = path.join(uploadsRoot, 'maps');
    cachedMapUploadsDir = ensureDirectory(mapsDir);
    return cachedMapUploadsDir;
};
export const getMapStagingDir = () => {
    if (cachedStagingDir)
        return cachedStagingDir;
    const stagingDir = path.join(getMapUploadsDir(), 'staging');
    cachedStagingDir = ensureDirectory(stagingDir);
    return cachedStagingDir;
};
//# sourceMappingURL=mapUploads.js.map