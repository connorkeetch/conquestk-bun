import type { ChatMessage } from '../../store/chatSlice'

interface MessageListProps {
  messages: ChatMessage[]
  currentUserId: string
}

export default function MessageList({ messages, currentUserId }: MessageListProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isOwnMessage = message.sender_id === currentUserId
        const isDeleted = !!message.deleted_at
        
        return (
          <div
            key={message.id}
            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                isOwnMessage 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-200'
              } ${isDeleted ? 'opacity-50 italic' : ''}`}
            >
              {/* Username for other users */}
              {!isOwnMessage && message.sender_username && (
                <div className="text-xs font-semibold mb-1 opacity-80">
                  {message.sender_username}
                </div>
              )}
              
              {/* Message content */}
              <div className="break-words">
                {isDeleted ? (
                  <span className="text-sm italic">Message deleted</span>
                ) : (
                  message.message
                )}
              </div>
              
              {/* Timestamp and edit indicator */}
              <div className={`text-xs mt-1 flex items-center gap-2 ${
                isOwnMessage ? 'text-blue-200' : 'text-gray-400'
              }`}>
                <span>{formatTime(message.created_at)}</span>
                {message.edited_at && !isDeleted && (
                  <span className="italic">(edited)</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}