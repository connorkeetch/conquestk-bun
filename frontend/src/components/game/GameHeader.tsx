import type React from 'react'

interface GameHeaderProps {
  currentPhase: string
  turn: number
  currentPlayerInfo?: {
    id: string
    username: string
    color: string
    troops?: number
  }
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  currentPhase,
  turn,
  currentPlayerInfo,
}) => {
  return (
    <div className="bg-blue-900 text-white p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Risk Game Board</h2>
          <div className="text-sm opacity-75 mt-1">
            Phase: {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} | Turn: {turn}
          </div>
        </div>
        {currentPlayerInfo && (
          <div className="flex items-center space-x-2">
            <span>Current Turn:</span>
            <div
              className="w-3 h-3 rounded-full border border-white"
              style={{ backgroundColor: currentPlayerInfo.color }}
            ></div>
            <span className="font-semibold">{currentPlayerInfo.username}</span>
            <span className="text-sm opacity-75">
              ({currentPlayerInfo.troops ?? 0} troops to deploy)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
