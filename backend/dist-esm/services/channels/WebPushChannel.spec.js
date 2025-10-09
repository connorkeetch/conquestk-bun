"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const WebPushChannel_js_1 = require("./WebPushChannel.js");
const baseEvent = {
    id: 'event-1',
    type: 'map.approved',
    title: 'Map approved',
    body: 'The map **Asteroid Belt** is now live.',
    severity: 'info',
    recipients: {
        userIds: ['user-123'],
    },
    createdAt: '2026-05-12T12:00:00.000Z',
};
const createMockService = () => {
    const isEnabledMock = globals_1.jest.fn();
    isEnabledMock.mockReturnValue(true);
    const sendToUsersMock = globals_1.jest.fn();
    sendToUsersMock.mockResolvedValue(undefined);
    const service = {
        isEnabled: isEnabledMock,
        sendToUsers: sendToUsersMock,
    };
    return {
        service,
        isEnabledMock,
        sendToUsersMock,
    };
};
(0, globals_1.describe)('WebPushChannel', () => {
    (0, globals_1.it)('returns disabled result when web push service is disabled', async () => {
        const { service, isEnabledMock, sendToUsersMock } = createMockService();
        isEnabledMock.mockReturnValue(false);
        const channel = new WebPushChannel_js_1.WebPushChannel({ service });
        const result = await channel.send(baseEvent);
        (0, globals_1.expect)(result.ok).toBe(false);
        (0, globals_1.expect)(result.error).toBe('Web push service disabled');
        (0, globals_1.expect)(sendToUsersMock).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('gracefully skips when no user recipients are provided', async () => {
        const { service, sendToUsersMock } = createMockService();
        const channel = new WebPushChannel_js_1.WebPushChannel({ service });
        const eventWithoutRecipients = {
            ...baseEvent,
            recipients: { userIds: [] },
        };
        const result = await channel.send(eventWithoutRecipients);
        (0, globals_1.expect)(result.ok).toBe(true);
        (0, globals_1.expect)(sendToUsersMock).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('delegates to notification service when recipients exist', async () => {
        const { service, sendToUsersMock } = createMockService();
        const channel = new WebPushChannel_js_1.WebPushChannel({ service });
        const result = await channel.send(baseEvent);
        (0, globals_1.expect)(result.ok).toBe(true);
        (0, globals_1.expect)(sendToUsersMock).toHaveBeenCalledTimes(1);
        const [userIds, payload] = sendToUsersMock.mock.calls[0];
        (0, globals_1.expect)(userIds).toEqual(['user-123']);
        (0, globals_1.expect)(payload.title).toBe(baseEvent.title);
        (0, globals_1.expect)(payload.body).toContain('Asteroid Belt');
        (0, globals_1.expect)(payload.tag).toBe(baseEvent.type);
    });
    (0, globals_1.it)('surfaces errors from the notification service', async () => {
        const { service, sendToUsersMock } = createMockService();
        sendToUsersMock.mockRejectedValue(new Error('boom'));
        const channel = new WebPushChannel_js_1.WebPushChannel({ service });
        const result = await channel.send(baseEvent);
        (0, globals_1.expect)(result.ok).toBe(false);
        (0, globals_1.expect)(result.error).toBe('boom');
    });
});
//# sourceMappingURL=WebPushChannel.spec.js.map