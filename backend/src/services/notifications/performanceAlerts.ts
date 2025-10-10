import type { NotificationEvent } from '@conquestk/shared/types/notifications'
import type { PerformanceAlert } from '../performanceMonitorService.js'

export function buildPerformanceAlertNotification(
  alert: PerformanceAlert,
  adminUserIds: string[],
): Omit<NotificationEvent, 'id'> {
  const severity = mapAlertSeverity(alert.severity)

  const recipients = buildRecipients(adminUserIds)

  const event: Omit<NotificationEvent, 'id'> = {
    type: 'ops.incident.threshold_exceeded',
    title: `Ops alert: ${formatComponent(alert.component)}`,
    body: alert.message,
    severity,
    context: {
      alertId: alert.id,
      component: alert.component,
      severity: alert.severity,
      metrics: alert.metrics ?? {},
    },
    cta: [
      {
        label: 'View Ops Dashboard',
        url: '/admin/ops/alerts',
      },
    ],
    createdAt: new Date().toISOString(),
  }

  if (recipients) {
    event.recipients = recipients
  }

  return event
}

function mapAlertSeverity(severity: PerformanceAlert['severity']): NotificationEvent['severity'] {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'critical'
    case 'medium':
      return 'warning'
    default:
      return 'info'
  }
}

function buildRecipients(adminUserIds: string[]) {
  const uniqueIds = Array.from(new Set(adminUserIds.filter((id) => Boolean(id))))

  if (uniqueIds.length === 0) {
    return {
      roles: ['admin'],
    }
  }

  return {
    userIds: uniqueIds,
    roles: ['admin'],
  }
}

function formatComponent(component: string): string {
  if (!component) {
    return 'system'
  }

  return component
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
