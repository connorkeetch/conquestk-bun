import type { NotificationEvent, NotificationResult } from '../../shared/types/notifications';
import type { NotificationChannel } from '../NotificationDispatcher.js';
import notificationService from '../notificationService.js';
export type WebPushService = Pick<typeof notificationService, 'isEnabled' | 'sendToUsers'>;
interface WebPushChannelOptions {
    service?: WebPushService;
}
export declare class WebPushChannel implements NotificationChannel {
    readonly name: "webpush";
    private readonly service;
    constructor(options?: WebPushChannelOptions);
    isAvailable(): boolean;
    send(event: NotificationEvent): Promise<NotificationResult>;
    private buildPayload;
}
export declare const webPushChannel: WebPushChannel;
export {};
//# sourceMappingURL=WebPushChannel.d.ts.map