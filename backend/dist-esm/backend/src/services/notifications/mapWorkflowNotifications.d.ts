import type { NotificationEvent } from '../../../../shared/types/notifications';
export type MapWorkflowNotificationStatus = 'approved' | 'rejected';
export interface MapWorkflowNotificationInput {
    status: MapWorkflowNotificationStatus;
    mapId: string;
    mapName: string;
    adminUserId: string;
    creatorUserId?: string;
    notes?: string;
    rejectionReason?: string;
}
export declare function buildMapWorkflowNotification(input: MapWorkflowNotificationInput): Omit<NotificationEvent, 'id'>;
//# sourceMappingURL=mapWorkflowNotifications.d.ts.map