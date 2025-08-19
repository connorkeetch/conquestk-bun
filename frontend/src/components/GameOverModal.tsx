import React from 'react';
import { GamePlayer } from '../types/game';

interface GameOverModalProps {
  isOpen: boolean;
  winner: GamePlayer | null;
  eliminatedPlayers: string[];
  onClose: () => void;
  onNewGame?: () => void;
  onBackToMenu?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winner,
  eliminatedPlayers,
  onClose,
  onNewGame,
  onBackToMenu
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden">
        {/* Header */}
        <div className={`p-6 text-center ${
          winner ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 'bg-gradient-to-r from-gray-600 to-gray-700'
        }`}>
          <div className="text-6xl mb-4">
            {winner ? '🏆' : '🏳️'}
          </div>
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
              <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-lg`}
                   style={{ backgroundColor: winner.color }}>
                {winner.username.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Champion: {winner.username}
              </h3>
              <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
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
              <h4 className="font-semibold text-gray-300 mb-3 text-center">
                Players Eliminated This Turn
              </h4>
              <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
                <div className="flex flex-wrap gap-2 justify-center">
                  {eliminatedPlayers.map(playerId => (
                    <div key={playerId} className="bg-red-800/50 text-red-300 px-3 py-1 rounded-full text-sm">
                      Player eliminated
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game Statistics */}
          <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-gray-300 mb-3 text-center">Game Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm text-center">
              <div>
                <div className="font-medium text-gray-400">Duration</div>
                <div className="text-gray-200">Epic Battle</div>
              </div>
              <div>
                <div className="font-medium text-gray-400">Final Turn</div>
                <div className="text-gray-200">Turn Complete</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onNewGame && (
              <button 
                onClick={onNewGame}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
              >
                🎮 New Game
              </button>
            )}
            {onBackToMenu && (
              <button 
                onClick={onBackToMenu}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
              >
                🏠 Back to Menu
              </button>
            )}
            <button 
              onClick={onClose}
              className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              📊 View Final Board
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};