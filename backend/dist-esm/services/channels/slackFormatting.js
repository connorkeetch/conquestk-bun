"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSlackWebhookPayload = formatSlackWebhookPayload;
const severityEmojis = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
};
const severityLabels = {
    info: 'Informational',
    warning: 'Warning',
    critical: 'Critical',
};
function formatSlackWebhookPayload(event) {
    const emoji = severityEmojis[event.severity] ?? '';
    const severityLabel = severityLabels[event.severity] ?? event.severity;
    const title = truncate(`${emoji ? `${emoji} ` : ''}${event.title}`.trim(), 150);
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
                emoji: Boolean(emoji),
            },
        },
    ];
    if (event.body.trim().length > 0) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: sanitizeSlackMarkdown(event.body),
            },
        });
    }
    const recipientsBlock = buildRecipientsBlock(event.recipients);
    if (recipientsBlock) {
        blocks.push(recipientsBlock);
    }
    if (event.context && Object.keys(event.context).length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'section',
            fields: Object.entries(event.context).map(([key, value]) => ({
                type: 'mrkdwn',
                text: `*${escapeMarkdown(key)}*\n${formatContextValue(value)}`,
            })),
        });
    }
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `*Severity:* ${severityLabel}`,
            },
            {
                type: 'mrkdwn',
                text: `*Event:* \`${event.type}\``,
            },
            {
                type: 'mrkdwn',
                text: `*Occurred:* ${formatCreatedAt(event.createdAt)}`,
            },
        ],
    });
    const actionsBlock = buildActionsBlock(event.cta, event.severity);
    if (actionsBlock) {
        blocks.push(actionsBlock);
    }
    const textFallback = buildTextFallback(event, severityLabel);
    return {
        text: textFallback,
        blocks,
        unfurl_links: false,
        unfurl_media: false,
    };
}
function buildRecipientsBlock(recipients) {
    if (!recipients) {
        return undefined;
    }
    const lines = [];
    if (recipients.userIds?.length) {
        const mentions = recipients.userIds.map((id) => `<@${id}>`).join(', ');
        lines.push(`*Users:* ${mentions}`);
    }
    if (recipients.roles?.length) {
        const formattedRoles = recipients.roles.map((role) => `\`${role}\``).join(', ');
        lines.push(`*Roles:* ${formattedRoles}`);
    }
    if (lines.length === 0) {
        return undefined;
    }
    return {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: lines.join('\n'),
        },
    };
}
function buildActionsBlock(ctas, severity) {
    if (!ctas?.length) {
        return undefined;
    }
    const style = severity === 'critical' ? 'danger' : severity === 'warning' ? 'primary' : undefined;
    return {
        type: 'actions',
        elements: ctas.slice(0, 5).map((cta) => ({
            type: 'button',
            text: {
                type: 'plain_text',
                text: truncate(cta.label, 75),
                emoji: true,
            },
            url: cta.url,
            style,
        })),
    };
}
function sanitizeSlackMarkdown(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeMarkdown(value) {
    return value.replace(/[`*_~]/g, (match) => `\\${match}`);
}
function truncate(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 1)}…`;
}
function formatCreatedAt(createdAt) {
    if (!createdAt) {
        return 'just now';
    }
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
        return createdAt;
    }
    return date.toISOString();
}
function formatContextValue(value) {
    if (value === null || value === undefined) {
        return '_n/a_';
    }
    if (typeof value === 'string') {
        return sanitizeSlackMarkdown(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return `\`\`\`${JSON.stringify(value, null, 2)}\`\`\``;
    }
    catch (_error) {
        return '`[unserializable]`';
    }
}
function buildTextFallback(event, severityLabel) {
    const contextLines = event.context
        ? Object.entries(event.context).map(([key, value]) => `${key}: ${formatContextValueForText(value)}`)
        : [];
    const actionLines = event.cta?.map((cta) => `${cta.label}: ${cta.url}`) ?? [];
    return [
        `${severityLabel.toUpperCase()}: ${event.title}`,
        event.body,
        ...contextLines,
        ...actionLines,
    ]
        .filter((line) => line && line.trim().length > 0)
        .join('\n');
}
function formatContextValueForText(value) {
    if (value === null || value === undefined) {
        return 'n/a';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    }
    catch (_error) {
        return '[unserializable]';
    }
}
//# sourceMappingURL=slackFormatting.js.map