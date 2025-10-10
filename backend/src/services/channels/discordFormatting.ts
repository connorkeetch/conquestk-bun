import type { NotificationEvent } from '@conquestk/shared/types/notifications'

export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
  allowed_mentions?: {
    parse: []
  }
}

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  fields?: DiscordEmbedField[]
  timestamp?: string
}

const severityEmojis: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

const severityColours: Record<string, number> = {
  info: 0x2563eb,
  warning: 0xf59e0b,
  critical: 0xdc2626,
}

const MAX_FIELD_VALUE_LENGTH = 1024
const MAX_FIELDS = 10

export function formatDiscordWebhookPayload(event: NotificationEvent): DiscordWebhookPayload {
  const emoji = severityEmojis[event.severity] ?? ''
  const colour = severityColours[event.severity] ?? severityColours.info

  const title = `${emoji ? `${emoji} ` : ''}${event.title}`.trim()
  const contentLines: string[] = []

  if (emoji) {
    contentLines.push(`${emoji} **${escapeDiscordMarkdown(event.title)}**`)
  } else {
    contentLines.push(`**${escapeDiscordMarkdown(event.title)}**`)
  }

  const actionsLine = formatActionsLine(event)
  if (actionsLine) {
    contentLines.push(actionsLine)
  }

  const embed: DiscordEmbed = {
    title,
    description: event.body?.trim().length ? sanitizeDiscord(event.body) : undefined,
    color: colour,
    timestamp: formatTimestamp(event.createdAt),
    fields: buildFields(event),
  }

  return {
    content: contentLines.join('\n').trim() || undefined,
    embeds: embed.description || (embed.fields && embed.fields.length > 0) ? [embed] : undefined,
    allowed_mentions: { parse: [] },
  }
}

function buildFields(event: NotificationEvent): DiscordEmbedField[] {
  const fields: DiscordEmbedField[] = []

  if (event.context && Object.keys(event.context).length > 0) {
    Object.entries(event.context)
      .slice(0, MAX_FIELDS)
      .forEach(([key, value]) => {
        fields.push({
          name: truncate(`Context — ${key}`, 256),
          value: truncate(formatContextValue(value), MAX_FIELD_VALUE_LENGTH),
          inline: false,
        })
      })
  }

  if (event.recipients?.roles?.length) {
    fields.push({
      name: 'Roles',
      value: truncate(
        event.recipients.roles.map((role) => `\`${escapeDiscordMarkdown(role)}\``).join(', '),
        MAX_FIELD_VALUE_LENGTH,
      ),
    })
  }

  if (event.recipients?.userIds?.length) {
    fields.push({
      name: 'Users',
      value: truncate(
        event.recipients.userIds.map((id) => escapeDiscordMarkdown(id)).join(', '),
        MAX_FIELD_VALUE_LENGTH,
      ),
    })
  }

  return fields.slice(0, MAX_FIELDS)
}

function formatActionsLine(event: NotificationEvent): string | undefined {
  if (!event.cta?.length) {
    return undefined
  }

  const links = event.cta
    .map((cta) => `[${escapeDiscordMarkdown(cta.label)}](${cta.url})`)
    .join(' • ')

  return links.length ? links : undefined
}

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'n/a'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return escapeDiscordMarkdown(String(value))
  }

  try {
    return `\`\`\`json\n${JSON.stringify(value, null, 2).slice(0, MAX_FIELD_VALUE_LENGTH - 8)}\n\`\`\``
  } catch (_error) {
    return '`[unserializable]`'
  }
}

function formatTimestamp(createdAt?: string): string | undefined {
  if (!createdAt) {
    return new Date().toISOString()
  }

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString()
  }

  return date.toISOString()
}

function escapeDiscordMarkdown(value: string): string {
  return value.replace(/[\\*_`~|>]/g, (match) => `\\${match}`)
}

function sanitizeDiscord(value: string): string {
  return escapeDiscordMarkdown(value)
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 1)}…`
}
