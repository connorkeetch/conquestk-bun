import type React from 'react'
import { useEffect } from 'react'
import type { GamePlayer } from '../types/game'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useAppSelector } from '../hooks/redux'

interface GameOverModalProps {
  isOpen: boolean
  winner: GamePlayer | null
  eliminatedPlayers: string[]
  onClose: () => void
  onNewGame?: () => void
  onBackToMenu?: () => void
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winner,
  eliminatedPlayers,
  onClose,
  onNewGame,
  onBackToMenu,
}) => {
  const guntsPrescriptions = useFeatureFlag('gunts_prescriptions')
  const currentUserId = useAppSelector((state) => state.auth.user?.id)
  const isCurrentUserLoser = winner && winner.id !== currentUserId
  
  // Victory state effect system
  useEffect(() => {
    if (isOpen && winner) {
      document.documentElement.setAttribute('data-theme', 'victory')
      
      // Remove after 5 seconds
      const timer = setTimeout(() => {
        document.documentElement.removeAttribute('data-theme')
      }, 5000)
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, winner])
  
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden">
        {/* Header */}
        <div
          className={`p-6 text-center ${
            winner
              ? 'bg-gradient-to-r from-gold to-violet animate-victory-pulse'
              : 'bg-gradient-to-r from-surface-2 to-surface-1'
          }`}
        >
          <div className="text-6xl mb-4">{winner ? '🏆' : '🏳️'}</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {winner ? 'Victory!' : 'Game Over'}
          </h2>
          <p className="text-white/90">
            {winner ? `${winner.username} conquers the world!` : 'All players have been eliminated'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {winner && (
            <div className="text-center mb-6">
              <div
                className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-lg`}
                style={{ backgroundColor: winner.color }}
              >
                {winner.username.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Champion: {winner.username}</h3>
              <div className="bg-warning-soft border border-yellow-600/50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-yellow-300">Final Territories:</span>
                    <div className="text-yellow-200">{winner.territories.length}</div>
                  </div>
                  <div>
                    <span className="font-medium text-yellow-300">Total Armies:</span>
                    <div className="text-yellow-200">{winner.armies}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {eliminatedPlayers.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-muted mb-3 text-center">
                Players Eliminated This Turn
              </h4>
              <div className="bg-danger-soft border border-red-600/50 rounded-lg p-4">
                <div className="flex flex-wrap gap-2 justify-center">
                  {eliminatedPlayers.map((playerId) => (
                    <div
                      key={playerId}
                      className="bg-red-800/50 text-red-300 px-3 py-1 rounded-full text-sm"
                    >
                      Player eliminated
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Gunt's Prescription - Loss Message */}
          {guntsPrescriptions && isCurrentUserLoser && (
            <div className="bg-danger-soft border-2 border-red-600/50 rounded-lg p-6 mb-6">
              <div className="text-center">
                <h4 className="text-xl font-bold text-red-400 mb-4">
                  💊 Dr. Gunt's Prescription 💊
                </h4>
                <p className="text-red-300 mb-4 text-lg">
                  "Take these L's and get better!"
                </p>
                <div className="flex justify-center gap-3 mb-4">
                  {/* Pill graphics with L's */}
                  <div className="bg-red-600 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform rotate-12">
                    L
                  </div>
                  <div className="bg-red-500 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform -rotate-6">
                    L
                  </div>
                  <div className="bg-red-600 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform rotate-6">
                    L
                  </div>
                </div>
                <p className="text-red-200 text-sm italic">
                  Side effects may include: improved strategy, better dice rolls, 
                  and an overwhelming desire to rematch.
                </p>
              </div>
            </div>
          )}

          {/* Game Statistics */}
          <div className="bg-surface-2/50 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-muted mb-3 text-center">Game Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm text-center">
              <div>
                <div className="font-medium text-muted">Duration</div>
                <div className="text-gray-200">Epic Battle</div>
              </div>
              <div>
                <div className="font-medium text-muted">Final Turn</div>
                <div className="text-gray-200">Turn Complete</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onNewGame && (
              <button
                onClick={onNewGame}
                className="flex-1 bg-primary hover:brightness-110 text-white py-3 px-4 rounded-lg font-semibold transition-all"
              >
                🎮 New Game
              </button>
            )}
            {onBackToMenu && (
              <button
                onClick={onBackToMenu}
                className="flex-1 bg-surface-2 hover:brightness-110 text-text py-3 px-4 rounded-lg font-semibold transition-all"
              >
                🏠 Back to Menu
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 bg-surface-1 hover:brightness-110 text-text py-3 px-4 rounded-lg font-semibold transition-all border border-border"
            >
              📊 View Final Board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
