import React, { useState, useEffect } from 'react';
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
  
  // Form state
  const [gameVisibility, setGameVisibility] = useState<'public' | 'private' | 'tournament'>('public');
  const [inviteCode, setInviteCode] = useState(localStorage.getItem('lastInviteCode') || '');
  const [randomizeSettings, setRandomizeSettings] = useState(false);
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [selectedMap, setSelectedMap] = useState('classic');
  const [gameMode, setGameMode] = useState('classic');
  const [fogOfWar, setFogOfWar] = useState('off');
  const [teams, setTeams] = useState(0);
  const [teamAssignment, setTeamAssignment] = useState('random');
  const [fortification, setFortification] = useState('adjacent');
  const [selectedColor, setSelectedColor] = useState('red');
  const [cardTradeBonus, setCardTradeBonus] = useState('progressive');
  const [staticBonusValue, setStaticBonusValue] = useState(10);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate auto game name
  useEffect(() => {
    if (!gameName) {
      const mapName = maps.find(m => m.id === selectedMap)?.name || 'Classic';
      const teamText = teams > 0 ? `${teams} Teams` : 'FFA';
      const playerText = `${maxPlayers}P`;
      const autoName = `${playerText} ${teamText} - ${mapName}`;
      setGameName(autoName);
    }
  }, [maxPlayers, teams, selectedMap, gameName]);

  // Save invite code when it changes
  useEffect(() => {
    if (inviteCode && gameVisibility === 'private') {
      localStorage.setItem('lastInviteCode', inviteCode);
    }
  }, [inviteCode, gameVisibility]);

  const handleCreateGame = async () => {
    try {
      setIsCreating(true);
      setError(null);

      const gameData: CreateGameData = {
        name: gameName || 'Custom Game',
        maxPlayers,
        isPrivate: gameVisibility === 'private',
        gameType: 'custom',
        mapId: selectedMap,
        movementType: 'classic_adjacent' as MovementType,
        allowTeamPlay: teams > 0
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

  const handleRandomizeSettings = () => {
    setMaxPlayers(Math.floor(Math.random() * 6) + 2);
    setTeams(Math.floor(Math.random() * 4));
    setFogOfWar(Math.random() > 0.5 ? 'on' : 'off');
    setFortification(['adjacent', 'chained', 'unlimited'][Math.floor(Math.random() * 3)]);
    setCardTradeBonus(['progressive', 'fixed', 'increasing', 'static'][Math.floor(Math.random() * 4)]);
    if (cardTradeBonus === 'static') {
      setStaticBonusValue(Math.floor(Math.random() * 20) + 5);
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
            <h1 className="text-3xl font-bold mb-2">Create New Game</h1>
            <p className="text-gray-400">Configure your perfect strategic warfare experience</p>
          </div>
          <Link to="/lobby" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            ← Back to Lobby
          </Link>
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

      {/* Game Name and Visibility at the top */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Game Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-white">Game Name</label>
              <input 
                type="text" 
                placeholder="Auto-generated if empty" 
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-all duration-200"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty for auto-generated name</p>
            </div>

            {/* Game Visibility */}
            <div>
              <label className="block text-sm font-medium mb-2 text-white">Game Visibility</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGameVisibility('public')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    gameVisibility === 'public' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🌍 Public
                </button>
                <button
                  onClick={() => setGameVisibility('private')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    gameVisibility === 'private' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🔒 Private
                </button>
                <button
                  onClick={() => setGameVisibility('tournament')}
                  disabled
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    gameVisibility === 'tournament' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  🏆 Tournament
                </button>
              </div>

              {/* Private Game Invite Code */}
              {gameVisibility === 'private' && (
                <div className="mt-3">
                  <input 
                    type="text" 
                    placeholder="Enter invite code (e.g., GAME123)" 
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-all duration-200"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-gray-400 mt-1">Players will need this code to join</p>
                </div>
              )}
            </div>
          </div>

          {/* Randomize Settings */}
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={randomizeSettings}
                onChange={(e) => {
                  setRandomizeSettings(e.target.checked);
                  if (e.target.checked) {
                    handleRandomizeSettings();
                  }
                }}
                className="mr-2"
              />
              <span className="text-sm text-gray-300">🎲 Randomize Settings</span>
            </label>
          </div>
        </div>
      </div>

      {/* Responsive Grid Container */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        
        {/* 1. Number of Players Card */}
        <OptionCard number="1" title="Number of Players">
          <div className="grid grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => {
              const playerCount = i + 1;
              const isDisabled = playerCount === 1;
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
        </OptionCard>

        {/* 2. Game Mode Card */}
        <OptionCard number="2" title="Game Mode">
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
              <span className="text-white">Classic Risk</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg opacity-50 transition-all duration-200">
              <input type="radio" name="gameMode" disabled className="mr-3" />
              <span className="text-gray-400">Capitals</span>
              <span className="ml-auto text-xs text-gray-500">Coming Soon</span>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg opacity-50 transition-all duration-200">
              <input type="radio" name="gameMode" disabled className="mr-3" />
              <span className="text-gray-400">Domination</span>
              <span className="ml-auto text-xs text-gray-500">Coming Soon</span>
            </label>
          </div>
        </OptionCard>

        {/* 3. Fog of War Card */}
        <OptionCard number="3" title="Fog of War">
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
              <span className="text-white">Off - See entire map</span>
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
              <span className="text-white">On - See only adjacent territories</span>
            </label>
          </div>
        </OptionCard>

        {/* 4. Teams Card */}
        <OptionCard number="4" title="Teams">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTeams(0)}
              className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                teams === 0
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              Free for All
            </button>
            {[2, 3, 4, 5, 6].map(teamNum => (
              <button
                key={teamNum}
                type="button"
                onClick={() => setTeams(teamNum)}
                className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                  teams === teamNum
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {teamNum} Teams
              </button>
            ))}
          </div>
          {teams > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <p className="text-sm text-gray-400 mb-2">Team Assignment:</p>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input 
                    type="radio" 
                    name="teamAssign" 
                    value="random"
                    checked={teamAssignment === 'random'}
                    onChange={(e) => setTeamAssignment(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-white">Random</span>
                </label>
                <label className="flex items-center">
                  <input 
                    type="radio" 
                    name="teamAssign" 
                    value="rating"
                    checked={teamAssignment === 'rating'}
                    onChange={(e) => setTeamAssignment(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-white">By Rating</span>
                </label>
              </div>
            </div>
          )}
        </OptionCard>

        {/* 5. Fortification Card */}
        <OptionCard number="5" title="Fortification">
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
              <span className="text-white">Adjacent - Move to neighboring territory</span>
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
              <span className="text-white">Chained - Move through your territories</span>
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
              <span className="text-white">Unlimited - Move to any territory</span>
            </label>
          </div>
        </OptionCard>

        {/* 6. Player Color Card */}
        <OptionCard number="6" title="Choose Your Color">
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

        {/* 7. Spoils of War Card */}
        <OptionCard number="7" title="Spoils of War">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400 mb-2">Card Trade Bonus:</p>
              <div className="space-y-2">
                {[
                  { value: 'progressive', label: 'Progressive (+5 each trade)' },
                  { value: 'fixed', label: 'Fixed (4, 6, 8, 10...)' },
                  { value: 'increasing', label: 'Increasing (4, 6, 8, 10, 12...)' },
                  { value: 'static', label: 'Static (custom value)' }
                ].map(option => (
                  <label key={option.value} className="flex items-center">
                    <input 
                      type="radio" 
                      name="cardBonus" 
                      value={option.value}
                      checked={cardTradeBonus === option.value}
                      onChange={(e) => setCardTradeBonus(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-white">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {cardTradeBonus === 'static' && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Static Bonus Value:</p>
                <input
                  type="number"
                  value={staticBonusValue}
                  onChange={(e) => setStaticBonusValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2 bg-gray-700 text-white placeholder-gray-400 rounded-lg border border-gray-600 focus:border-blue-400 focus:outline-none transition-all duration-200"
                  min="1"
                  placeholder="Armies per card trade"
                />
                <p className="text-xs text-gray-400 mt-1">Players get this many armies for each card trade</p>
              </div>
            )}
          </div>
        </OptionCard>

        {/* 8. Advanced Options Card */}
        <OptionCard number="8" title="Advanced Options" comingSoon={true}>
          <div className="space-y-2 opacity-50">
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span className="text-gray-400">Balanced Dice</span>
            </label>
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span className="text-gray-400">No First Turn Advantage</span>
            </label>
            <label className="flex items-center">
              <input type="checkbox" disabled className="mr-3" />
              <span className="text-gray-400">Zombie Mode</span>
            </label>
          </div>
        </OptionCard>

      </div>

      {/* Map Selector - Full Width */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
            <span className="text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">9</span>
            <span className="text-white">Select Map</span>
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map List */}
            <div className="lg:col-span-1">
              <input 
                placeholder="Search maps..." 
                className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 placeholder-gray-400 mb-3 focus:border-blue-400 focus:outline-none transition-all duration-200"
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
                    <div className="font-bold text-white">{map.name}</div>
                    <div className="text-sm text-gray-300">
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
                    <span className="ml-2 text-white">Large</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Territories:</span>
                    <span className="ml-2 text-white">42</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Regions:</span>
                    <span className="ml-2 text-white">6</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Games Played:</span>
                    <span className="ml-2 text-white">12,847</span>
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
          disabled={isCreating || (gameVisibility === 'private' && !inviteCode.trim())}
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
    </div>
  );
};

export default CreateGamePage;