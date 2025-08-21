import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MovementType } from '../types/game';
import { gameService, CreateGameData } from '../services/gameService';

// Reusable OptionCard component
interface OptionCardProps {
  number: string;
  title: string;
  children: React.ReactNode;
  comingSoon?: boolean;
}

const OptionCard: React.FC<OptionCardProps> = ({ number, title, children, comingSoon = false }) => (
  <div className={`bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl hover:shadow-2xl ${comingSoon ? 'opacity-50' : ''}`}>
    <div className="flex items-start justify-between mb-4">
      <h2 className="text-lg font-bold flex items-center gap-3">
        <span className="text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{number}</span>
        <span className="text-white">{title}</span>
      </h2>
      {comingSoon && (
        <span className="text-xs bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-1 text-orange-400 font-semibold">
          Coming Soon
        </span>
      )}
    </div>
    <div className={comingSoon ? 'pointer-events-none' : ''}>
      {children}
    </div>
  </div>
);

const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'custom' | 'quick' | 'tournament'>('custom');
  
  // Form state
  const [gameType, setGameType] = useState('custom');
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [selectedMap, setSelectedMap] = useState('classic');
  const [gameMode, setGameMode] = useState('classic');
  const [fogOfWar, setFogOfWar] = useState('off');
  const [teams, setTeams] = useState('none');
  const [teamAssignment, setTeamAssignment] = useState('random');
  const [fortification, setFortification] = useState('adjacent');
  const [selectedColor, setSelectedColor] = useState('red');
  const [cardTradeBonus, setCardTradeBonus] = useState('progressive');
  const [territoryBonus, setTerritoryBonus] = useState('bonus');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGame = async () => {
    try {
      setIsCreating(true);
      setError(null);

      const gameData: CreateGameData = {
        name: gameName || 'Custom Game',
        maxPlayers,
        isPrivate: false,
        gameType: 'custom',
        mapId: selectedMap,
        movementType: 'classic_adjacent' as MovementType,
        allowTeamPlay: teams !== 'none'
      };
      
      const response = await gameService.createRoom(gameData);
      
      if (response.room) {
        navigate(`/room/${response.room.id}`);
      } else {
        throw new Error('Failed to create game room');
      }
    } catch (err: any) {
      console.error('Error creating game:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create game');
    } finally {
      setIsCreating(false);
    }
  };

  // Mock maps data
  const maps = [
    { id: 'classic', name: 'Classic World', territories: 42, players: '2-6', size: 'Large' },
    { id: 'europe', name: 'Europe', territories: 24, players: '2-4', size: 'Medium' },
    { id: 'asia', name: 'Asia', territories: 30, players: '2-5', size: 'Large' },
  ];

  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];

  return (
    <div className="min-h-screen text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Create Custom Game</h1>
            <p className="text-gray-400">Configure your perfect strategic warfare experience</p>
          </div>
          <Link to="/lobby" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            ← Back to Lobby
          </Link>
        </div>
        
        <div className="flex gap-4">
          <button 
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'custom' ? 'text-white bg-blue-600' : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('custom')}
          >
            Custom Game
          </button>
          <button 
            className="text-gray-400 hover:text-white px-4 py-2 rounded-lg cursor-not-allowed opacity-50"
            disabled
          >
            Quick Game (Coming Soon)
          </button>
          <button 
            className="text-gray-400 hover:text-white px-4 py-2 rounded-lg cursor-not-allowed opacity-50"
            disabled
          >
            Tournament (Coming Soon)
          </button>
          <button 
            className="text-gray-400 hover:text-white px-4 py-2 rounded-lg cursor-not-allowed opacity-50"
            disabled
          >
            Load Template (Coming Soon)
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-red-400">❌</span>
            <span className="text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Responsive Grid Container */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        
        {/* 1. Game Type Card */}
        <OptionCard number="1" title="Game Type">
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="gameType" 
                value="custom" 
                checked={gameType === 'custom'}
                onChange={(e) => setGameType(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Custom Game</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 opacity-50 transition-all duration-200">
              <input type="radio" name="gameType" value="quick" disabled className="mr-3" />
              <span>Quick Match</span>
              <span className="ml-auto text-xs">Coming Soon</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 opacity-50 transition-all duration-200">
              <input type="radio" name="gameType" value="tournament" disabled className="mr-3" />
              <span>Tournament</span>
              <span className="ml-auto text-xs">Coming Soon</span>
            </label>
          </div>
        </OptionCard>

        {/* 2. Number of Players Card */}
        <OptionCard number="2" title="Number of Players">
          <div className="grid grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => {
              const playerCount = i + 1;
              const isDisabled = playerCount > 6;
              return (
                <button
                  key={playerCount}
                  className={`p-3 rounded-lg font-bold transition-all duration-200 ${
                    isDisabled 
                      ? 'bg-white/5 text-gray-400 cursor-not-allowed opacity-50'
                      : maxPlayers === playerCount
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20'
                  }`}
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setMaxPlayers(playerCount)}
                >
                  {playerCount}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">Players 7-12 coming soon</p>
        </OptionCard>

        {/* 3. Game Mode Card */}
        <OptionCard number="3" title="Game Mode">
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="gameMode" 
                value="classic"
                checked={gameMode === 'classic'}
                onChange={(e) => setGameMode(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Classic Risk</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg opacity-50 transition-all duration-200">
              <input type="radio" name="gameMode" disabled className="mr-3" />
              <span>Capitals</span>
              <span className="ml-auto text-xs">Coming Soon</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg opacity-50 transition-all duration-200">
              <input type="radio" name="gameMode" disabled className="mr-3" />
              <span>Domination</span>
              <span className="ml-auto text-xs">Coming Soon</span>
            </label>
          </div>
        </OptionCard>

        {/* 4. Fog of War Card */}
        <OptionCard number="4" title="Fog of War">
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="fog" 
                value="off"
                checked={fogOfWar === 'off'}
                onChange={(e) => setFogOfWar(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Off - See entire map</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="fog" 
                value="on"
                checked={fogOfWar === 'on'}
                onChange={(e) => setFogOfWar(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>On - See only adjacent territories</span>
            </label>
          </div>
        </OptionCard>

        {/* 5. Teams Card */}
        <OptionCard number="5" title="Teams">
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="teams" 
                value="none"
                checked={teams === 'none'}
                onChange={(e) => setTeams(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>No Teams (Free for All)</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="teams" 
                value="2"
                checked={teams === '2'}
                onChange={(e) => setTeams(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>2 Teams</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="teams" 
                value="3"
                checked={teams === '3'}
                onChange={(e) => setTeams(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>3 Teams</span>
            </label>
          </div>
          {teams !== 'none' && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <p className="text-sm text-gray-400 mb-2">Team Assignment:</p>
              <select 
                className="w-full p-2 bg-white/10 backdrop-blur-sm text-white rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none transition-all duration-200"
                value={teamAssignment}
                onChange={(e) => setTeamAssignment(e.target.value)}
              >
                <option value="random">Random</option>
                <option value="rating">By Rating</option>
                <option value="custom" disabled>Custom (Coming Soon)</option>
              </select>
            </div>
          )}
        </OptionCard>

        {/* 6. Fortification Card */}
        <OptionCard number="6" title="Fortification">
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="fortification" 
                value="adjacent"
                checked={fortification === 'adjacent'}
                onChange={(e) => setFortification(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Adjacent - Move to neighboring territory</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="fortification" 
                value="chained"
                checked={fortification === 'chained'}
                onChange={(e) => setFortification(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Chained - Move through your territories</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input 
                type="radio" 
                name="fortification" 
                value="unlimited"
                checked={fortification === 'unlimited'}
                onChange={(e) => setFortification(e.target.value)}
                className="mr-3 accent-blue-500" 
              />
              <span>Unlimited - Move to any territory</span>
            </label>
          </div>
        </OptionCard>

        {/* 7. Player Color Card */}
        <OptionCard number="7" title="Choose Your Color">
          <div className="grid grid-cols-4 gap-3">
            {colors.map(color => (
              <button
                key={color}
                className={`h-12 rounded border-2 transition ${
                  selectedColor === color ? 'border-white scale-110' : 'border-transparent hover:border-gray-400'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
                title={color.charAt(0).toUpperCase() + color.slice(1)}
              />
            ))}
          </div>
        </OptionCard>

        {/* 8. Spoils of War Card */}
        <OptionCard number="8" title="Spoils of War">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400 mb-2">Card Trade Bonus:</p>
              <select 
                className="w-full p-2 bg-white/10 backdrop-blur-sm text-white rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none transition-all duration-200"
                value={cardTradeBonus}
                onChange={(e) => setCardTradeBonus(e.target.value)}
              >
                <option value="progressive">Progressive (4, 6, 8, 10, 12, 15...)</option>
                <option value="fixed">Fixed (10 armies each time)</option>
                <option value="escalating">Escalating (5, 10, 15, 20...)</option>
              </select>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Territory Bonus:</p>
              <select 
                className="w-full p-2 bg-white/10 backdrop-blur-sm text-white rounded-lg border border-white/20 focus:border-blue-400 focus:outline-none transition-all duration-200"
                value={territoryBonus}
                onChange={(e) => setTerritoryBonus(e.target.value)}
              >
                <option value="bonus">+2 armies on owned territory</option>
                <option value="none">No bonus</option>
              </select>
            </div>
          </div>
        </OptionCard>

        {/* 9. Advanced Options Card */}
        <OptionCard number="9" title="Advanced Options" comingSoon={true}>
          <div className="space-y-2 opacity-50">
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span>Balanced Dice</span>
            </label>
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span>No First Turn Advantage</span>
            </label>
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span>Zombie Mode</span>
            </label>
          </div>
        </OptionCard>

      </div>

      {/* Map Selector - Full Width */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
            <span className="text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">10</span>
            <span className="text-white">Select Map</span>
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map List */}
            <div className="lg:col-span-1">
              <input 
                placeholder="Search maps..." 
                className="w-full p-2 bg-white/10 backdrop-blur-sm text-white rounded-lg border border-white/20 placeholder-gray-400 mb-3 focus:border-blue-400 focus:outline-none transition-all duration-200"
              />
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {maps.map(map => (
                  <div 
                    key={map.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedMap === map.id ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg' : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                    }`}
                    onClick={() => setSelectedMap(map.id)}
                  >
                    <div className="font-bold">{map.name}</div>
                    <div className="text-sm text-gray-400">
                      {map.territories} territories • {map.players} players
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Map Preview */}
            <div className="lg:col-span-2">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="w-full h-48 bg-white/5 rounded-lg mb-4 flex items-center justify-center border border-white/10">
                  <span className="text-gray-400">Map Preview (Coming Soon)</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Map Size:</span>
                    <span className="ml-2">Large</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Territories:</span>
                    <span className="ml-2">42</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Regions:</span>
                    <span className="ml-2">6</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Games Played:</span>
                    <span className="ml-2">12,847</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto flex gap-4">
        <button 
          className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105"
          onClick={handleCreateGame}
          disabled={isCreating || !gameName.trim()}
        >
          {isCreating ? '🔄 Creating...' : '🎮 Create Game'}
        </button>
        <button 
          className="py-3 px-6 bg-white/10 backdrop-blur-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl border border-white/20 transition-all duration-200"
          disabled
        >
          💾 Save as Template (Coming Soon)
        </button>
      </div>

      {/* Game Name Input - Fixed Position */}
      <div className="fixed bottom-6 right-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-2xl">
        <label className="block text-sm font-medium mb-2">Game Name *</label>
        <input 
          type="text" 
          placeholder="My Custom Game" 
          className="w-64 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-all duration-200"
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
          required
        />
      </div>
    </div>
  );
};

export default CreateGamePage;