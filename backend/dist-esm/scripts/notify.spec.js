"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const dispatchMock = globals_1.jest.fn();
dispatchMock.mockResolvedValue([{ channel: 'slack', ok: true }]);
globals_1.jest.mock('../services/NotificationDispatcher', () => ({
    notificationDispatcher: {
        dispatch: (event) => dispatchMock(event),
    },
}));
(0, globals_1.describe)('notify CLI', () => {
    beforeEach(() => {
        dispatchMock.mockClear();
    });
    (0, globals_1.it)('sends an event using dispatcher with provided arguments', async () => {
        const originalArgv = process.argv;
        process.argv = [
            'node',
            'notify',
            '--type',
            'test.event',
            '--user',
            'user-42',
            '--role',
            'admin',
            '--title',
            'Test Event',
        ];
        try {
            const { runCli } = await import('./notify.js');
            await runCli();
            (0, globals_1.expect)(dispatchMock).toHaveBeenCalledTimes(1);
            const eventArg = dispatchMock.mock.calls[0][0];
            (0, globals_1.expect)(eventArg).toMatchObject({
                type: 'test.event',
                title: 'Test Event',
                recipients: { userIds: ['user-42'], roles: ['admin'] },
            });
        }
        finally {
            process.argv = originalArgv;
        }
    });
});
//# sourceMappingURL=notify.spec.js.map