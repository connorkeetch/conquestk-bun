export function buildMapWorkflowNotification(input) {
    const titlePrefix = input.status === 'approved' ? 'Map approved' : 'Map changes needed';
    const severity = input.status === 'approved' ? 'info' : 'warning';
    const body = input.status === 'approved'
        ? `"${input.mapName}" is now live for players.`
        : input.rejectionReason
            ? `"${input.mapName}" needs updates before it can go live. Reason: ${input.rejectionReason}.`
            : `"${input.mapName}" needs updates before it can go live.`;
    const ctaUrl = input.status === 'approved' ? `/maps/${input.mapId}` : `/maps/${input.mapId}/edit`;
    const recipients = buildRecipients(input.creatorUserId);
    const context = {
        mapId: input.mapId,
        status: input.status,
        adminUserId: input.adminUserId,
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
    };
    const event = {
        type: input.status === 'approved' ? 'map.workflow.approved' : 'map.workflow.rejected',
        title: `${titlePrefix}: ${input.mapName}`,
        body,
        severity,
        context,
        cta: [
            {
                label: input.status === 'approved' ? 'View map' : 'Review feedback',
                url: ctaUrl,
            },
        ],
        createdAt: new Date().toISOString(),
    };
    if (recipients) {
        event.recipients = recipients;
    }
    return event;
}
function buildRecipients(creatorUserId) {
    const userIds = creatorUserId ? [creatorUserId] : [];
    if (userIds.length === 0) {
        return {
            roles: ['admin'],
        };
    }
    return {
        userIds,
        roles: ['admin'],
    };
}
//# sourceMappingURL=mapWorkflowNotifications.js.map