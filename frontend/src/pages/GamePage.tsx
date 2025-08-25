import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SimpleRiskGameBoard } from '../components/SimpleRiskGameBoard';

const GamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const [activeTab, setActiveTab] = useState<'board' | 'chat' | 'history' | 'stats'>('board');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Mock game data
  const gameData = {
    id: gameId,
    name: 'World Conquest',
    currentPlayer: 'You',
    phase: 'ATTACK' as const,
    turn: 12,
    players: [
      { id: '1', name: 'You', color: '#3b82f6', territories: 18, armies: 45 },
      { id: '2', name: 'Player 2', color: '#ef4444', territories: 12, armies: 32 },
      { id: '3', name: 'Player 3', color: '#10b981', territories: 8, armies: 24 },
      { id: '4', name: 'Player 4', color: '#f59e0b', territories: 4, armies: 16 }
    ]
  };

  // Full-screen toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  return (
    <div className={`${isFullScreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-screen'}`}>
      {/* Game Header - Minimal when full-screen */}
      <div className={`bg-gray-900 border-b border-gray-700 ${isFullScreen ? 'h-12' : 'h-16'}`}>
        <div className="container mx-auto px-4 h-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            {!isFullScreen && (
              <Link to="/games/active" className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                ← My Games
              </Link>
            )}
            <div>
              <h1 className={`font-bold ${isFullScreen ? 'text-lg' : 'text-xl'}`}>
                {gameData.name}
              </h1>
              {!isFullScreen && (
                <p className="text-sm text-gray-400">Turn {gameData.turn} • {gameData.currentPlayer}'s turn</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Game Navigation - Only show in full-screen */}
            {isFullScreen && (
              <div className="flex gap-1">
                <button 
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'board' ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setActiveTab('board')}
                >
                  Board
                </button>
                <button 
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'chat' ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setActiveTab('chat')}
                >
                  Chat
                </button>
                <button 
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'stats' ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setActiveTab('stats')}
                >
                  Stats
                </button>
              </div>
            )}

            {/* Game Actions */}
            <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">⚙️</button>
            <button 
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={toggleFullScreen}
            >
              {isFullScreen ? '🗗' : '🗖'}
            </button>
            <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">🏳️</button>
          </div>
        </div>
      </div>

      {/* Game Content */}
      <div className="flex h-full">
        {/* Sidebar - Only show when not full-screen */}
        {!isFullScreen && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-700">
              <button 
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'board' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveTab('board')}
              >
                Board
              </button>
              <button 
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button 
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'stats' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveTab('stats')}
              >
                Stats
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 p-4">
              {activeTab === 'board' && (
                <div>
                  <h3 className="font-bold mb-4">Game Controls</h3>
                  <div className="space-y-3">
                    <div className="text-center p-3 bg-blue-600 rounded">
                      <div className="font-bold">ATTACK PHASE</div>
                      <div className="text-sm">Click territories to attack</div>
                    </div>
                    <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">End Attack Phase</button>
                    <button className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors">View Help</button>
                  </div>
                </div>
              )}

              {activeTab === 'chat' && (
                <div>
                  <h3 className="font-bold mb-4">Game Chat</h3>
                  <div className="text-center text-gray-400 py-8">
                    <div className="text-4xl mb-2">💬</div>
                    <p>Chat system will be implemented here</p>
                  </div>
                </div>
              )}

              {activeTab === 'stats' && (
                <div>
                  <h3 className="font-bold mb-4">Live Statistics</h3>
                  <div className="space-y-3">
                    {gameData.players.map(player => (
                      <div key={player.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: player.color }}
                          ></div>
                          <span className="font-medium">{player.name}</span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {player.territories} territories
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Game Area */}
        <div className="flex-1 relative">
          {/* Game Board */}
          <div className="h-full relative overflow-hidden">
            <SimpleRiskGameBoard 
              onTerritoryClick={(territoryId) => {
                console.log('Territory clicked:', territoryId);
              }}
            />
            
            {/* Full-screen overlay content */}
            {isFullScreen && activeTab !== 'board' && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                  {activeTab === 'chat' && (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Game Chat</h3>
                      <div className="text-center text-gray-400 py-8">
                        <div className="text-4xl mb-2">💬</div>
                        <p>Chat system will be implemented here</p>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'stats' && (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Live Statistics</h3>
                      <div className="space-y-3">
                        {gameData.players.map(player => (
                          <div key={player.id} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-6 h-6 rounded-full"
                                style={{ backgroundColor: player.color }}
                              ></div>
                              <span className="font-medium">{player.name}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                              {player.territories} territories
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamePage;