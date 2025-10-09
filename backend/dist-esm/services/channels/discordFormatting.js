"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDiscordWebhookPayload = formatDiscordWebhookPayload;
const severityEmojis = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
};
const severityColours = {
    info: 0x2563eb,
    warning: 0xf59e0b,
    critical: 0xdc2626,
};
const MAX_FIELD_VALUE_LENGTH = 1024;
const MAX_FIELDS = 10;
function formatDiscordWebhookPayload(event) {
    const emoji = severityEmojis[event.severity] ?? '';
    const colour = severityColours[event.severity] ?? severityColours.info;
    const title = `${emoji ? `${emoji} ` : ''}${event.title}`.trim();
    const contentLines = [];
    if (emoji) {
        contentLines.push(`${emoji} **${escapeDiscordMarkdown(event.title)}**`);
    }
    else {
        contentLines.push(`**${escapeDiscordMarkdown(event.title)}**`);
    }
    const actionsLine = formatActionsLine(event);
    if (actionsLine) {
        contentLines.push(actionsLine);
    }
    const embed = {
        title,
        description: event.body?.trim().length ? sanitizeDiscord(event.body) : undefined,
        color: colour,
        timestamp: formatTimestamp(event.createdAt),
        fields: buildFields(event),
    };
    return {
        content: contentLines.join('\n').trim() || undefined,
        embeds: embed.description || (embed.fields && embed.fields.length > 0) ? [embed] : undefined,
        allowed_mentions: { parse: [] },
    };
}
function buildFields(event) {
    const fields = [];
    if (event.context && Object.keys(event.context).length > 0) {
        Object.entries(event.context)
            .slice(0, MAX_FIELDS)
            .forEach(([key, value]) => {
            fields.push({
                name: truncate(`Context — ${key}`, 256),
                value: truncate(formatContextValue(value), MAX_FIELD_VALUE_LENGTH),
                inline: false,
            });
        });
    }
    if (event.recipients?.roles?.length) {
        fields.push({
            name: 'Roles',
            value: truncate(event.recipients.roles.map((role) => `\`${escapeDiscordMarkdown(role)}\``).join(', '), MAX_FIELD_VALUE_LENGTH),
        });
    }
    if (event.recipients?.userIds?.length) {
        fields.push({
            name: 'Users',
            value: truncate(event.recipients.userIds.map((id) => escapeDiscordMarkdown(id)).join(', '), MAX_FIELD_VALUE_LENGTH),
        });
    }
    return fields.slice(0, MAX_FIELDS);
}
function formatActionsLine(event) {
    if (!event.cta?.length) {
        return undefined;
    }
    const links = event.cta
        .map((cta) => `[${escapeDiscordMarkdown(cta.label)}](${cta.url})`)
        .join(' • ');
    return links.length ? links : undefined;
}
function formatContextValue(value) {
    if (value === null || value === undefined) {
        return 'n/a';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return escapeDiscordMarkdown(String(value));
    }
    try {
        return `\`\`\`json\n${JSON.stringify(value, null, 2).slice(0, MAX_FIELD_VALUE_LENGTH - 8)}\n\`\`\``;
    }
    catch (_error) {
        return '`[unserializable]`';
    }
}
function formatTimestamp(createdAt) {
    if (!createdAt) {
        return new Date().toISOString();
    }
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }
    return date.toISOString();
}
function escapeDiscordMarkdown(value) {
    return value.replace(/[\\*_`~|>]/g, (match) => `\\${match}`);
}
function sanitizeDiscord(value) {
    return escapeDiscordMarkdown(value);
}
function truncate(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 1)}…`;
}
//# sourceMappingURL=discordFormatting.js.map