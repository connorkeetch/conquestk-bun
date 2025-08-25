import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gameService, GameRoom } from '../services/gameService';

const LobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'browse' | 'private' | 'tournaments'>('browse');
  const [publicGames, setPublicGames] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateGameCode, setPrivateGameCode] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    showFull: true,
    showInProgress: true,
    minPlayers: 2,
    maxPlayers: 12
  });

  useEffect(() => {
    if (activeTab === 'browse') {
      loadPublicGames();
    }
  }, [activeTab]);

  const loadPublicGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await gameService.getPublicGames();
      setPublicGames(response.rooms || []);
    } catch (err: any) {
      console.error('Error loading public games:', err);
      setError('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (roomId: string) => {
    try {
      const response = await gameService.joinRoom(roomId);
      if (response.room) {
        navigate(`/room/${roomId}`);
      }
    } catch (err: any) {
      console.error('Error joining game:', err);
      setError('Failed to join game: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleJoinPrivateGame = async () => {
    const trimmedCode = privateGameCode.trim().toUpperCase();
    
    if (!trimmedCode) {
      setError('Please enter a game code');
      return;
    }

    if (trimmedCode.length < 4) {
      setError('Game code must be at least 4 characters');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      
      // Try to join the room with the provided code
      const response = await gameService.joinRoom(trimmedCode);
      if (response.room) {
        navigate(`/room/${trimmedCode}`);
      }
    } catch (err: any) {
      console.error('Error joining private game:', err);
      
      // Provide specific error messages based on the error
      if (err.response?.status === 404) {
        setError(`No game found with code "${trimmedCode}". Please check the code and try again.`);
      } else if (err.response?.status === 403) {
        setError('This game is full or already started.');
      } else if (err.response?.status === 401) {
        setError('You need to be logged in to join games.');
      } else {
        setError(err.response?.data?.message || 'Failed to join game. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'text-green-400';
      case 'active': return 'text-yellow-400';
      case 'completed': return 'text-gray-400';
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

  return (
    <div className="container mx-auto px-8 py-8">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Game Lobby</h1>
          <p className="text-gray-400">Find and join games, or create your own</p>
        </div>
        <div className="flex gap-3">
          <Link to="/create" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
            🎮 Create Game
          </Link>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            🔍 Filter Games
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Filter Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="flex items-center space-x-2 text-white">
                <input
                  type="checkbox"
                  checked={filters.showFull}
                  onChange={(e) => setFilters(prev => ({ ...prev, showFull: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Show Full Games</span>
              </label>
            </div>
            <div>
              <label className="flex items-center space-x-2 text-white">
                <input
                  type="checkbox"
                  checked={filters.showInProgress}
                  onChange={(e) => setFilters(prev => ({ ...prev, showInProgress: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Show In Progress</span>
              </label>
            </div>
            <div>
              <label className="block text-white mb-1">
                <span className="text-sm">Min Players</span>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={filters.minPlayers}
                  onChange={(e) => setFilters(prev => ({ ...prev, minPlayers: parseInt(e.target.value) || 2 }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
            <div>
              <label className="block text-white mb-1">
                <span className="text-sm">Max Players</span>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={filters.maxPlayers}
                  onChange={(e) => setFilters(prev => ({ ...prev, maxPlayers: parseInt(e.target.value) || 12 }))}
                  className="w-full mt-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-700">
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'browse' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('browse')}
        >
          🌍 Browse Public Games
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'private' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('private')}
        >
          🔒 Join Private Game
        </button>
        <button 
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'tournaments' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('tournaments')}
        >
          🏆 Tournaments
        </button>
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

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'browse' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Public Games</h2>
              <button 
                onClick={loadPublicGames}
                disabled={loading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {loading ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-lg">Loading games...</p>
              </div>
            ) : publicGames.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-6xl mb-4">🎲</div>
                <p className="text-lg mb-2">No public games available</p>
                <p className="text-sm mb-6">Be the first to create a game for others to join!</p>
                <Link to="/create" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-block">
                  🎮 Create Game
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const filteredGames = publicGames.filter((game) => {
                    // Apply filters
                    if (!filters.showFull && game.currentPlayers >= game.maxPlayers) return false;
                    if (!filters.showInProgress && game.status !== 'waiting') return false;
                    if (game.maxPlayers < filters.minPlayers || game.maxPlayers > filters.maxPlayers) return false;
                    return true;
                  });
                  
                  if (filteredGames.length === 0) {
                    return (
                      <div className="text-center text-gray-400 py-16">
                        <div className="text-6xl mb-4">🔍</div>
                        <p className="text-lg mb-2 text-gray-300">No games match your filters</p>
                        <p className="text-sm mb-6">Try adjusting your filter settings or create a new game</p>
                        <button
                          onClick={() => setFilters({ showFull: true, showInProgress: true, minPlayers: 2, maxPlayers: 12 })}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                        >
                          Reset Filters
                        </button>
                      </div>
                    );
                  }
                  
                  return filteredGames.map((game) => (
                  <div key={game.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span>{game.currentPlayers}/{game.maxPlayers} players</span>
                          {game.mapName && <span>• {game.mapName}</span>}
                          <span className={getGameStatusColor(game.status)}>
                            • {game.status}
                          </span>
                          <span>• Created {formatTimeAgo(game.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {game.hostUsername && (
                          <div className="text-sm text-gray-400">
                            by {game.hostUsername}
                          </div>
                        )}
                        <button
                          onClick={() => handleJoinGame(game.id)}
                          disabled={game.currentPlayers >= game.maxPlayers || game.status !== 'waiting'}
                          className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                            game.currentPlayers >= game.maxPlayers || game.status !== 'waiting'
                              ? 'bg-gray-700 text-gray-400 opacity-50 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {game.currentPlayers >= game.maxPlayers 
                            ? '🚫 Full'
                            : game.status !== 'waiting'
                            ? '👁️ Spectate'
                            : '🎮 Join Game'
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === 'private' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Join Private Game</h2>
            <div className="max-w-md mx-auto text-center py-16">
              <div className="text-6xl mb-4">🔐</div>
              <p className="text-lg text-gray-300 mb-2">Enter game code to join private game</p>
              <p className="text-sm text-gray-400 mb-6">You'll need the invite code from the game host</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="ENTER CODE (e.g., GAME123)" 
                  value={privateGameCode}
                  onChange={(e) => setPrivateGameCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateGame()}
                  className="w-full text-center text-lg bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-3 border border-gray-600 focus:border-blue-500 focus:outline-none tracking-wider font-mono"
                />
                <button 
                  onClick={handleJoinPrivateGame}
                  disabled={!privateGameCode.trim()}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎮 Join Game
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tournaments' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Tournaments</h2>
            <div className="text-center text-gray-400 py-16">
              <div className="text-6xl mb-4">🏆</div>
              <p className="text-lg text-gray-300">Tournament system coming soon!</p>
              <p className="text-sm mt-2">This will show active tournaments, brackets, and registration</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyPage;