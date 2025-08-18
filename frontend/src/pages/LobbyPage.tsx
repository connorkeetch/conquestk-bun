import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const LobbyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'browse' | 'private' | 'tournaments'>('browse');

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

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'browse' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Public Games</h2>
            <div className="text-center text-gray-400 py-16">
              <div className="text-6xl mb-4">🎲</div>
              <p className="text-lg">Browse and join public games will be implemented here</p>
              <p className="text-sm mt-2">This will show active lobbies, player counts, maps, and join buttons</p>
            </div>
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
                  className="input w-full text-center text-lg"
                />
                <button className="btn btn-primary w-full">Join Game</button>
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