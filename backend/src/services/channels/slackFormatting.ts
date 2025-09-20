import type {
  NotificationCallToAction,
  NotificationEvent,
  NotificationRecipientFilters,
} from '@risk-game/shared/types/notifications'

interface SlackPlainTextObject {
  type: 'plain_text'
  text: string
  emoji?: boolean
}

interface SlackMarkdownTextObject {
  type: 'mrkdwn'
  text: string
}

type SlackTextObject = SlackPlainTextObject | SlackMarkdownTextObject

interface SlackHeaderBlock {
  type: 'header'
  text: SlackPlainTextObject
}

interface SlackSectionBlock {
  type: 'section'
  text?: SlackTextObject
  fields?: SlackMarkdownTextObject[]
}

interface SlackDividerBlock {
  type: 'divider'
}

interface SlackContextBlock {
  type: 'context'
  elements: SlackMarkdownTextObject[]
}

interface SlackActionsBlock {
  type: 'actions'
  elements: SlackButtonElement[]
}

interface SlackButtonElement {
  type: 'button'
  text: SlackPlainTextObject
  url: string
  style?: 'primary' | 'danger'
}

type SlackBlock = SlackHeaderBlock | SlackSectionBlock | SlackDividerBlock | SlackContextBlock | SlackActionsBlock

export interface SlackWebhookPayload {
  text: string
  blocks: SlackBlock[]
  unfurl_links?: boolean
  unfurl_media?: boolean
}

const severityEmojis: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

const severityLabels: Record<string, string> = {
  info: 'Informational',
  warning: 'Warning',
  critical: 'Critical',
}

export function formatSlackWebhookPayload(event: NotificationEvent): SlackWebhookPayload {
  const emoji = severityEmojis[event.severity] ?? ''
  const severityLabel = severityLabels[event.severity] ?? event.severity

  const title = truncate(`${emoji ? `${emoji} ` : ''}${event.title}`.trim(), 150)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: title,
        emoji: Boolean(emoji),
      },
    },
  ]

  if (event.body.trim().length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: sanitizeSlackMarkdown(event.body),
      },
    })
  }

  const recipientsBlock = buildRecipientsBlock(event.recipients)
  if (recipientsBlock) {
    blocks.push(recipientsBlock)
  }

  if (event.context && Object.keys(event.context).length > 0) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      fields: Object.entries(event.context).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${escapeMarkdown(key)}*\n${formatContextValue(value)}`,
      })),
    })
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
  })

  const actionsBlock = buildActionsBlock(event.cta, event.severity)
  if (actionsBlock) {
    blocks.push(actionsBlock)
  }

  const textFallback = buildTextFallback(event, severityLabel)

  return {
    text: textFallback,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  }
}

function buildRecipientsBlock(
  recipients?: NotificationRecipientFilters,
): SlackSectionBlock | undefined {
  if (!recipients) {
    return undefined
  }

  const lines: string[] = []
  if (recipients.userIds?.length) {
    const mentions = recipients.userIds.map((id) => `<@${id}>`).join(', ')
    lines.push(`*Users:* ${mentions}`)
  }

  if (recipients.roles?.length) {
    const formattedRoles = recipients.roles.map((role) => `\`${role}\``).join(', ')
    lines.push(`*Roles:* ${formattedRoles}`)
  }

  if (lines.length === 0) {
    return undefined
  }

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: lines.join('\n'),
    },
  }
}

function buildActionsBlock(
  ctas: NotificationCallToAction[] | undefined,
  severity: NotificationEvent['severity'],
): SlackActionsBlock | undefined {
  if (!ctas?.length) {
    return undefined
  }

  const style = severity === 'critical' ? 'danger' : severity === 'warning' ? 'primary' : undefined

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
  }
}

function sanitizeSlackMarkdown(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeMarkdown(value: string): string {
  return value.replace(/[`*_~]/g, (match) => `\\${match}`)
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 1)}…`
}

function formatCreatedAt(createdAt?: string): string {
  if (!createdAt) {
    return 'just now'
  }

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return createdAt
  }

  return date.toISOString()
}

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '_n/a_'
  }

  if (typeof value === 'string') {
    return sanitizeSlackMarkdown(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return '```' + JSON.stringify(value, null, 2) + '```'
  } catch (error) {
    return '`[unserializable]`'
  }
}

function buildTextFallback(event: NotificationEvent, severityLabel: string): string {
  const contextLines = event.context
    ? Object.entries(event.context).map(
        ([key, value]) => `${key}: ${formatContextValueForText(value)}`,
      )
    : []

  const actionLines = event.cta?.map((cta) => `${cta.label}: ${cta.url}`) ?? []

  return [
    `${severityLabel.toUpperCase()}: ${event.title}`,
    event.body,
    ...contextLines,
    ...actionLines,
  ]
    .filter((line) => line && line.trim().length > 0)
    .join('\n')
}

function formatContextValueForText(value: unknown): string {
  if (value === null || value === undefined) {
    return 'n/a'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch (error) {
    return '[unserializable]'
  }
}
