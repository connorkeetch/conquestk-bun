import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

interface MessageInputProps {
  onSendMessage: (message: string) => void
  onTyping?: (isTyping: boolean) => void
  placeholder?: string
  maxLength?: number
}

export default function MessageInput({
  onSendMessage,
  onTyping,
  placeholder = 'Type a message...',
  maxLength = 500,
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)

  // Handle typing indicator
  useEffect(() => {
    if (message.length > 0 && !isTyping) {
      setIsTyping(true)
      onTyping?.(true)
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set new timeout to stop typing indicator
    if (message.length > 0) {
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false)
        onTyping?.(false)
      }, 1000)
    } else if (isTyping) {
      setIsTyping(false)
      onTyping?.(false)
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [message, isTyping, onTyping])

  const handleSend = () => {
    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) return

    onSendMessage(trimmedMessage)
    setMessage('')

    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false)
      onTyping?.(false)
    }

    // Keep focus on input
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const newMessage = message + emojiData.emoji
    setMessage(newMessage.slice(0, maxLength))
    setShowEmojiPicker(false)
    inputRef.current?.focus()
  }

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(e.target as Node)
      ) {
        // Check if click is inside emoji picker
        const emojiPicker = document.querySelector('.EmojiPickerReact')
        if (emojiPicker && !emojiPicker.contains(e.target as Node)) {
          setShowEmojiPicker(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker])

  const charactersRemaining = maxLength - message.length
  const isNearLimit = charactersRemaining < 50

  return (
    <div className="border-t border-border p-3 bg-surface-1 rounded-b-lg relative">
      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-0 mb-2 z-50">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme="dark"
            height={350}
            width={300}
            searchDisabled={false}
            skinTonesDisabled={false}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <div className="flex items-end gap-1">
            <button
              ref={emojiButtonRef}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 hover:bg-gray-600 rounded-lg transition-colors text-xl"
              title="Add emoji"
              type="button"
            >
              😊
            </button>
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 px-3 py-2 bg-surface-2 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary placeholder-gray-400"
              rows={1}
              style={{
                minHeight: '40px',
                maxHeight: '120px',
                overflow: 'auto',
              }}
            />
          </div>
          {isNearLimit && (
            <span
              className={`absolute right-2 bottom-2 text-xs ${
                charactersRemaining < 20 ? 'text-red-400' : 'text-yellow-400'
              }`}
            >
              {charactersRemaining}
            </span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={message.trim().length === 0}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            message.trim().length > 0
              ? 'bg-primary hover:bg-primary text-white'
              : 'bg-surface-2 text-muted cursor-not-allowed'
          }`}
          type="button"
        >
          Send
        </button>
      </div>

      {/* Hint text */}
      <div className="mt-1 text-xs text-muted">Press Enter to send, Shift+Enter for new line</div>
    </div>
  )
}
