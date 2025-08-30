import React from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'

interface GameErrorBoundaryProps {
  children: React.ReactNode
  gameId?: string
}

const GameErrorFallback: React.FC<{ gameId?: string; resetError: () => void }> = ({ 
  gameId, 
  resetError 
}) => {
  const navigate = useNavigate()

  const handleLeaveGame = () => {
    // Clear any game state from localStorage
    if (gameId) {
      localStorage.removeItem(`game_${gameId}_state`)
    }
    navigate('/lobby')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-black">
      <div className="text-center p-8 bg-red-900/20 border border-red-500/30 rounded-lg max-w-lg">
        <div className="text-6xl mb-4">🎮💥</div>
        <h2 className="text-2xl font-bold text-red-400 mb-4">
          Game Error
        </h2>
        <p className="text-white/80 mb-6">
          The game encountered an unexpected error. You can try to rejoin or return to the lobby.
        </p>
        
        <div className="space-y-3">
          <button
            onClick={resetError}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Try to Rejoin Game
          </button>
          
          <button
            onClick={handleLeaveGame}
            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Return to Lobby
          </button>
        </div>

        {gameId && (
          <p className="text-sm text-gray-400 mt-4">
            Game ID: {gameId}
          </p>
        )}
      </div>
    </div>
  )
}

export const GameErrorBoundary: React.FC<GameErrorBoundaryProps> = ({ children, gameId }) => {
  const [resetKey, setResetKey] = React.useState(0)

  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log game-specific errors
    console.error('[GAME_ERROR]', {
      gameId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    })

    // Could send to analytics/monitoring service here
  }

  const resetError = () => {
    setResetKey(prev => prev + 1)
  }

  return (
    <ErrorBoundary
      key={resetKey}
      level="page"
      onError={handleError}
      fallback={<GameErrorFallback gameId={gameId} resetError={resetError} />}
    >
      {children}
    </ErrorBoundary>
  )
}

export default GameErrorBoundary