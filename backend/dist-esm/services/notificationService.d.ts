import webpush from 'web-push';
export interface NotificationPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: NotificationPayloadData;
    actions?: Array<{
        action: string;
        title: string;
    }>;
}
interface NotificationPayloadData {
    gameId?: string | number;
    url?: string;
    [key: string]: unknown;
}
interface PruneOptions {
    failureThreshold?: number;
    failureAgeDays?: number;
    staleRegistrationDays?: number;
}
export interface PruneResult {
    removedExpired: number;
    removedFailed: number;
    removedStale: number;
    totalRemoved: number;
    remainingSubscriptions: number;
    ranAt: string;
}
export interface CreateInAppNotificationOptions {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    actionUrl?: string;
    actionLabel?: string;
    icon?: string;
    read?: boolean;
    sendPush?: boolean;
    pushPayload?: NotificationPayload;
}
export interface InAppNotificationRecord {
    id: string;
    createdAt: Date;
}
declare class NotificationService {
    saveSubscription(userId: string, subscription: webpush.PushSubscription): Promise<void>;
    removeSubscription(userId: string, endpoint?: string, parentContext?: Record<string, unknown>): Promise<number>;
    private getSubscriptions;
    private markDeliverySuccess;
    private markDeliveryFailure;
    private sendToSubscription;
    sendToUser(userId: string, payload: NotificationPayload): Promise<boolean>;
    sendToUsers(userIds: string[], payload: NotificationPayload): Promise<void>;
    shouldSendDMPush(userId: string): Promise<boolean>;
    notifyGameStart(gameId: string, playerIds: string[]): Promise<void>;
    notifyTurnStart(gameId: string, userId: string, _username: string): Promise<void>;
    notifyGameEnd(gameId: string, winnerId: string, playerIds: string[]): Promise<void>;
    notifyGameInvite(userId: string, inviterName: string, gameId: string): Promise<void>;
    pruneStaleSubscriptions(options?: PruneOptions): Promise<PruneResult>;
    sendTestNotification(userId: string): Promise<boolean>;
    createInAppNotification(userId: string, options: CreateInAppNotificationOptions): Promise<InAppNotificationRecord>;
    getVapidPublicKey(): string;
    isEnabled(): boolean;
}
export declare const notificationService: NotificationService;
export default notificationService;
//# sourceMappingURL=notificationService.d.ts.map