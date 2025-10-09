"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const performanceAlerts_js_1 = require("./performanceAlerts.js");
(0, globals_1.describe)('buildPerformanceAlertNotification', () => {
    (0, globals_1.beforeAll)(() => {
        globals_1.jest.useFakeTimers({ now: new Date('2026-05-12T09:15:00Z') });
    });
    (0, globals_1.afterAll)(() => {
        globals_1.jest.useRealTimers();
    });
    (0, globals_1.it)('maps alert data into a dispatcher event with admin recipients', () => {
        const alert = {
            id: 'alert-1',
            severity: 'critical',
            component: 'database',
            message: 'Database response time exceeded threshold',
            timestamp: Date.now(),
            resolved: false,
            metrics: { responseTime: 1500 },
        };
        const event = (0, performanceAlerts_js_1.buildPerformanceAlertNotification)(alert, ['admin-1', 'admin-2']);
        (0, globals_1.expect)(event.type).toBe('ops.incident.threshold_exceeded');
        (0, globals_1.expect)(event.severity).toBe('critical');
        (0, globals_1.expect)(event.recipients).toEqual({ userIds: ['admin-1', 'admin-2'], roles: ['admin'] });
        (0, globals_1.expect)(event.context).toMatchObject({
            alertId: 'alert-1',
            component: 'database',
            severity: 'critical',
        });
        (0, globals_1.expect)(event.createdAt).toBe('2026-05-12T09:15:00.000Z');
        (0, globals_1.expect)(event.cta?.[0]).toEqual({ label: 'View Ops Dashboard', url: '/admin/ops/alerts' });
    });
    (0, globals_1.it)('falls back to role recipients when admin list is empty', () => {
        const alert = {
            id: 'alert-2',
            severity: 'medium',
            component: 'queues',
            message: 'Queue backlog is elevated',
            timestamp: Date.now(),
            resolved: false,
        };
        const event = (0, performanceAlerts_js_1.buildPerformanceAlertNotification)(alert, []);
        (0, globals_1.expect)(event.severity).toBe('warning');
        (0, globals_1.expect)(event.recipients).toEqual({ roles: ['admin'] });
    });
});
//# sourceMappingURL=performanceAlerts.spec.js.map