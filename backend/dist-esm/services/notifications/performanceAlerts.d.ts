import type { NotificationEvent } from '@risk-game/shared/types/notifications';
import type { PerformanceAlert } from '../performanceMonitorService.js';
export declare function buildPerformanceAlertNotification(alert: PerformanceAlert, adminUserIds: string[]): Omit<NotificationEvent, 'id'>;
//# sourceMappingURL=performanceAlerts.d.ts.map