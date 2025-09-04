import { useState, useRef, useEffect, KeyboardEvent } from 'react'

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
  maxLength = 500
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
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
  }, [message])
  
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
  
  const charactersRemaining = maxLength - message.length
  const isNearLimit = charactersRemaining < 50
  
  return (
    <div className="border-t border-gray-700 p-3 bg-gray-800 rounded-b-lg">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            rows={1}
            style={{
              minHeight: '40px',
              maxHeight: '120px',
              overflow: 'auto'
            }}
          />
          {isNearLimit && (
            <span className={`absolute right-2 bottom-2 text-xs ${
              charactersRemaining < 20 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {charactersRemaining}
            </span>
          )}
        </div>
        
        <button
          onClick={handleSend}
          disabled={message.trim().length === 0}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            message.trim().length > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Send
        </button>
      </div>
      
      {/* Hint text */}
      <div className="mt-1 text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  )
}