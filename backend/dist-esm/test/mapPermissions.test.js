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
const databaseModule = require('../config/database');
const queryMock = databaseModule.query;
const createApp = () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    let mapsRouter;
    globals_1.jest.isolateModules(() => {
        const module = require('../routes/maps');
        mapsRouter = module.default;
    });
    if (!mapsRouter) {
        throw new Error('Failed to load maps router');
    }
    app.use('/api/maps', mapsRouter);
    return app;
};
(0, globals_1.describe)('Map permission enforcement', () => {
    (0, globals_1.beforeEach)(() => {
        queryMock.mockReset();
    });
    (0, globals_1.it)('returns 403 when updateMap is attempted without edit access', async () => {
        const mapId = '11111111-1111-1111-1111-111111111111';
        queryMock
            .mockResolvedValueOnce({ rows: [{ creator_id: 'owner-id' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const response = await (0, supertest_1.default)(createApp())
            .put(`/api/maps/${mapId}`)
            .set('x-test-user-id', 'intruder')
            .field('name', 'Updated Map');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'You do not have permission to edit this map' });
    });
    (0, globals_1.it)('returns 404 when map is missing during update', async () => {
        const mapId = '22222222-2222-2222-2222-222222222222';
        queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const response = await (0, supertest_1.default)(createApp())
            .put(`/api/maps/${mapId}`)
            .set('x-test-user-id', 'editor')
            .field('name', 'Updated Map');
        (0, globals_1.expect)(response.status).toBe(404);
        (0, globals_1.expect)(response.body).toEqual({ error: 'Map not found' });
    });
    (0, globals_1.it)('denies territory creation for non-authorized user', async () => {
        const mapId = '33333333-3333-3333-3333-333333333333';
        queryMock
            .mockResolvedValueOnce({ rows: [{ map_id: mapId }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ creator_id: 'different-owner' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const response = await (0, supertest_1.default)(createApp())
            .post(`/api/maps/${mapId}/territories`)
            .set('x-test-user-id', 'unauthorized-user')
            .send({
            territoryId: 'territory-1',
            name: 'Forbidden Territory',
            continentId: null,
            boundaryCoords: [
                { x: 0, y: 0 },
                { x: 5, y: 0 },
                { x: 0, y: 5 },
            ],
            armyPosition: { x: 1, y: 1 },
        });
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'You do not have permission to edit this map' });
    });
    (0, globals_1.it)('denies adjacency creation when user lacks territory access', async () => {
        const mapId = '44444444-4444-4444-4444-444444444444';
        queryMock
            .mockResolvedValueOnce({ rows: [{ map_id: mapId }, { map_id: mapId }], rowCount: 2 })
            .mockResolvedValueOnce({ rows: [{ creator_id: 'another-owner' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const response = await (0, supertest_1.default)(createApp())
            .post('/api/maps/adjacencies')
            .set('x-test-user-id', 'unauthorized-user')
            .send({
            fromTerritoryId: '55555555-5555-5555-5555-555555555555',
            toTerritoryId: '66666666-6666-6666-6666-666666666666',
            isBidirectional: true,
        });
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'You do not have permission to edit this map' });
    });
    (0, globals_1.it)('returns 403 when deleting a map without ownership', async () => {
        const mapId = '77777777-7777-7777-7777-777777777777';
        queryMock
            .mockResolvedValueOnce({ rows: [{ creator_id: 'actual-owner' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const response = await (0, supertest_1.default)(createApp())
            .delete(`/api/maps/${mapId}`)
            .set('x-test-user-id', 'unauthorized-user');
        (0, globals_1.expect)(response.status).toBe(403);
        (0, globals_1.expect)(response.body).toEqual({ error: 'You do not have permission to edit this map' });
    });
});
//# sourceMappingURL=mapPermissions.test.js.map