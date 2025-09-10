interface Reaction {
  emoji: string
  users: { id: string; username: string }[]
  count: number
}

interface MessageReactionsProps {
  reactions: Reaction[]
  currentUserId: string
  onReact: (emoji: string) => void
  onRemoveReaction: (emoji: string) => void
}

export default function MessageReactions({
  reactions,
  currentUserId,
  onReact,
  onRemoveReaction,
}: MessageReactionsProps) {
  if (!reactions || reactions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {reactions.map(reaction => {
        const hasReacted = reaction.users.some(user => user.id === currentUserId)
        
        return (
          <button
            key={reaction.emoji}
            onClick={() => hasReacted ? onRemoveReaction(reaction.emoji) : onReact(reaction.emoji)}
            className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-all ${
              hasReacted
                ? 'bg-primary text-white hover:bg-primary'
                : 'bg-surface-2 text-gray-200 hover:bg-gray-600'
            }`}
            title={reaction.users.map(u => u.username).join(', ')}
          >
            <span>{reaction.emoji}</span>
            <span className="text-xs font-medium">{reaction.count}</span>
          </button>
        )
      })}
    </div>
  )
}