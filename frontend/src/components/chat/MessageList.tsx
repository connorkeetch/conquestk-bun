import { useMemo } from 'react'
import LinkPreviewComponent, { type LinkPreviewData } from './LinkPreview'

export interface DisplayMessage {
  id: string
  senderId: string | null
  senderName?: string
  body: string
  createdAt: string
  editedAt?: string | null
  deletedAt?: string | null
  metadata?: Record<string, unknown> | null
}

interface MessageListProps {
  messages: DisplayMessage[]
  currentUserId?: string | null
  getDisplayName?: (message: DisplayMessage, isOwn: boolean) => string | undefined
  onUserClick?: (username: string) => void
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (Number.isNaN(diffMins)) return dateString
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const parseLinkPreviews = (metadata?: Record<string, unknown> | null): LinkPreviewData[] => {
  if (!metadata) {
    return []
  }

  const candidates = (metadata.linkPreviews ?? metadata.link_previews) as unknown
  if (!Array.isArray(candidates)) {
    return []
  }

  return candidates
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const url = typeof record.url === 'string' ? record.url : undefined
      if (!url) {
        return null
      }

      return {
        url,
        title: typeof record.title === 'string' ? record.title : undefined,
        description: typeof record.description === 'string' ? record.description : undefined,
        image: typeof record.image === 'string' ? record.image : undefined,
        siteName:
          typeof record.siteName === 'string'
            ? record.siteName
            : typeof record.site_name === 'string'
              ? record.site_name
              : undefined,
      } as LinkPreviewData
    })
    .filter((preview): preview is LinkPreviewData => preview !== null)
}

export default function MessageList({
  messages,
  currentUserId,
  getDisplayName,
  onUserClick,
}: MessageListProps) {
  const isOwn = useMemo(
    () => new Set(currentUserId && typeof currentUserId === 'string' ? [currentUserId] : []),
    [currentUserId],
  )

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isOwnMessage = message.senderId ? isOwn.has(message.senderId) : false
        const senderLabel = getDisplayName?.(message, isOwnMessage) ?? message.senderName
        const isDeleted = Boolean(message.deletedAt)
        const linkPreviews = parseLinkPreviews(message.metadata)
        const displayName = senderLabel || (isOwnMessage ? 'You' : 'System')
        const timestampLabel = formatTime(message.createdAt)

        return (
          <div
            key={message.id}
            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                isOwnMessage
                  ? 'bg-primary text-[color:var(--color-white)]'
                  : 'bg-surface-2 text-[color:var(--text)]'
              } ${isDeleted ? 'opacity-50 italic' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                {(() => {
                  const clickable =
                    typeof onUserClick === 'function' &&
                    !isOwnMessage &&
                    !!message.senderId &&
                    displayName &&
                    displayName !== 'System' &&
                    displayName !== 'Player'
                  return clickable ? (
                    <button
                      type="button"
                      className="text-xs font-semibold uppercase tracking-wide opacity-80 hover:underline"
                      onClick={() => onUserClick(displayName)}
                      title={`View ${displayName}'s profile`}
                    >
                      {displayName}
                    </button>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {displayName}
                    </span>
                  )
                })()}
                <span
                  className={`text-[10px] uppercase tracking-wide ${
                    isOwnMessage
                      ? 'text-[color:color-mix(in srgb, var(--color-white) 80%, transparent)]'
                      : 'text-muted'
                  }`}
                >
                  {timestampLabel}
                </span>
              </div>

              <div className="break-words">
                {isDeleted ? <span className="text-sm italic">Message deleted</span> : message.body}
              </div>

              {!isDeleted && linkPreviews.length > 0 && (
                <div className="mt-2 space-y-2">
                  {linkPreviews.map((preview, index) => (
                    <LinkPreviewComponent
                      key={`${message.id}-preview-${index}`}
                      preview={preview}
                      isOwnMessage={isOwnMessage}
                    />
                  ))}
                </div>
              )}

              {!isDeleted && message.editedAt && (
                <div
                  className={`text-[11px] mt-1 flex items-center gap-2 ${
                    isOwnMessage
                      ? 'text-[color:color-mix(in srgb, var(--color-white) 80%, transparent)]'
                      : 'text-muted'
                  }`}
                >
                  <span className="italic">edited</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
