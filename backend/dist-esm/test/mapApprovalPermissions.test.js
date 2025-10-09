"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test';
const globals_1 = require("@jest/globals");
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const queryMock = globals_1.jest.fn();
globals_1.jest.mock('../config/database.js', () => ({
    __esModule: true,
    query: queryMock,
    getPool: globals_1.jest.fn().mockResolvedValue({ query: queryMock }),
    getClient: globals_1.jest.fn().mockResolvedValue({ query: queryMock, release: globals_1.jest.fn() }),
    transaction: globals_1.jest.fn(),
}), { virtual: true });
globals_1.jest.mock('../middleware/auth.js', () => ({
    authenticateToken: (req, _res, next) => {
        const headerUser = req.headers['x-test-user-id'];
        req.userId = typeof headerUser === 'string' ? headerUser : 'test-user';
        const isAdminHeader = req.headers['x-test-admin'];
        req.user = {
            id: req.userId,
            isAdmin: isAdminHeader === 'true',
        };
        next();
    },
}), { virtual: true });
const logActivityMock = globals_1.jest.fn();
globals_1.jest.mock('../middleware/adminAuth.js', () => ({
    requireAdmin: (req, res, next) => {
        if (req.headers['x-test-admin'] !== 'true') {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        const permissionsHeader = req.headers['x-test-permissions'];
        const permissions = typeof permissionsHeader === 'string' ? permissionsHeader.split(',') : [];
        req.adminUser = {
            userId: req.userId,
            roles: ['test-admin'],
            permissions,
            isSuperAdmin: permissions.includes('*'),
        };
        next();
    },
    requirePermission: (permission) => (req, res, next) => {
        const permissionsHeader = req.headers['x-test-permissions'];
        const permissions = typeof permissionsHeader === 'string' ? permissionsHeader.split(',') : [];
        if (permissions.includes(permission) || permissions.includes('*')) {
            next();
            return;
        }
        res.status(403).json({ error: 'Insufficient permissions', required: permission });
    },
    logAdminActivity: () => (_req, _res, next) => {
        logActivityMock();
        next();
    },
}), { virtual: true });
globals_1.jest.mock('../services/mapPermissionService.js', () => {
    class MapPermissionError extends Error {
    }
    return {
        mapPermissionService: {
            assertCanEditMap: globals_1.jest.fn(),
            getMapEditorContext: globals_1.jest.fn(),
        },
        MapPermissionError,
    };
});
globals_1.jest.mock('../services/mapApprovalService.js', () => ({
    __esModule: true,
    default: {
        getVersionHistory: globals_1.jest.fn().mockResolvedValue([]),
        getVersionById: globals_1.jest.fn().mockResolvedValue({
            id: 'version-1',
            mapId: 'map-1',
        }),
        submitForApproval: globals_1.jest.fn(),
        getPendingApprovalRequests: globals_1.jest.fn().mockResolvedValue([]),
        assignReviewer: globals_1.jest.fn(),
        getReviewCriteria: globals_1.jest.fn().mockResolvedValue([]),
        submitReviewResults: globals_1.jest.fn(),
        publishVersion: globals_1.jest.fn(),
        archiveMap: globals_1.jest.fn(),
        getMapModerationHistory: globals_1.jest.fn().mockResolvedValue([]),
        getApprovalStats: globals_1.jest
            .fn()
            .mockResolvedValue({ total_requests: 0, approved: 0, rejected: 0, pending: 0 }),
    },
}), { virtual: true });
const mapApprovalService = require('../services/mapApprovalService.js').default;
const { mapPermissionService } = require('../services/mapPermissionService.js');
globals_1.jest.mock('../utils/errorHelpers.js', () => ({
    __esModule: true,
    getErrorMessage: globals_1.jest.fn((error) => error instanceof Error ? error.message : String(error)),
}), { virtual: true });
const createApp = () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const router = require('../routes/mapApproval.js').default;
    app.use('/api/map-approval', router);
    return app;
};
(0, globals_1.describe)('Map approval permissions', () => {
    (0, globals_1.beforeEach)(() => {
        mapApprovalService.getVersionHistory.mockReset().mockResolvedValue([]);
        mapApprovalService.getPendingApprovalRequests.mockReset().mockResolvedValue([]);
        mapPermissionService.assertCanEditMap.mockReset().mockResolvedValue({});
        mapPermissionService.getMapEditorContext.mockReset();
        queryMock.mockReset();
        logActivityMock.mockReset();
    });
    (0, globals_1.it)('requires admin access for approval queue', async () => {
        const response = await (0, supertest_1.default)(createApp()).get('/api/map-approval/approval-requests');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'Admin access required' });
    });
    (0, globals_1.it)('requires map_approval permission for approval queue', async () => {
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/map-approval/approval-requests')
            .set('x-test-admin', 'true');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'Insufficient permissions', required: 'map_approval' });
        (0, globals_1.expect)(mapApprovalService.getPendingApprovalRequests).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('allows approval queue access with map_approval permission', async () => {
        mapApprovalService.getPendingApprovalRequests.mockResolvedValueOnce([{ id: 'req-1' }]);
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/map-approval/approval-requests')
            .set('x-test-admin', 'true')
            .set('x-test-permissions', 'map_approval');
        (0, globals_1.expect)(response.status).toBe(200);
        (0, globals_1.expect)(response.body).toEqual({ requests: [{ id: 'req-1' }] });
    });
    (0, globals_1.it)('denies version history when user lacks map access', async () => {
        mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
            exists: true,
            canEdit: false,
            isAdmin: false,
        });
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/map-approval/maps/123/versions')
            .set('x-test-user-id', 'intruder');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ message: 'Forbidden' });
        (0, globals_1.expect)(mapApprovalService.getVersionHistory).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('returns version history for authorized editors', async () => {
        mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
            exists: true,
            canEdit: true,
            isAdmin: false,
        });
        mapApprovalService.getVersionHistory.mockResolvedValueOnce([{ id: 'version-1' }]);
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/map-approval/maps/123/versions')
            .set('x-test-user-id', 'owner-user');
        (0, globals_1.expect)(response.status).toBe(200);
        (0, globals_1.expect)(response.body).toEqual({ versions: [{ id: 'version-1' }] });
        (0, globals_1.expect)(mapApprovalService.getVersionHistory).toHaveBeenCalledWith('123');
    });
});
//# sourceMappingURL=mapApprovalPermissions.test.js.map