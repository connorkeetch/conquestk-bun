import { useState, useRef, useEffect } from 'react'

interface ReactionPickerProps {
  onReact: (emoji: string) => void
  onClose: () => void
  position?: { x: number; y: number }
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏']

export default function ReactionPicker({ onReact, onClose, position }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleReaction = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  return (
    <div
      ref={pickerRef}
      className="absolute z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl"
      style={position ? { left: position.x, top: position.y } : {}}
    >
      <div className="grid grid-cols-4 gap-1">
        {QUICK_REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-700 rounded transition-colors"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}