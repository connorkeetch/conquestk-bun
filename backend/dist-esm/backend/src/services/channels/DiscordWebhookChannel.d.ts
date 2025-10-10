import type { NotificationEvent, NotificationResult } from '../../../../shared/types/notifications';
import type { NotificationChannel } from '../NotificationDispatcher.js';
interface DiscordWebhookChannelOptions {
    webhookUrls: string[];
    username?: string;
    avatarUrl?: string;
    threadId?: string;
    failureThreshold?: number;
    cooldownMs?: number;
    maxAttempts?: number;
    fetchFn?: typeof fetch;
}
export declare class DiscordWebhookChannel implements NotificationChannel {
    readonly name: "discord";
    private readonly webhookUrls;
    private readonly username?;
    private readonly avatarUrl?;
    private readonly threadId?;
    private readonly failureThreshold;
    private readonly cooldownMs;
    private readonly maxAttempts;
    private readonly fetchFn;
    private consecutiveFailures;
    private state;
    private nextAttemptAfter;
    constructor(options: DiscordWebhookChannelOptions);
    static fromEnv(): DiscordWebhookChannel | null;
    isAvailable(): boolean;
    send(event: NotificationEvent): Promise<NotificationResult>;
    private sendToWebhook;
    private buildDestinations;
    private buildPayload;
    private appendThreadId;
    private recordSuccess;
    private recordFailure;
    private computeDelay;
}
export declare const discordWebhookChannel: DiscordWebhookChannel | null;
export {};
//# sourceMappingURL=DiscordWebhookChannel.d.ts.map