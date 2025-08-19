import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gameService, GameRoom } from '../services/gameService';

const GameListPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'spectate'>('active');
  const [userGames, setUserGames] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserGames();
  }, []);

  const loadUserGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await gameService.getUserGames();
      setUserGames(response.rooms || []);
    } catch (err: any) {
      console.error('Error loading user games:', err);
      setError('Failed to load your games');
    } finally {
      setLoading(false);
    }
  };

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'text-yellow-400';
      case 'active': return 'text-green-400';
      case 'completed': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const activeGames = userGames.filter(game => game.status === 'waiting' || game.status === 'active');
  const completedGames = userGames.filter(game => game.status === 'completed');

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
          <button 
            onClick={loadUserGames}
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-red-400">❌</span>
              <span className="text-red-400">{error}</span>
            </div>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        </div>
      )}

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
          {activeGames.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
              {activeGames.length}
            </span>
          )}
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
            {loading ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-lg">Loading your games...</p>
              </div>
            ) : activeGames.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-6xl mb-4">🎮</div>
                <p className="text-lg mb-2">No active games</p>
                <p className="text-sm mb-6">Create or join a game to get started!</p>
                <Link to="/lobby" className="btn btn-primary">
                  🎮 Find Games
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {activeGames.map((game) => (
                  <div key={game.id} className="card">
                    <div className="card-header">
                      <div className="flex-1">
                        <h3 className="card-title">{game.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span>{game.currentPlayers}/{game.maxPlayers} players</span>
                          {game.mapName && <span>• {game.mapName}</span>}
                          <span className={getGameStatusColor(game.status)}>
                            • {game.status}
                          </span>
                          <span>• Updated {formatTimeAgo(game.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className={`text-lg font-bold ${getGameStatusColor(game.status)}`}>
                            {game.status === 'waiting' ? 'Waiting for Players' : 
                             game.status === 'active' ? 'Game in Progress' : 
                             game.status}
                          </div>
                          <div className="text-sm text-gray-400">
                            Created {formatTimeAgo(game.createdAt)}
                          </div>
                        </div>
                        <Link 
                          to={`/room/${game.id}`}
                          className={`btn ${
                            game.status === 'waiting' ? 'btn-primary' : 'btn-secondary'
                          }`}
                        >
                          {game.status === 'waiting' ? '🎮 Enter Lobby' : '👁️ View Game'}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'completed' && (
          <div>
            {loading ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-lg">Loading completed games...</p>
              </div>
            ) : completedGames.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-6xl mb-4">📚</div>
                <p className="text-lg">No completed games yet</p>
                <p className="text-sm mt-2">Your game history will appear here once you finish games</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {completedGames.map((game) => (
                  <div key={game.id} className="card opacity-75">
                    <div className="card-header">
                      <div className="flex-1">
                        <h3 className="card-title">{game.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span>{game.currentPlayers}/{game.maxPlayers} players</span>
                          {game.mapName && <span>• {game.mapName}</span>}
                          <span className="text-blue-400">• Completed</span>
                          <span>• Finished {formatTimeAgo(game.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-400">
                            Game Completed
                          </div>
                          <div className="text-sm text-gray-400">
                            Duration: {formatTimeAgo(game.createdAt)}
                          </div>
                        </div>
                        <Link 
                          to={`/room/${game.id}`}
                          className="btn btn-ghost text-sm"
                        >
                          📊 View Results
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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