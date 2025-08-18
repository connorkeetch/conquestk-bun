import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const GameListPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'spectate'>('active');

  const mockActiveGames = [
    {
      id: 'game1',
      name: 'World Conquest',
      turn: 'Your Turn',
      players: 4,
      map: 'Classic World',
      timeLeft: '2h 15m',
      status: 'active'
    },
    {
      id: 'game2', 
      name: 'European Theater',
      turn: 'Player 3',
      players: 6,
      map: 'Europe',
      timeLeft: '45m',
      status: 'waiting'
    }
  ];

  return (
    <div className="container mx-auto px-8 py-8">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">My Games</h1>
          <p className="text-gray-400">Manage your active and completed games</p>
        </div>
        <div className="flex gap-3">
          <Link to="/lobby" className="btn btn-primary">
            🎮 New Game
          </Link>
          <button className="btn btn-secondary">
            📊 Statistics
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-700">
        <button 
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeTab === 'active' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('active')}
        >
          ⚡ Active Games
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            2
          </span>
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'completed' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('completed')}
        >
          ✅ Completed
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'spectate' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('spectate')}
        >
          👁️ Spectate
        </button>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'active' && (
          <div>
            <div className="grid gap-4">
              {mockActiveGames.map((game) => (
                <div key={game.id} className="card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">{game.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {game.players} players • {game.map}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className={`text-lg font-bold ${
                          game.turn === 'Your Turn' ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {game.turn}
                        </div>
                        <div className="text-sm text-gray-400">{game.timeLeft} left</div>
                      </div>
                      <Link 
                        to={`/game/${game.id}`}
                        className={`btn ${
                          game.turn === 'Your Turn' ? 'btn-primary' : 'btn-secondary'
                        }`}
                      >
                        {game.turn === 'Your Turn' ? '⚡ Take Turn' : '👁️ Spectate'}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="text-center text-gray-400 py-16">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-lg">Completed games history will be implemented here</p>
            <p className="text-sm mt-2">This will show match results, statistics, and replay options</p>
          </div>
        )}

        {activeTab === 'spectate' && (
          <div className="text-center text-gray-400 py-16">
            <div className="text-6xl mb-4">👁️</div>
            <p className="text-lg">Live game spectating will be implemented here</p>
            <p className="text-sm mt-2">This will show public games you can watch</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameListPage;