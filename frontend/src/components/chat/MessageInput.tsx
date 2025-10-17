import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react'
import {
  type KeyboardEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react'
import { useAppSelector } from '@/hooks/redux'

const loadEmojiPicker = () => import('emoji-picker-react')
const EmojiPicker = lazy(async () => {
  const module = await loadEmojiPicker()
  return { default: module.default }
})

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
  const [emojiPickerPrimed, setEmojiPickerPrimed] = useState(false)
  const pickerId = useId()
  const typingTimeoutRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const profanityFilter = useAppSelector((s) => Boolean(s.settings?.chat?.profanityFilter))

  // Handle typing indicator
  useEffect(() => {
    if (message.length > 0 && !isTyping) {
      setIsTyping(true)
      onTyping?.(true)
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
    }

    // Set new timeout to stop typing indicator
    if (message.length > 0) {
      typingTimeoutRef.current = window.setTimeout(() => {
        setIsTyping(false)
        onTyping?.(false)
      }, 1000)
    } else if (isTyping) {
      setIsTyping(false)
      onTyping?.(false)
    }

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [message, isTyping, onTyping])

  const maskProfanity = (text: string) => {
    if (!profanityFilter) return text
    const bad = ['fuck', 'shit', 'bitch', 'asshole', 'cunt']
    let out = text
    for (const word of bad) {
      const re = new RegExp(`\\b${word}\\b`, 'gi')
      out = out.replace(re, '*'.repeat(word.length))
    }
    return out
  }

  const handleSend = () => {
    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) return

    onSendMessage(maskProfanity(trimmedMessage))
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

  // Close emoji picker when clicking outside using Effect Event
  const closeEmojiPicker = useEffectEvent(() => {
    setShowEmojiPicker(false)
  })
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(e.target as Node)
      ) {
        const emojiPicker = document.querySelector('.EmojiPickerReact')
        if (emojiPicker && !emojiPicker.contains(e.target as Node)) {
          closeEmojiPicker()
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker, closeEmojiPicker])

  // Prime the emoji picker in the background so the heavy render happens off the user's critical path.
  useEffect(() => {
    if (emojiPickerPrimed) return
    if (typeof window === 'undefined') return

    let timeoutId: number | null = null
    let idleId: number | null = null
    const win = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }

    const prime = () => {
      void loadEmojiPicker()
      setEmojiPickerPrimed(true)
    }
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(prime, { timeout: 1200 })
    } else {
      timeoutId = window.setTimeout(prime, 400)
    }

    return () => {
      if (idleId != null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [emojiPickerPrimed])

  useEffect(() => {
    if (showEmojiPicker && !emojiPickerPrimed) {
      void loadEmojiPicker()
      setEmojiPickerPrimed(true)
    }
  }, [showEmojiPicker, emojiPickerPrimed])

  const handleToggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((prev) => !prev)
    if (!emojiPickerPrimed) {
      void loadEmojiPicker()
      setEmojiPickerPrimed(true)
    }
  }, [emojiPickerPrimed])

  const charactersRemaining = maxLength - message.length
  const isNearLimit = charactersRemaining < 50

  return (
    <div className="border-t border-border p-3 bg-surface-1 rounded-b-lg relative">
      {/* Emoji Picker Popup */}
      {emojiPickerPrimed ? (
        <div
          id={pickerId}
          className={`absolute bottom-full left-0 mb-2 z-50 transition duration-150 ease-out ${
            showEmojiPicker
              ? 'opacity-100 pointer-events-auto translate-y-0'
              : 'opacity-0 pointer-events-none translate-y-1'
          }`}
          aria-hidden={!showEmojiPicker}
        >
          <Suspense
            fallback={
              <div className="rounded-lg border border-border bg-surface-2/90 px-4 py-2 text-sm text-muted shadow-lg">
                Loading emoji…
              </div>
            }
          >
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              theme={'dark' as Theme}
              emojiStyle={'native' as EmojiStyle}
              height={320}
              width={280}
              searchDisabled={false}
              skinTonesDisabled={false}
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              autoFocusSearch={false}
            />
          </Suspense>
        </div>
      ) : null}
      {showEmojiPicker && !emojiPickerPrimed && (
        <div className="absolute bottom-full left-0 mb-2 z-40">
          <div className="rounded-lg border border-border bg-surface-2/90 px-4 py-2 text-sm text-muted shadow-lg">
            Loading emoji…
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <div className="flex items-end gap-1">
            <button
              ref={emojiButtonRef}
              onClick={handleToggleEmojiPicker}
              className="p-2 hover:bg-[color:var(--hover-bg)] rounded-lg transition-colors text-xl"
              title="Add emoji"
              type="button"
              aria-expanded={showEmojiPicker}
              aria-controls={pickerId}
            >
              😊
            </button>
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 px-3 py-2 bg-surface-2 text-[color:var(--text)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary placeholder-[color:var(--color-text-muted)]"
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
              ? 'bg-primary hover:bg-primary text-[color:var(--color-white)]'
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
