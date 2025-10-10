import { useEffect, useEffectEvent, useRef } from 'react'

interface ReactionPickerProps {
  onReact: (emoji: string) => void
  onClose: () => void
  position?: { x: number; y: number }
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏']

export default function ReactionPicker({ onReact, onClose, position }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  const onOutside = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onOutside()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on Escape key
  const onEscape = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const handleReaction = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  return (
    <div
      ref={pickerRef}
      className="absolute z-50 bg-surface-1 border border-border rounded-lg p-2 shadow-xl"
      style={position ? { left: position.x, top: position.y } : {}}
    >
      <div className="grid grid-cols-4 gap-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="w-10 h-10 flex items-center justify-center text-xl hover:bg-surface-2 rounded transition-colors"
            title={`React with ${emoji}`}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
