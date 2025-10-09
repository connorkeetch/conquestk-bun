export function buildPerformanceAlertNotification(alert, adminUserIds) {
    const severity = mapAlertSeverity(alert.severity);
    const recipients = buildRecipients(adminUserIds);
    const event = {
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
    };
    if (recipients) {
        event.recipients = recipients;
    }
    return event;
}
function mapAlertSeverity(severity) {
    switch (severity) {
        case 'critical':
        case 'high':
            return 'critical';
        case 'medium':
            return 'warning';
        default:
            return 'info';
    }
}
function buildRecipients(adminUserIds) {
    const uniqueIds = Array.from(new Set(adminUserIds.filter((id) => Boolean(id))));
    if (uniqueIds.length === 0) {
        return {
            roles: ['admin'],
        };
    }
    return {
        userIds: uniqueIds,
        roles: ['admin'],
    };
}
function formatComponent(component) {
    if (!component) {
        return 'system';
    }
    return component
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
//# sourceMappingURL=performanceAlerts.js.map