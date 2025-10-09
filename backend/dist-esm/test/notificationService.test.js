"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const notificationService_js_1 = __importDefault(require("../services/notificationService.js"));
const mockQuery = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args),
}));
const emitNotificationToUsers = globals_1.jest.fn();
globals_1.jest.mock('../services/realtimeNotificationService', () => ({
    emitNotificationToUsers: (...args) => emitNotificationToUsers(...args),
}));
(0, globals_1.describe)('notificationService.createInAppNotification', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        emitNotificationToUsers.mockReset();
    });
    (0, globals_1.it)('stores notification and emits realtime payload', async () => {
        const result = await notificationService_js_1.default.createInAppNotification('user-123', {
            type: 'system',
            title: 'Test notification',
            message: 'This is only a test',
            data: { foo: 'bar' },
            sendPush: false,
        });
        (0, globals_1.expect)(result.id).toEqual(globals_1.expect.any(String));
        (0, globals_1.expect)(result.createdAt).toBeInstanceOf(Date);
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledWith(globals_1.expect.stringContaining('INSERT INTO notifications'), globals_1.expect.arrayContaining(['user-123', 'system', 'Test notification']));
        (0, globals_1.expect)(emitNotificationToUsers).toHaveBeenCalledWith(['user-123'], globals_1.expect.objectContaining({
            id: result.id,
            type: 'system',
            title: 'Test notification',
            message: 'This is only a test',
        }));
    });
});
//# sourceMappingURL=notificationService.test.js.map