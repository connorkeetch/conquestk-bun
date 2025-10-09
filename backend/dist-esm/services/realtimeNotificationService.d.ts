export interface RealtimeNotificationPayload {
    id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
    read?: boolean;
    icon?: string;
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
}
export declare const emitNotificationToUsers: (userIds: string[], payload: RealtimeNotificationPayload) => void;
export declare const emitNotificationToAdmin: (userId: string | null | undefined, payload: RealtimeNotificationPayload) => void;
//# sourceMappingURL=realtimeNotificationService.d.ts.map