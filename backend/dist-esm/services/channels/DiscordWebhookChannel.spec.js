"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const DiscordWebhookChannel_js_1 = require("./DiscordWebhookChannel.js");
const baseEvent = {
    id: 'event-2',
    type: 'incident.backend_error',
    title: 'Backend error rate spiked',
    body: 'Error rate exceeded threshold on staging.',
    severity: 'critical',
    createdAt: '2026-05-12T12:15:00.000Z',
};
(0, globals_1.describe)('DiscordWebhookChannel', () => {
    (0, globals_1.afterEach)(() => {
        delete process.env.DISCORD_WEBHOOK_URL;
        delete process.env.DISCORD_WEBHOOK_URLS;
        delete process.env.DISCORD_USERNAME;
        delete process.env.DISCORD_AVATAR_URL;
        delete process.env.DISCORD_THREAD_ID;
    });
    (0, globals_1.it)('returns null from fromEnv when no webhook URLs are configured', () => {
        (0, globals_1.expect)(DiscordWebhookChannel_js_1.DiscordWebhookChannel.fromEnv()).toBeNull();
    });
    (0, globals_1.it)('sends payloads to configured webhook URLs', async () => {
        const fetchMock = globals_1.jest.fn();
        fetchMock.mockResolvedValue(new Response('', { status: 200 }));
        const channel = new DiscordWebhookChannel_js_1.DiscordWebhookChannel({
            webhookUrls: ['https://discord.com/api/webhooks/123/abc'],
            username: 'ConquestK Alerts',
            threadId: '42',
            fetchFn: fetchMock,
        });
        const result = await channel.send(baseEvent);
        (0, globals_1.expect)(result.ok).toBe(true);
        (0, globals_1.expect)(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        (0, globals_1.expect)(String(url)).toContain('thread_id=42');
        (0, globals_1.expect)(init?.method).toBe('POST');
        const payload = JSON.parse(String(init?.body));
        (0, globals_1.expect)(payload.username).toBe('ConquestK Alerts');
        (0, globals_1.expect)(payload.content).toContain('Backend error rate spiked');
    });
    (0, globals_1.it)('opens circuit breaker after repeated failures', async () => {
        const fetchMock = globals_1.jest.fn();
        fetchMock.mockResolvedValue(new Response('oops', {
            status: 500,
            headers: { 'retry-after': '1' },
        }));
        const channel = new DiscordWebhookChannel_js_1.DiscordWebhookChannel({
            webhookUrls: ['https://discord.com/api/webhooks/xyz/123'],
            fetchFn: fetchMock,
            failureThreshold: 1,
            maxAttempts: 1,
            cooldownMs: 1000,
        });
        const result = await channel.send(baseEvent);
        (0, globals_1.expect)(result.ok).toBe(false);
        (0, globals_1.expect)(channel.isAvailable()).toBe(false);
    });
});
//# sourceMappingURL=DiscordWebhookChannel.spec.js.map