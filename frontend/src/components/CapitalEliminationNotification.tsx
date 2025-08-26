import type React from 'react'
import { useEffect } from 'react'

interface CapitalEliminationNotificationProps {
  conquerorName: string
  conquerorColor: string
  eliminatedName: string
  eliminatedColor: string
  capitalName: string
  territoriesGained: number
  troopsGained: number
  onClose: () => void
}

const CapitalEliminationNotification: React.FC<CapitalEliminationNotificationProps> = ({
  conquerorName,
  conquerorColor,
  eliminatedName,
  eliminatedColor,
  capitalName,
  territoriesGained,
  troopsGained,
  onClose,
}) => {
  useEffect(() => {
    // Auto-close after 8 seconds
    const timer = setTimeout(onClose, 8000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slideDown">
      <div className="bg-gradient-to-br from-gray-900 via-red-900/50 to-gray-900 border-2 border-red-500 rounded-xl p-6 shadow-2xl min-w-[400px]">
        {/* Header with crown animation */}
        <div className="text-center mb-4">
          <div className="inline-block animate-bounce">
            <span className="text-5xl">👑</span>
          </div>
          <h2 className="text-2xl font-bold text-red-400 mt-2">CAPITAL ELIMINATION!</h2>
        </div>

        {/* Elimination details */}
        <div className="bg-black/40 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: conquerorColor }} />
              <span className="text-white font-bold">{conquerorName}</span>
            </div>
            <span className="text-gray-400">⚔️ CONQUERED ⚔️</span>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full opacity-50 line-through"
                style={{ backgroundColor: eliminatedColor }}
              />
              <span className="text-gray-500 line-through">{eliminatedName}</span>
            </div>
          </div>

          <div className="text-center text-yellow-400 font-semibold">Capital: {capitalName}</div>
        </div>

        {/* Gains */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-green-900/30 border border-green-600 rounded-lg p-3 text-center">
            <div className="text-green-400 text-2xl font-bold">{territoriesGained}</div>
            <div className="text-green-300 text-sm">Territories Gained</div>
          </div>
          <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-3 text-center">
            <div className="text-blue-400 text-2xl font-bold">{troopsGained}</div>
            <div className="text-blue-300 text-sm">Troops Gained</div>
          </div>
        </div>

        {/* Dramatic message */}
        <div className="text-center">
          <p className="text-gray-300 text-sm italic">
            "{eliminatedName}'s empire has fallen to {conquerorName}!"
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default CapitalEliminationNotification
