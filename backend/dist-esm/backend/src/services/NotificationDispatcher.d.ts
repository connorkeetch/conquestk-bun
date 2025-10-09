import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications';
export type NotificationChannelName = 'webpush' | 'slack' | 'discord' | (string & {});
export interface NotificationChannel {
    name: NotificationChannelName;
    send(event: NotificationEvent): Promise<NotificationResult>;
    isAvailable?(): boolean | Promise<boolean>;
}
interface NotificationDispatcherOptions {
    channels?: NotificationChannel[];
    loggerContext?: Record<string, unknown>;
    enabledChannels?: string[];
    externalNotificationsEnabled?: boolean;
}
export declare class NotificationDispatcher {
    private logger;
    private readonly configuredChannels;
    private readonly externalNotificationsEnabled;
    private readonly channels;
    constructor(options?: NotificationDispatcherOptions);
    registerChannel(channel: NotificationChannel): void;
    getRegisteredChannels(): NotificationChannel[];
    getEnabledChannels(): NotificationChannel[];
    dispatch(event: NotificationEvent): Promise<NotificationResult[]>;
    private shouldDispatchTo;
    private isChannelFlagEnabled;
    private parseConfiguredChannels;
    private normalizeChannelName;
    private parseBoolean;
}
export declare const notificationDispatcher: NotificationDispatcher;
export {};
//# sourceMappingURL=NotificationDispatcher.d.ts.map