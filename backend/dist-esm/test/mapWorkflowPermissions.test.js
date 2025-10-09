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
globals_1.jest.mock('../config/database', () => {
    const queryMock = globals_1.jest.fn();
    return {
        __esModule: true,
        query: queryMock,
        getPool: globals_1.jest.fn().mockResolvedValue({ query: queryMock }),
        getClient: globals_1.jest.fn().mockResolvedValue({ query: queryMock, release: globals_1.jest.fn() }),
        transaction: globals_1.jest.fn(),
    };
});
globals_1.jest.mock('../middleware/auth', () => ({
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
}));
const logActivityMock = globals_1.jest.fn();
globals_1.jest.mock('../middleware/adminAuth', () => ({
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
}));
globals_1.jest.mock('../services/mapPermissionService', () => {
    const actual = globals_1.jest.requireActual('../services/mapPermissionService');
    return {
        ...actual,
        mapPermissionService: {
            ...actual.mapPermissionService,
            assertCanEditMap: globals_1.jest.fn(),
            getMapEditorContext: globals_1.jest.fn(),
        },
    };
});
globals_1.jest.mock('../services/adminService', () => ({
    adminService: {
        logAdminAction: globals_1.jest.fn().mockResolvedValue(undefined),
        getActiveAdminUserIds: globals_1.jest.fn().mockResolvedValue([]),
    },
}));
globals_1.jest.mock('../services/notificationService', () => ({
    __esModule: true,
    default: {
        createInAppNotification: globals_1.jest.fn().mockResolvedValue(undefined),
    },
}));
globals_1.jest.mock('../services/NotificationDispatcher', () => ({
    notificationDispatcher: {
        dispatch: globals_1.jest.fn().mockResolvedValue([]),
    },
}));
globals_1.jest.mock('../services/mapService', () => ({
    mapService: {
        validateMapPlayable: globals_1.jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
    },
}));
const databaseModule = require('../config/database');
const queryMock = databaseModule.query;
const permissionsModule = require('../services/mapPermissionService');
const adminServiceModule = require('../services/adminService');
const notificationServiceModule = require('../services/notificationService').default;
const notificationDispatcherModule = require('../services/NotificationDispatcher');
const mapWorkflowServiceInstance = require('../services/mapWorkflowService')
    .default;
const createApp = () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const router = require('../routes/mapWorkflow').default;
    app.use('/api/workflow', router);
    return app;
};
(0, globals_1.describe)('Map workflow authorization', () => {
    (0, globals_1.beforeEach)(() => {
        queryMock.mockReset();
        permissionsModule.mapPermissionService.assertCanEditMap.mockReset();
        permissionsModule.mapPermissionService.getMapEditorContext.mockReset();
        adminServiceModule.adminService.logAdminAction.mockClear();
        adminServiceModule.adminService.getActiveAdminUserIds.mockResolvedValue([]);
        notificationServiceModule.createInAppNotification.mockClear();
        notificationDispatcherModule.notificationDispatcher.dispatch.mockClear();
        logActivityMock.mockClear();
    });
    (0, globals_1.it)('returns 403 when submit for review is attempted without permissions', async () => {
        const { MapPermissionError } = permissionsModule;
        permissionsModule.mapPermissionService.assertCanEditMap.mockRejectedValueOnce(new MapPermissionError('You do not have permission to edit this map'));
        const response = await (0, supertest_1.default)(createApp())
            .post('/api/workflow/maps/11111111-1111-1111-1111-111111111111/submit')
            .set('x-test-user-id', 'intruder');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'You do not have permission to edit this map' });
        (0, globals_1.expect)(queryMock).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('allows submit for review when editor has permissions', async () => {
        permissionsModule.mapPermissionService.assertCanEditMap.mockResolvedValueOnce({
            mapId: '22222222-2222-2222-2222-222222222222',
            exists: true,
            canEdit: true,
            isAdmin: false,
            isCreator: false,
            collaboratorRole: 'editor',
        });
        queryMock
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ id: 'version-1' }] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ name: 'Test Map' }] })
            .mockResolvedValueOnce({
            rows: [{ id: 'notif-1', admin_id: null, created_at: new Date().toISOString() }],
        })
            .mockResolvedValue({ rowCount: 1 });
        const response = await (0, supertest_1.default)(createApp())
            .post('/api/workflow/maps/22222222-2222-2222-2222-222222222222/submit')
            .set('x-test-user-id', 'editor-user');
        (0, globals_1.expect)(response.status).toBe(200);
        (0, globals_1.expect)(response.body).toEqual({
            success: true,
            message: 'Map submitted for review successfully',
        });
        (0, globals_1.expect)(queryMock).toHaveBeenCalled();
    });
    (0, globals_1.it)('denies admin routes when user lacks admin header', async () => {
        const response = await (0, supertest_1.default)(createApp())
            .post('/api/workflow/admin/maps/33333333-3333-3333-3333-333333333333/approve')
            .set('x-test-user-id', 'not-admin');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'Admin access required' });
        (0, globals_1.expect)(logActivityMock).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('logs admin activity with before/after snapshot on approval', async () => {
        const mapId = '44444444-4444-4444-4444-444444444444';
        queryMock
            .mockResolvedValueOnce({
            rows: [
                {
                    status: 'pending_review',
                    is_public: false,
                    reviewed_at: null,
                    reviewed_by: null,
                    review_notes: null,
                    rejection_reason: null,
                    is_featured: false,
                },
            ],
        })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({
            rows: [
                {
                    status: 'approved',
                    is_public: false,
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: 'admin-user',
                    review_notes: 'Looks good',
                    rejection_reason: null,
                    is_featured: false,
                },
            ],
        })
            .mockResolvedValueOnce({ rows: [{ creator_id: 'owner-id', name: 'Approved Map' }] });
        const response = await (0, supertest_1.default)(createApp())
            .post(`/api/workflow/admin/maps/${mapId}/approve`)
            .set('x-test-user-id', 'admin-user')
            .set('x-test-admin', 'true')
            .set('x-test-permissions', 'map_approval')
            .send({ notes: 'Looks good' });
        (0, globals_1.expect)(response.status).toBe(200);
        (0, globals_1.expect)(response.body).toEqual({
            success: true,
            message: 'Map approved successfully',
        });
        const logCall = adminServiceModule.adminService.logAdminAction.mock.calls[0];
        (0, globals_1.expect)(logCall[0]).toBe('admin-user');
        (0, globals_1.expect)(logCall[1]).toBe('map_approved');
        (0, globals_1.expect)(logCall[2]).toEqual(globals_1.expect.objectContaining({
            mapId,
            notes: 'Looks good',
            before: globals_1.expect.any(Object),
            after: globals_1.expect.any(Object),
        }));
        (0, globals_1.expect)(logCall[3]).toBe('map');
        (0, globals_1.expect)(logCall[4]).toBe(mapId);
        (0, globals_1.expect)(typeof logCall[5]).toBe('string');
        const userAgent = logCall[6];
        (0, globals_1.expect)(userAgent === undefined || typeof userAgent === 'string').toBe(true);
        (0, globals_1.expect)(logActivityMock).toHaveBeenCalled();
    });
    (0, globals_1.it)('denies map history access to users without edit permissions', async () => {
        permissionsModule.mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
            mapId: '55555555-5555-5555-5555-555555555555',
            exists: true,
            canEdit: false,
            isAdmin: false,
            isCreator: false,
        });
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/workflow/maps/55555555-5555-5555-5555-555555555555/history')
            .set('x-test-user-id', 'intruder');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({
            error: 'You do not have permission to view this map history',
        });
    });
    (0, globals_1.it)('returns map history for editors', async () => {
        permissionsModule.mapPermissionService.getMapEditorContext.mockResolvedValueOnce({
            mapId: '66666666-6666-6666-6666-666666666666',
            exists: true,
            canEdit: true,
            isAdmin: false,
            isCreator: true,
        });
        const historySpy = globals_1.jest
            .spyOn(mapWorkflowServiceInstance, 'getMapHistory')
            .mockResolvedValueOnce([{ action: 'submitted' }]);
        const response = await (0, supertest_1.default)(createApp())
            .get('/api/workflow/maps/66666666-6666-6666-6666-666666666666/history')
            .set('x-test-user-id', 'owner-user');
        (0, globals_1.expect)(historySpy).toHaveBeenCalledWith('66666666-6666-6666-6666-666666666666');
        (0, globals_1.expect)(response.status).toBe(200);
        (0, globals_1.expect)(response.body).toEqual({ success: true, history: [{ action: 'submitted' }] });
        historySpy.mockRestore();
    });
});
//# sourceMappingURL=mapWorkflowPermissions.test.js.map