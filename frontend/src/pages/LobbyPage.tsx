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
    if (!privateGameCode.trim()) {
      setError('Please enter a game code');
      return;
    }

    try {
      const response = await gameService.joinRoom(privateGameCode);
      if (response.room) {
        navigate(`/room/${privateGameCode}`);
      }
    } catch (err: any) {
      console.error('Error joining private game:', err);
      setError('Failed to join game: ' + (err.response?.data?.message || err.message));
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
          <Link to="/create" className="btn btn-primary">
            🎮 Create Game
          </Link>
          <button className="btn btn-secondary">
            🔍 Filter Games
          </button>
        </div>
      </div>

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
              <h2 className="text-2xl font-bold">Public Games</h2>
              <button 
                onClick={loadPublicGames}
                disabled={loading}
                className="btn btn-secondary text-sm"
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
                <Link to="/create" className="btn btn-primary">
                  🎮 Create Game
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {publicGames.map((game) => (
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
                          className={`btn text-sm ${
                            game.currentPlayers >= game.maxPlayers || game.status !== 'waiting'
                              ? 'btn-ghost opacity-50 cursor-not-allowed'
                              : 'btn-primary'
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
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'private' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Join Private Game</h2>
            <div className="max-w-md mx-auto text-center py-16">
              <div className="text-6xl mb-4">🔐</div>
              <p className="text-lg mb-6">Enter game code to join private game</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Enter game code..." 
                  value={privateGameCode}
                  onChange={(e) => setPrivateGameCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateGame()}
                  className="input w-full text-center text-lg"
                />
                <button 
                  onClick={handleJoinPrivateGame}
                  disabled={!privateGameCode.trim()}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎮 Join Game
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tournaments' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Tournaments</h2>
            <div className="text-center text-gray-400 py-16">
              <div className="text-6xl mb-4">🏆</div>
              <p className="text-lg">Tournament system will be implemented here</p>
              <p className="text-sm mt-2">This will show active tournaments, brackets, and registration</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyPage;