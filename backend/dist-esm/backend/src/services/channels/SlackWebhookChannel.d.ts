import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications';
import type { NotificationChannel } from '../NotificationDispatcher.js';
interface SlackWebhookChannelOptions {
    webhookUrls: string[];
    defaultChannel?: string;
    additionalChannels?: string[];
    username?: string;
    iconEmoji?: string;
    failureThreshold?: number;
    cooldownMs?: number;
    maxAttempts?: number;
}
export declare class SlackWebhookChannel implements NotificationChannel {
    readonly name: "slack";
    private readonly webhookUrls;
    private readonly defaultChannel?;
    private readonly additionalChannels;
    private readonly username?;
    private readonly iconEmoji?;
    private readonly failureThreshold;
    private readonly cooldownMs;
    private readonly maxAttempts;
    private consecutiveFailures;
    private state;
    private nextAttemptAfter;
    constructor(options: SlackWebhookChannelOptions);
    static fromEnv(): SlackWebhookChannel | null;
    isAvailable(): boolean;
    send(event: NotificationEvent): Promise<NotificationResult>;
    private buildDestinations;
    private sendToDestination;
    private buildPayload;
    private recordSuccess;
    private recordFailure;
    private computeDelay;
}
export {};
//# sourceMappingURL=SlackWebhookChannel.d.ts.map