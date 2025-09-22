import { useEffect, useState } from 'react'
import audioService from '../services/audioService'

export default function MuteButton() {
  const [isMuted, setIsMuted] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Check initial mute state
    setIsMuted(audioService.isMutedState())
  }, [])

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(!isMuted)
  }

  return (
    <button
      type="button"
      onClick={handleToggleMute}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed top-4 right-4 z-50 p-3 bg-slate-800/90 hover:bg-slate-700 backdrop-blur-sm border border-slate-600 rounded-full transition-all hover:scale-110 group"
      title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
      aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
    >
      {/* Speaker Icon */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-colors ${isMuted ? 'text-red-400' : 'text-green-400'}`}
        aria-hidden="true"
      >
        <title>{isMuted ? 'Audio muted' : 'Audio playing'}</title>
        {isMuted ? (
          <>
            {/* Muted Speaker */}
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            {/* Active Speaker with Sound Waves */}
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path
              d="M19.07 4.93a10 10 0 0 1 0 14.14"
              className={isHovered ? 'animate-pulse' : ''}
            />
            <path
              d="M15.54 8.46a5 5 0 0 1 0 7.07"
              className={isHovered ? 'animate-pulse animation-delay-150' : ''}
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="font-semibold">{isMuted ? 'Audio Muted' : 'Audio Enabled'}</div>
          <div className="text-xs text-muted mt-1">Click to {isMuted ? 'unmute' : 'mute'}</div>
          {/* Arrow pointing up */}
          <div className="absolute -top-1 right-4 w-2 h-2 bg-slate-900 transform rotate-45" />
        </div>
      )}

      {/* Visual feedback ring */}
      {isMuted && (
        <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping pointer-events-none" />
      )}
    </button>
  )
}
