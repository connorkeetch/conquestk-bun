"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const globals_1 = require("@jest/globals");
let mockQuery;
const mockCreateNotification = globals_1.jest.fn();
const mockGetActiveAdmins = globals_1.jest.fn().mockResolvedValue(['admin-1']);
globals_1.jest.mock('../config/database', () => {
    mockQuery = globals_1.jest.fn();
    return {
        query: (...args) => mockQuery(...args),
    };
});
globals_1.jest.mock('../services/notificationService', () => ({
    __esModule: true,
    default: {
        createInAppNotification: (...args) => mockCreateNotification(...args),
    },
}));
globals_1.jest.mock('../services/adminService', () => ({
    adminService: {
        getActiveAdminUserIds: (...args) => mockGetActiveAdmins(...args),
    },
}));
(0, globals_1.describe)('mapStagingService', () => {
    let mapStagingService;
    let tempDir;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.resetModules();
        mockCreateNotification.mockReset();
        mockGetActiveAdmins.mockResolvedValue(['admin-1']);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));
        process.env.MAP_UPLOADS_DIR = tempDir;
        ({ mapStagingService } = require('../services/mapStagingService'));
        mockQuery.mockReset();
    });
    (0, globals_1.it)('purges deleted images and records metrics', async () => {
        const filename = 'map-test.png';
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, Buffer.from('mock'));
        mockQuery
            .mockResolvedValueOnce({
            rows: [
                {
                    id: 'image-1',
                    user_id: 'user-1',
                    filename,
                    file_size: 4,
                    deletion_attempts: 0,
                },
            ],
        })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 });
        const summary = await mapStagingService.purgeDeletedImages({ batchSize: 10, minAgeMinutes: 0 });
        (0, globals_1.expect)(summary).toEqual({ processed: 1, purged: 1, failed: 0, bytesPurged: 4 });
        (0, globals_1.expect)(fs.existsSync(filePath)).toBe(false);
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(5);
        const [selectCall, updateCall, insertRunCall, deleteOldCall, capCall] = mockQuery.mock.calls;
        (0, globals_1.expect)(selectCall?.[0]).toContain('FROM map_images_staging');
        (0, globals_1.expect)(updateCall?.[0]).toContain('UPDATE map_images_staging');
        (0, globals_1.expect)(insertRunCall?.[0]).toContain('INSERT INTO map_asset_purge_runs');
        (0, globals_1.expect)(deleteOldCall?.[0]).toContain('DELETE FROM map_asset_purge_runs');
        (0, globals_1.expect)(capCall?.[0]).toContain('WITH ranked AS');
    });
    (0, globals_1.it)('reclaims a soft-deleted image when file exists', async () => {
        const filename = 'reclaim.png';
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, Buffer.from('restore'));
        mockQuery
            .mockResolvedValueOnce({
            rows: [
                {
                    id: 'image-2',
                    user_id: 'user-1',
                    filename,
                    is_deleted: true,
                },
            ],
        })
            .mockResolvedValueOnce({
            rows: [
                {
                    id: 'image-2',
                    user_id: 'user-1',
                    filename,
                    is_deleted: false,
                },
            ],
        });
        const image = await mapStagingService.reclaimStagingImage('admin-1', 'image-2');
        (0, globals_1.expect)(image).toMatchObject({ id: 'image-2', is_deleted: false });
        (0, globals_1.expect)(fs.existsSync(filePath)).toBe(true);
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(2);
    });
});
//# sourceMappingURL=mapStagingService.test.js.map