"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const mapWorkflowNotifications_js_1 = require("./mapWorkflowNotifications.js");
(0, globals_1.describe)('buildMapWorkflowNotification', () => {
    (0, globals_1.beforeAll)(() => {
        globals_1.jest.useFakeTimers({ now: new Date('2026-05-12T08:00:00Z') });
    });
    (0, globals_1.afterAll)(() => {
        globals_1.jest.useRealTimers();
    });
    (0, globals_1.it)('builds an approval notification with creator recipients', () => {
        const event = (0, mapWorkflowNotifications_js_1.buildMapWorkflowNotification)({
            status: 'approved',
            mapId: 'map-123',
            mapName: 'Aurora Isles',
            adminUserId: 'admin-1',
            creatorUserId: 'creator-9',
            notes: 'Looks great',
        });
        (0, globals_1.expect)(event.type).toBe('map.workflow.approved');
        (0, globals_1.expect)(event.title).toBe('Map approved: Aurora Isles');
        (0, globals_1.expect)(event.severity).toBe('info');
        (0, globals_1.expect)(event.createdAt).toBe('2026-05-12T08:00:00.000Z');
        (0, globals_1.expect)(event.recipients).toEqual({ userIds: ['creator-9'], roles: ['admin'] });
        (0, globals_1.expect)(event.context).toMatchObject({
            mapId: 'map-123',
            status: 'approved',
            adminUserId: 'admin-1',
            notes: 'Looks great',
        });
        (0, globals_1.expect)(event.cta?.[0]).toEqual({ label: 'View map', url: '/maps/map-123' });
    });
    (0, globals_1.it)('builds a rejection notification without creator user id', () => {
        const event = (0, mapWorkflowNotifications_js_1.buildMapWorkflowNotification)({
            status: 'rejected',
            mapId: 'map-321',
            mapName: 'Frosthold',
            adminUserId: 'admin-2',
            rejectionReason: 'Missing continent definitions',
        });
        (0, globals_1.expect)(event.type).toBe('map.workflow.rejected');
        (0, globals_1.expect)(event.severity).toBe('warning');
        (0, globals_1.expect)(event.recipients).toEqual({ roles: ['admin'] });
        (0, globals_1.expect)(event.body).toContain('Missing continent definitions');
        (0, globals_1.expect)(event.cta?.[0]).toEqual({ label: 'Review feedback', url: '/maps/map-321/edit' });
    });
});
//# sourceMappingURL=mapWorkflowNotifications.spec.js.map