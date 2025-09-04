import type React from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import {
  COLOR_CLASSES,
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  isPremiumColor,
  PLAYER_COLORS,
  PREMIUM_COLORS,
  STANDARD_COLORS,
  type PlayerColor,
} from '../constants/colors'
import { type CreateGameData, gameService } from '../services/gameService'
import type { MovementType } from '../types/game'

// Reusable OptionCard component
interface OptionCardProps {
  number: string
  title: string
  children: React.ReactNode
  comingSoon?: boolean
  lockable?: boolean
  isLocked?: boolean
  onToggleLock?: () => void
  settingName?: string
}

const OptionCard: React.FC<OptionCardProps> = ({
  number,
  title,
  children,
  comingSoon = false,
  lockable = false,
  isLocked = false,
  onToggleLock,
}) => (
  <div
    className={`bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl hover:shadow-2xl ${comingSoon ? 'opacity-50' : ''}`}
  >
    <div className="flex items-start justify-between mb-4">
      <h2 className="text-lg font-bold flex items-center gap-3">
        <span className="text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          {number}
        </span>
        <span className="text-white">{title}</span>
      </h2>
      <div className="flex items-center gap-2">
        {lockable && onToggleLock && (
          <button
            onClick={onToggleLock}
            className={`p-1.5 rounded transition-all ${
              isLocked
                ? 'text-yellow-400 bg-yellow-400/20 hover:bg-yellow-400/30'
                : 'text-gray-400 bg-gray-600/20 hover:bg-gray-600/30'
            }`}
            title={isLocked ? 'Locked from randomization' : 'Click to lock from randomization'}
          >
            {isLocked ? '🔒' : '🔓'}
          </button>
        )}
        {comingSoon && (
          <span className="text-xs bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-1 text-orange-400 font-semibold">
            Coming Soon
          </span>
        )}
      </div>
    </div>
    <div className={comingSoon ? 'pointer-events-none' : ''}>{children}</div>
  </div>
)

const CreateGamePage: React.FC = () => {
  const navigate = useNavigate()
  const settings = useAppSelector((state) => state.settings)
  const guntsPrescriptions = useFeatureFlag('gunts_prescriptions')
  
  // Get preferred color from settings, default to bright-red
  const preferredColor = settings.game?.preferredColor || 'bright-red'

  // Form state
  const [gameVisibility, setGameVisibility] = useState<'public' | 'private' | 'tournament'>(
    'public',
  )
  const [inviteCode, setInviteCode] = useState(localStorage.getItem('lastInviteCode') || '')
  const [gameName, setGameName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [selectedMap, setSelectedMap] = useState('classic')
  const [gameMode, setGameMode] = useState('classic')
  const [fogOfWar, setFogOfWar] = useState('off')
  const [teams, setTeams] = useState(0)
  const [teamAssignment, setTeamAssignment] = useState('random')
  const [fortification, setFortification] = useState('adjacent')
  const [movementType, setMovementType] = useState('classic')
  const [selectedColor, setSelectedColor] = useState<PlayerColor>(preferredColor)
  const [turnTimeLimit, setTurnTimeLimit] = useState('none')
  const [gameSpeed, setGameSpeed] = useState<'realtime' | 'async'>('realtime')
  const [cardTradeBonus, setCardTradeBonus] = useState('progressive')
  const [staticBonusValue, setStaticBonusValue] = useState(10)
  const [useTerritoryModifiers, setUseTerritoryModifiers] = useState(false)
  const [modifierDistribution, setModifierDistribution] = useState<
    'sparse' | 'balanced' | 'abundant'
  >('balanced')
  const [isRanked, setIsRanked] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Settings lock state for randomization
  const [lockedSettings, setLockedSettings] = useState<Set<string>>(new Set())

  // Mock maps data (moved here so it's available for generateSmartName)
  const maps = [
    { id: 'classic', name: 'Classic World', territories: 42, players: '2-6', size: 'Large' },
    { id: 'europe', name: 'Europe', territories: 24, players: '2-4', size: 'Medium' },
    { id: 'asia', name: 'Asia', territories: 30, players: '2-5', size: 'Large' },
  ]

  // Generate smart game name
  const generateSmartName = () => {
    const mapName = maps.find((m) => m.id === selectedMap)?.name || 'Classic'
    const playerText = `${maxPlayers}P`

    // Build descriptive elements
    const elements = []

    // Ranked indicator
    if (isRanked) elements.push('[RANKED]')

    // Player count
    elements.push(playerText)

    // Team configuration
    if (teams > 0) {
      elements.push(`${teams}v${Math.floor(maxPlayers / teams)}`)
    } else {
      elements.push('FFA')
    }

    // Map name
    elements.push(mapName)

    // Special rules (only include if not default)
    const specialRules = []
    if (gameMode === 'capitals') specialRules.push('Capitals')
    if (fogOfWar === 'adjacent') specialRules.push('Fog')
    if (fogOfWar === 'persistent') specialRules.push('PersistentFog')
    if (movementType === 'sea') specialRules.push('SeaRoutes')
    if (movementType === 'airports') specialRules.push('Airports')
    if (movementType === 'unlimited') specialRules.push('GlobalReach')
    if (fortification === 'unlimited') specialRules.push('UnlimitedMove')
    if (fortification === 'chained') specialRules.push('ChainedMove')
    if (turnTimeLimit !== 'none') specialRules.push(turnTimeLimit)
    if (useTerritoryModifiers) specialRules.push('Modifiers')

    if (specialRules.length > 0) {
      elements.push(`[${specialRules.join('+')}]`)
    }

    return elements.join(' ')
  }

  // Auto-generate game name
  useEffect(() => {
    if (!gameName) {
      setGameName(generateSmartName())
    }
  }, [
    maxPlayers,
    teams,
    selectedMap,
    gameMode,
    fogOfWar,
    fortification,
    useTerritoryModifiers,
    isRanked,
  ])

  // Update placeholder to show what auto-name would be
  const gameNamePlaceholder = generateSmartName()

  // Validate ranked game settings
  useEffect(() => {
    if (isRanked) {
      // Enforce ranked game requirements
      if (maxPlayers < 3) {
        setMaxPlayers(3)
      }
      if (gameVisibility === 'private') {
        setGameVisibility('public')
      }
      if (teams > 0) {
        setTeams(0)
      }
    }
  }, [isRanked, maxPlayers, gameVisibility, teams])

  // Save invite code when it changes
  useEffect(() => {
    if (inviteCode && gameVisibility === 'private') {
      localStorage.setItem('lastInviteCode', inviteCode)
    }
  }, [inviteCode, gameVisibility])

  const handleCreateGame = async () => {
    try {
      setIsCreating(true)
      setError(null)

      const gameData: CreateGameData = {
        name: gameName || 'Custom Game',
        maxPlayers,
        isPrivate: gameVisibility === 'private',
        isRanked,
        gameType: 'custom',
        mapId: selectedMap,
        movementType: (movementType === 'classic'
          ? 'classic_adjacent'
          : movementType) as MovementType,
        allowTeamPlay: teams > 0,
        capitalsEnabled: gameMode === 'capitals',
        useTerritoryModifiers,
        modifierDistribution: useTerritoryModifiers ? modifierDistribution : 'none',
      }

      const response = await gameService.createRoom(gameData)

      if (response.room) {
        navigate(`/room/${response.room.id}`)
      } else {
        throw new Error('Failed to create game room')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create game')
    } finally {
      setIsCreating(false)
    }
  }

  const handleRandomizeSettings = () => {
    if (!lockedSettings.has('maxPlayers')) {
      setMaxPlayers(Math.floor(Math.random() * 6) + 2)
    }
    if (!lockedSettings.has('teams')) {
      setTeams(Math.floor(Math.random() * 4))
    }
    if (!lockedSettings.has('fogOfWar')) {
      const fogOptions = ['off', 'adjacent', 'persistent']
      setFogOfWar(fogOptions[Math.floor(Math.random() * fogOptions.length)])
    }
    if (!lockedSettings.has('fortification')) {
      setFortification(['adjacent', 'chained', 'unlimited'][Math.floor(Math.random() * 3)])
    }
    if (!lockedSettings.has('movementType')) {
      const movementOptions = ['classic', 'sea', 'airports', 'unlimited']
      setMovementType(movementOptions[Math.floor(Math.random() * movementOptions.length)])
    }
    if (!lockedSettings.has('turnTimeLimit')) {
      const timeLimitOptions = ['none', '5min', '10min', '6h', '12h', '24h']
      setTurnTimeLimit(timeLimitOptions[Math.floor(Math.random() * timeLimitOptions.length)])
      // Set game speed based on time limit
      if (['5min', '10min'].includes(turnTimeLimit)) {
        setGameSpeed('realtime')
      } else if (['6h', '12h', '24h'].includes(turnTimeLimit)) {
        setGameSpeed('async')
      }
    }
    if (!lockedSettings.has('cardTradeBonus')) {
      const newBonus = ['progressive', 'fixed', 'increasing', 'static'][
        Math.floor(Math.random() * 4)
      ]
      setCardTradeBonus(newBonus)
      if (newBonus === 'static') {
        setStaticBonusValue(Math.floor(Math.random() * 20) + 5)
      }
    }
  }

  const toggleLock = (settingName: string) => {
    setLockedSettings((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(settingName)) {
        newSet.delete(settingName)
      } else {
        newSet.add(settingName)
      }
      return newSet
    })
  }

  // Use colors from constants
  const colors = PLAYER_COLORS

  return (
    <div className="min-h-screen text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Create New Game</h1>
            <p className="text-gray-400">
              Configure your perfect strategic warfare experience
              {guntsPrescriptions && (
                <span className="block mt-1 text-sm text-blue-400 italic">
                  💊 "Just what the doctor ordered!" - Dr. Gunt
                </span>
              )}
            </p>
          </div>
          <Link
            to="/lobby"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
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
              <div className="relative">
                <input
                  type="text"
                  placeholder={gameNamePlaceholder}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-all duration-200 pr-20"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                />
                <div className="absolute right-1 top-1 flex gap-1">
                  {gameName && (
                    <button
                      type="button"
                      onClick={() => setGameName('')}
                      className="p-1.5 text-gray-400 hover:text-white bg-gray-600 hover:bg-gray-500 rounded transition-all"
                      title="Clear custom name"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setGameName(generateSmartName())}
                    className="p-1.5 text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 rounded transition-all"
                    title="Generate smart name"
                  >
                    ✨
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {gameName ? 'Using custom name' : 'Auto-generated based on settings'}
              </p>
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

          {/* Ranked Game Toggle */}
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg border border-blue-500/30">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRanked}
                    onChange={(e) => setIsRanked(e.target.checked)}
                    className="mr-3 h-5 w-5"
                  />
                  <div>
                    <span className="text-lg font-bold text-white">⚔️ Ranked Game</span>
                    <p className="text-sm text-gray-400 mt-1">
                      Compete for Command Points (CP) and climb the skill leaderboard
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {isRanked && (
              <div className="mt-4 p-3 bg-yellow-900/30 rounded-lg border border-yellow-600/50">
                <p className="text-sm font-semibold text-yellow-400 mb-2">Ranked Requirements:</p>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Minimum 3 players required</li>
                  <li>• No AI players allowed</li>
                  <li>• Must be a public game</li>
                  <li>• No team play</li>
                  <li>• Rating changes based on final position</li>
                  <li>• Skill difference limit: ±500 CP</li>
                </ul>
              </div>
            )}
          </div>

          {/* Randomize Settings */}
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleRandomizeSettings}
              disabled={isRanked}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                isRanked
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              <span>🎲</span>
              <span>Randomize Settings</span>
              {isRanked && <span className="text-xs">(Disabled for ranked)</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Grid Container */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {/* 1. Number of Players Card */}
        <OptionCard
          number="1"
          title="Number of Players"
          lockable={!isRanked}
          isLocked={lockedSettings.has('maxPlayers')}
          onToggleLock={() => toggleLock('maxPlayers')}
        >
          <div className="grid grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => {
              const playerCount = i + 1
              const isDisabled = playerCount === 1
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
              )
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
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="gameMode"
                value="capitals"
                checked={gameMode === 'capitals'}
                onChange={(e) => setGameMode(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">👑 Capitals</span>
                <p className="text-xs text-gray-400 mt-1">
                  Capture enemy capitals for instant elimination
                </p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg opacity-50 transition-all duration-200">
              <input type="radio" name="gameMode" disabled className="mr-3" />
              <span className="text-gray-400">Domination</span>
              <span className="ml-auto text-xs text-gray-500">Coming Soon</span>
            </label>
          </div>
        </OptionCard>

        {/* 3. Fog of War Card */}
        <OptionCard
          number="3"
          title="Fog of War"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fogOfWar')}
          onToggleLock={() => toggleLock('fogOfWar')}
        >
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
              <div className="flex-1">
                <span className="text-white">🌞 No Fog</span>
                <p className="text-xs text-gray-400 mt-1">See entire map at all times</p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="fog"
                value="adjacent"
                checked={fogOfWar === 'adjacent'}
                onChange={(e) => setFogOfWar(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">🌫️ Adjacent Only</span>
                <p className="text-xs text-gray-400 mt-1">Only see territories next to your own</p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="fog"
                value="persistent"
                checked={fogOfWar === 'persistent'}
                onChange={(e) => setFogOfWar(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">🗺️ Persistent Vision</span>
                <p className="text-xs text-gray-400 mt-1">
                  Once revealed, territories stay visible
                </p>
              </div>
            </label>
          </div>
        </OptionCard>

        {/* 4. Teams Card */}
        <OptionCard
          number="4"
          title="Teams"
          lockable={!isRanked}
          isLocked={lockedSettings.has('teams')}
          onToggleLock={() => toggleLock('teams')}
        >
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
            {[2, 3, 4, 5, 6].map((teamNum) => (
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
        <OptionCard
          number="5"
          title="Fortification"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fortification')}
          onToggleLock={() => toggleLock('fortification')}
        >
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

        {/* 6. Movement System Card */}
        <OptionCard
          number="6"
          title="Movement System"
          lockable={!isRanked}
          isLocked={lockedSettings.has('movementType')}
          onToggleLock={() => toggleLock('movementType')}
        >
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="movement"
                value="classic"
                checked={movementType === 'classic'}
                onChange={(e) => setMovementType(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">⚔️ Classic Adjacent</span>
                <p className="text-xs text-gray-400 mt-1">Attack only neighboring territories</p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="movement"
                value="sea"
                checked={movementType === 'sea'}
                onChange={(e) => setMovementType(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">🌊 Sea Connections</span>
                <p className="text-xs text-gray-400 mt-1">Naval routes connect distant regions</p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="movement"
                value="airports"
                checked={movementType === 'airports'}
                onChange={(e) => setMovementType(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">✈️ Airport Hubs</span>
                <p className="text-xs text-gray-400 mt-1">
                  Strategic airports allow long-range attacks
                </p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="movement"
                value="unlimited"
                checked={movementType === 'unlimited'}
                onChange={(e) => setMovementType(e.target.value)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">🚀 Unlimited Range</span>
                <p className="text-xs text-gray-400 mt-1">Attack any territory from anywhere</p>
              </div>
            </label>
          </div>
        </OptionCard>

        {/* 7. Player Color Card */}
        <OptionCard number="7" title="Choose Your Color">
          <div className="space-y-4">
            {/* Standard Colors */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Standard Colors</p>
              <div className="grid grid-cols-4 gap-2">
                {STANDARD_COLORS.map((color) => {
                  const hexValue = COLOR_HEX_VALUES[color]
                  const isGradient = hexValue.includes('gradient')
                  return (
                    <button
                      key={color}
                      className={`group relative h-14 rounded-lg border-2 transition-all ${
                        selectedColor === color
                          ? 'border-white scale-105 shadow-lg ring-2 ring-white/50'
                          : 'border-gray-600 hover:border-gray-400 hover:scale-102'
                      }`}
                      style={{
                        background: isGradient ? hexValue : undefined,
                        backgroundColor: !isGradient ? hexValue : undefined,
                      }}
                      onClick={() => setSelectedColor(color)}
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {selectedColor === color && (
                          <span className="text-white text-lg font-bold drop-shadow-lg">✓</span>
                        )}
                        <span className="text-[10px] text-white/90 font-medium drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                          {COLOR_DISPLAY_NAMES[color].replace(' ⭐', '')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Premium Colors */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Premium Colors (Conquest Pass)</p>
              <div className="grid grid-cols-3 gap-2">
                {PREMIUM_COLORS.map((color) => {
                  const hexValue = COLOR_HEX_VALUES[color]
                  const isGradient = hexValue.includes('gradient')
                  const isPulse = color === 'pulse'
                  const isNeon = color === 'neon'
                  const isMetallic = color === 'metallic'

                  return (
                    <button
                      key={color}
                      className={`group relative h-14 rounded-lg border-2 transition-all ${
                        selectedColor === color
                          ? 'border-yellow-400 scale-105 shadow-lg ring-2 ring-yellow-400/50'
                          : 'border-gray-600 hover:border-yellow-600 hover:scale-102'
                      } ${isPulse ? 'animate-pulse' : ''} ${
                        isNeon ? 'shadow-[0_0_10px_rgba(57,255,20,0.5)]' : ''
                      }`}
                      style={{
                        background:
                          isGradient || isMetallic
                            ? hexValue.includes('linear-gradient')
                              ? hexValue
                              : isMetallic
                                ? 'linear-gradient(135deg, #B8860B, #FFD700, #B8860B)'
                                : hexValue
                            : undefined,
                        backgroundColor: !isGradient && !isMetallic ? hexValue : undefined,
                      }}
                      onClick={() => setSelectedColor(color)}
                      disabled={false} // Will be disabled for non-premium users
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-yellow-400 text-xs mb-0.5">⭐</span>
                        {selectedColor === color && (
                          <span className="text-white text-lg font-bold drop-shadow-lg">✓</span>
                        )}
                        <span className="text-[10px] text-white/90 font-medium drop-shadow-md">
                          {COLOR_DISPLAY_NAMES[color].replace(' ⭐', '')}
                        </span>
                      </div>
                      {isMetallic && (
                        <div className="absolute inset-0 rounded-lg opacity-30 bg-gradient-to-t from-transparent via-white to-transparent animate-shimmer pointer-events-none" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selected Color Preview */}
            {selectedColor && (
              <div className="mt-3 p-3 bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Selected:</p>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded ${COLOR_CLASSES[selectedColor]}`}
                    style={{
                      background: COLOR_HEX_VALUES[selectedColor].includes('gradient')
                        ? COLOR_HEX_VALUES[selectedColor]
                        : undefined,
                      backgroundColor: !COLOR_HEX_VALUES[selectedColor].includes('gradient')
                        ? COLOR_HEX_VALUES[selectedColor]
                        : undefined,
                    }}
                  />
                  <span className="text-sm font-medium">{COLOR_DISPLAY_NAMES[selectedColor]}</span>
                </div>
              </div>
            )}
          </div>
        </OptionCard>

        {/* 8. Spoils of War Card */}
        <OptionCard
          number="8"
          title="Spoils of War"
          lockable={!isRanked}
          isLocked={lockedSettings.has('cardTradeBonus')}
          onToggleLock={() => toggleLock('cardTradeBonus')}
        >
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400 mb-2">Card Trade Bonus:</p>
              <div className="space-y-2">
                {[
                  { value: 'progressive', label: 'Progressive (+5 each trade)' },
                  { value: 'fixed', label: 'Fixed (4, 6, 8, 10...)' },
                  { value: 'increasing', label: 'Increasing (4, 6, 8, 10, 12...)' },
                  { value: 'static', label: 'Static (custom value)' },
                ].map((option) => (
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
                  onChange={(e) =>
                    setStaticBonusValue(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-full p-2 bg-gray-700 text-white placeholder-gray-400 rounded-lg border border-gray-600 focus:border-blue-400 focus:outline-none transition-all duration-200"
                  min="1"
                  placeholder="Armies per card trade"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Players get this many armies for each card trade
                </p>
              </div>
            )}
          </div>
        </OptionCard>

        {/* 9. Territory Modifiers Card */}
        <OptionCard number="9" title="Territory Modifiers">
          <div className="space-y-3">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="checkbox"
                checked={useTerritoryModifiers}
                onChange={(e) => setUseTerritoryModifiers(e.target.checked)}
                className="mr-3 accent-blue-500"
              />
              <div className="flex-1">
                <span className="text-white">⚡ Enable Territory Modifiers</span>
                <p className="text-xs text-gray-400 mt-1">
                  Add special properties to territories (defense bonuses, supply lines, etc.)
                </p>
              </div>
            </label>

            {useTerritoryModifiers && (
              <div className="mt-3 pt-3 border-t border-gray-600">
                <p className="text-sm text-gray-400 mb-2">Modifier Distribution:</p>
                <div className="space-y-2">
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20">
                    <input
                      type="radio"
                      name="modifierDist"
                      value="sparse"
                      checked={modifierDistribution === 'sparse'}
                      onChange={(e) =>
                        setModifierDistribution(
                          e.target.value as 'sparse' | 'balanced' | 'abundant',
                        )
                      }
                      className="mr-2"
                    />
                    <div className="flex-1">
                      <span className="text-white text-sm">Sparse (15%)</span>
                      <p className="text-xs text-gray-400">Few strategic territories</p>
                    </div>
                  </label>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20">
                    <input
                      type="radio"
                      name="modifierDist"
                      value="balanced"
                      checked={modifierDistribution === 'balanced'}
                      onChange={(e) =>
                        setModifierDistribution(
                          e.target.value as 'sparse' | 'balanced' | 'abundant',
                        )
                      }
                      className="mr-2"
                    />
                    <div className="flex-1">
                      <span className="text-white text-sm">Balanced (30%)</span>
                      <p className="text-xs text-gray-400">Moderate strategic depth</p>
                    </div>
                  </label>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20">
                    <input
                      type="radio"
                      name="modifierDist"
                      value="abundant"
                      checked={modifierDistribution === 'abundant'}
                      onChange={(e) =>
                        setModifierDistribution(
                          e.target.value as 'sparse' | 'balanced' | 'abundant',
                        )
                      }
                      className="mr-2"
                    />
                    <div className="flex-1">
                      <span className="text-white text-sm">Abundant (50%)</span>
                      <p className="text-xs text-gray-400">Many strategic territories</p>
                    </div>
                  </label>
                </div>

                <div className="mt-3 p-2 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <p className="text-xs text-blue-400">
                    🎲 Modifiers are randomly assigned at game start. Examples:
                  </p>
                  <ul className="text-xs text-gray-400 mt-1 space-y-1">
                    <li>🛡️ Fortresses: +2 defense bonus</li>
                    <li>⚔️ Training grounds: +1 attack bonus</li>
                    <li>🔗 Supply depots: Troop generation bonus</li>
                    <li>🚧 Mountains: Movement restrictions</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </OptionCard>

        {/* 10. Turn Timer Card */}
        <OptionCard
          number="10"
          title="Turn Time Limits"
          lockable={!isRanked}
          isLocked={lockedSettings.has('turnTimeLimit')}
          onToggleLock={() => toggleLock('turnTimeLimit')}
        >
          <div className="space-y-3">
            {/* Game Speed Toggle */}
            <div className="flex gap-2 p-1 bg-gray-700 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setGameSpeed('realtime')
                  if (!['none', '5min', '10min'].includes(turnTimeLimit)) {
                    setTurnTimeLimit('none')
                  }
                }}
                className={`flex-1 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  gameSpeed === 'realtime'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                ⚡ Real-time
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameSpeed('async')
                  if (!['none', '6h', '12h', '24h'].includes(turnTimeLimit)) {
                    setTurnTimeLimit('none')
                  }
                }}
                className={`flex-1 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  gameSpeed === 'async'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                📅 Async
              </button>
            </div>

            {/* Time Limit Options */}
            <div className="space-y-2">
              <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                <input
                  type="radio"
                  name="timeLimit"
                  value="none"
                  checked={turnTimeLimit === 'none'}
                  onChange={(e) => setTurnTimeLimit(e.target.value)}
                  className="mr-3 accent-blue-500"
                />
                <div className="flex-1">
                  <span className="text-white">♾️ No Time Limit</span>
                  <p className="text-xs text-gray-400 mt-1">
                    Players can take as long as they need
                  </p>
                </div>
              </label>

              {gameSpeed === 'realtime' && (
                <>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                    <input
                      type="radio"
                      name="timeLimit"
                      value="5min"
                      checked={turnTimeLimit === '5min'}
                      onChange={(e) => setTurnTimeLimit(e.target.value)}
                      className="mr-3 accent-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-white">⏱️ 5 Minutes</span>
                      <p className="text-xs text-gray-400 mt-1">Fast-paced competitive gameplay</p>
                    </div>
                  </label>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                    <input
                      type="radio"
                      name="timeLimit"
                      value="10min"
                      checked={turnTimeLimit === '10min'}
                      onChange={(e) => setTurnTimeLimit(e.target.value)}
                      className="mr-3 accent-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-white">⏰ 10 Minutes</span>
                      <p className="text-xs text-gray-400 mt-1">Strategic with time pressure</p>
                    </div>
                  </label>
                </>
              )}

              {gameSpeed === 'async' && (
                <>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                    <input
                      type="radio"
                      name="timeLimit"
                      value="6h"
                      checked={turnTimeLimit === '6h'}
                      onChange={(e) => setTurnTimeLimit(e.target.value)}
                      className="mr-3 accent-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-white">🕐 6 Hours</span>
                      <p className="text-xs text-gray-400 mt-1">
                        Quick async - multiple turns per day
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                    <input
                      type="radio"
                      name="timeLimit"
                      value="12h"
                      checked={turnTimeLimit === '12h'}
                      onChange={(e) => setTurnTimeLimit(e.target.value)}
                      className="mr-3 accent-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-white">🕰️ 12 Hours</span>
                      <p className="text-xs text-gray-400 mt-1">Balanced async gameplay</p>
                    </div>
                  </label>
                  <label className="flex items-center p-2 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                    <input
                      type="radio"
                      name="timeLimit"
                      value="24h"
                      checked={turnTimeLimit === '24h'}
                      onChange={(e) => setTurnTimeLimit(e.target.value)}
                      className="mr-3 accent-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-white">📆 24 Hours</span>
                      <p className="text-xs text-gray-400 mt-1">Relaxed pace - one turn per day</p>
                    </div>
                  </label>
                </>
              )}
            </div>

            <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
              <p className="text-xs text-blue-300">
                {gameSpeed === 'realtime' ? (
                  <>
                    ⚡ Real-time games require active participation. Turn automatically passes if
                    time expires.
                  </>
                ) : (
                  <>
                    📅 Async games send notifications when it's your turn. Perfect for playing
                    throughout the day.
                  </>
                )}
              </p>
            </div>
          </div>
        </OptionCard>
      </div>

      {/* Map Selector - Full Width */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
            <span className="text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              11
            </span>
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
                {maps.map((map) => (
                  <div
                    key={map.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedMap === map.id
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg'
                        : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
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
  )
}

export default CreateGamePage
