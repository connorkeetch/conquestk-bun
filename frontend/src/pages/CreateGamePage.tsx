import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MovementType } from '../types/game';

const CreateGamePage: React.FC = () => {
  const [gameType, setGameType] = useState<'quick' | 'custom' | 'tournament'>('quick');
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [selectedMap, setSelectedMap] = useState('classic');
  const [movementType, setMovementType] = useState<MovementType>('classic_adjacent');
  const [allowTeamPlay, setAllowTeamPlay] = useState(false);

  return (
    <div className="container mx-auto px-8 py-8">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Create Game</h1>
          <p className="text-gray-400">Set up a new game with custom rules and settings</p>
        </div>
        <Link to="/lobby" className="btn btn-secondary">
          ← Back to Lobby
        </Link>
      </div>

      {/* Game Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div 
          className={`card cursor-pointer transition-all ${
            gameType === 'quick' ? 'border-blue-500 bg-blue-500/10' : ''
          }`}
          onClick={() => setGameType('quick')}
        >
          <div className="text-center">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="text-xl font-bold mb-2">Quick Game</h3>
            <p className="text-gray-400 text-sm">Standard settings, start immediately</p>
          </div>
        </div>

        <div 
          className={`card cursor-pointer transition-all ${
            gameType === 'custom' ? 'border-blue-500 bg-blue-500/10' : ''
          }`}
          onClick={() => setGameType('custom')}
        >
          <div className="text-center">
            <div className="text-4xl mb-3">⚙️</div>
            <h3 className="text-xl font-bold mb-2">Custom Game</h3>
            <p className="text-gray-400 text-sm">Full control over rules and settings</p>
          </div>
        </div>

        <div 
          className={`card cursor-pointer transition-all ${
            gameType === 'tournament' ? 'border-blue-500 bg-blue-500/10' : ''
          }`}
          onClick={() => setGameType('tournament')}
        >
          <div className="text-center">
            <div className="text-4xl mb-3">🏆</div>
            <h3 className="text-xl font-bold mb-2">Tournament</h3>
            <p className="text-gray-400 text-sm">Multi-round competitive format</p>
          </div>
        </div>
      </div>

      {/* Game Settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Game Settings</h2>
        </div>
        <div className="card-body">
          {gameType === 'quick' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Game Name</label>
                <input 
                  type="text" 
                  placeholder="Quick Game" 
                  className="input w-full max-w-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Map</label>
                <select className="input w-full max-w-md">
                  <option>Classic World</option>
                  <option>Europe</option>
                  <option>Asia</option>
                  <option>North America</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max Players</label>
                <select className="input w-full max-w-md">
                  <option>2 Players</option>
                  <option>3 Players</option>
                  <option>4 Players</option>
                  <option>5 Players</option>
                  <option>6 Players</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button className="btn btn-primary">
                  🎮 Create & Start Game
                </button>
                <button className="btn btn-secondary">
                  💾 Save as Template
                </button>
              </div>
            </div>
          )}

          {gameType === 'custom' && (
            <div className="space-y-8">
              {/* Basic Settings */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-700 pb-2">Basic Settings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Game Name</label>
                    <input 
                      type="text" 
                      placeholder="My Custom Game" 
                      className="input w-full"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Max Players</label>
                    <select 
                      className="input w-full"
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                    >
                      <option value={2}>2 Players</option>
                      <option value={3}>3 Players</option>
                      <option value={4}>4 Players</option>
                      <option value={5}>5 Players</option>
                      <option value={6}>6 Players</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Map</label>
                  <select 
                    className="input w-full max-w-md"
                    value={selectedMap}
                    onChange={(e) => setSelectedMap(e.target.value)}
                  >
                    <option value="classic">Classic World</option>
                    <option value="europe">Europe</option>
                    <option value="asia">Asia</option>
                    <option value="north_america">North America</option>
                  </select>
                </div>
              </div>

              {/* Movement Rules */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-700 pb-2">Movement Rules</h3>
                
                <div>
                  <label className="block text-sm font-medium mb-3">Reinforcement Movement Type</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div 
                      className={`card cursor-pointer transition-all p-4 ${
                        movementType === 'classic_adjacent' ? 'border-blue-500 bg-blue-500/10' : ''
                      }`}
                      onClick={() => setMovementType('classic_adjacent')}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-2xl">🔗</div>
                        <div>
                          <h4 className="font-semibold">Classic Adjacent</h4>
                          <p className="text-sm text-gray-400 mt-1">
                            One territory → Adjacent only (1 move per turn)
                          </p>
                          <div className="text-xs text-gray-500 mt-2">
                            Traditional Risk gameplay, simple and fast
                          </div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className={`card cursor-pointer transition-all p-4 ${
                        movementType === 'adjacent_multi' ? 'border-blue-500 bg-blue-500/10' : ''
                      }`}
                      onClick={() => setMovementType('adjacent_multi')}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-2xl">🔗✨</div>
                        <div>
                          <h4 className="font-semibold">Adjacent Multi</h4>
                          <p className="text-sm text-gray-400 mt-1">
                            Multiple territories → Adjacent only
                          </p>
                          <div className="text-xs text-gray-500 mt-2">
                            More flexible but still geographically constrained
                          </div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className={`card cursor-pointer transition-all p-4 ${
                        movementType === 'path_single' ? 'border-blue-500 bg-blue-500/10' : ''
                      }`}
                      onClick={() => setMovementType('path_single')}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-2xl">🛤️</div>
                        <div>
                          <h4 className="font-semibold">Path Single</h4>
                          <p className="text-sm text-gray-400 mt-1">
                            One territory → Any connected territory (1 move per turn)
                          </p>
                          <div className="text-xs text-gray-500 mt-2">
                            Strategic repositioning across the map
                          </div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className={`card cursor-pointer transition-all p-4 ${
                        movementType === 'path_multi' ? 'border-blue-500 bg-blue-500/10' : ''
                      }`}
                      onClick={() => setMovementType('path_multi')}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-2xl">🛤️✨</div>
                        <div>
                          <h4 className="font-semibold">Path Multi</h4>
                          <p className="text-sm text-gray-400 mt-1">
                            Multiple territories → Any connected territories
                          </p>
                          <div className="text-xs text-gray-500 mt-2">
                            Maximum flexibility for complex strategies
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Movement Rules Explanation */}
                <div className="bg-gray-800 p-4 rounded-lg">
                  <h5 className="font-medium mb-2">Universal Movement Rules</h5>
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>• Must leave exactly 1 army in source territory</li>
                    <li>• Cannot move from territories with only 1 army</li>
                    <li>• {movementType.includes('multi') ? 'Each territory can only move once per turn' : 'Only one move allowed per fortify phase'}</li>
                    {movementType.includes('path') && <li>• Paths must go through connected owned territories</li>}
                  </ul>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-700 pb-2">Advanced Options</h3>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="teamPlay"
                    checked={allowTeamPlay}
                    onChange={(e) => setAllowTeamPlay(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="teamPlay" className="text-sm font-medium">
                    Allow Team Play
                  </label>
                  <div className="text-xs text-gray-500">
                    (Teammates can move armies through each other's territories)
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6 border-t border-gray-700">
                <button className="btn btn-primary">
                  🎮 Create Custom Game
                </button>
                <button className="btn btn-secondary">
                  💾 Save as Template
                </button>
                <button className="btn btn-ghost">
                  👁️ Preview Rules
                </button>
              </div>
            </div>
          )}

          {gameType === 'tournament' && (
            <div className="text-center text-gray-400 py-16">
              <div className="text-6xl mb-4">🏆</div>
              <p className="text-lg">Tournament creation will be implemented here</p>
              <p className="text-sm mt-2">This will include bracket setup, registration, and scheduling</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateGamePage;