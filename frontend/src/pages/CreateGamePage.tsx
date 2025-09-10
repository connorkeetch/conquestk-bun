import type React from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import {
  PLAYER_COLORS,
  PREMIUM_PLAYER_COLORS,
  getPlayerColor,
  getPremiumPlayerColor,
  type PlayerColor,
} from '../constants/colors'
import { type CreateGameData, gameService } from '../services/gameService'
import type { MovementType } from '../types/game'

// Helper function to get valid team configurations based on player count
function getValidTeamOptions(playerCount: number): number[] {
  const validOptions: number[] = []
  
  // Always can have free for all (represented as 0)
  validOptions.push(0)
  
  // Check which team sizes divide evenly into player count
  for (let teams = 2; teams <= 6; teams++) {
    if (playerCount % teams === 0 && playerCount / teams >= 2) {
      validOptions.push(teams)
    }
  }
  
  return validOptions
}

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
                : 'text-muted bg-gray-600/20 hover:bg-gray-600/30'
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
  
  // Get preferred color from settings, default to first player color
  const preferredColor = settings.game?.preferredColor || PLAYER_COLORS[0]

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
  const [selectedColor, setSelectedColor] = useState<PlayerColor>(preferredColor)
  const [turnTimeLimit, setTurnTimeLimit] = useState('24h')
  const [gameSpeed, setGameSpeed] = useState<'realtime' | 'async'>('realtime')
  const [cardTradeBonus, setCardTradeBonus] = useState('progressive')
  const [staticBonusValue, setStaticBonusValue] = useState(10)
  const [spoilsType, setSpoilsType] = useState('escalating')
  const [useTerritoryModifiers, setUseTerritoryModifiers] = useState(false)
  const [modifierDistribution, setModifierDistribution] = useState<
    'sparse' | 'balanced' | 'abundant'
  >('balanced')
  const [isRanked, setIsRanked] = useState(false)
  const [gameType, setGameType] = useState<'casual' | 'ranked'>('casual')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useAutoName, setUseAutoName] = useState(true)

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
    if (fortification === 'unlimited') specialRules.push('UnlimitedMove')
    if (fortification === 'chained') specialRules.push('ChainedMove')
    if (turnTimeLimit !== 'none') specialRules.push(turnTimeLimit)
    if (useTerritoryModifiers) specialRules.push('Modifiers')

    if (specialRules.length > 0) {
      elements.push(`[${specialRules.join('+')}]`)
    }

    return elements.join(' ')
  }

  // Auto-generate game name when auto-naming is enabled
  useEffect(() => {
    if (useAutoName) {
      setGameName(generateSmartName())
    }
  }, [
    useAutoName,
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
        name: gameName || generateSmartName(),
        maxPlayers,
        isPrivate: gameVisibility === 'private',
        isRanked,
        gameType: 'custom',
        mapId: selectedMap,
        movementType: 'classic_adjacent' as MovementType,
        allowTeamPlay: teams > 0,
        teamMode: teams > 0 ? 'teams' : 'none',
        numberOfTeams: teams > 0 ? teams : undefined,
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

  // Use new color system
  const playerColors = PLAYER_COLORS
  const premiumColors = Object.keys(PREMIUM_PLAYER_COLORS)

  return (
    <div className="min-h-screen text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-primary-soft mb-2">Create New Game</h1>
            <p className="text-muted">
              Configure your perfect strategic warfare experience
              {guntsPrescriptions && (
                <span className="block mt-1 text-sm text-violet-soft italic">
                  💊 "Just what the doctor ordered!" - Dr. Gunt
                </span>
              )}
            </p>
          </div>
          <Link
            to="/lobby"
            className="px-4 py-2 bg-surface-2 hover:bg-surface-1 text-white rounded-lg transition-colors"
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

      {/* Game Name and Visibility at the top - More condensed */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="bg-surface-2/50 backdrop-blur-md rounded-xl p-4 border border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Game Name */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-white">Game Name</label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAutoName}
                    onChange={(e) => {
                      setUseAutoName(e.target.checked)
                      if (e.target.checked) {
                        setGameName(generateSmartName())
                      } else {
                        setGameName('')
                      }
                    }}
                    className="mr-2 accent-violet"
                  />
                  <span className="text-xs text-muted">Auto-name</span>
                </label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={useAutoName ? generateSmartName() : "Enter custom game name"}
                  className={`w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-white placeholder-gray-400 focus:border-violet focus:outline-none transition-all duration-200 pr-12 ${
                    useAutoName ? 'bg-surface-2/50 cursor-not-allowed' : ''
                  }`}
                  value={gameName}
                  onChange={(e) => {
                    if (!useAutoName) {
                      setGameName(e.target.value)
                    }
                  }}
                  disabled={useAutoName}
                />
                <div className="absolute right-1 top-1 flex gap-1">
                  {!useAutoName && (
                    <button
                      type="button"
                      onClick={() => setGameName(generateSmartName())}
                      className="p-1.5 text-violet-soft hover:text-violet-soft bg-blue-900/30 hover:bg-blue-900/50 rounded transition-all"
                      title="Generate smart name"
                    >
                      ✨
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted mt-1">
                {useAutoName 
                  ? 'Name auto-updates based on your settings' 
                  : gameName 
                    ? 'Using custom name' 
                    : 'Enter a custom name for your game'
                }
              </p>
            </div>

            {/* Game Settings Combined */}
            <div>
              <label className="block text-sm font-medium mb-3 text-white">Game Settings</label>
              
              {/* Game Visibility */}
              <div className="mb-4">
                <p className="text-xs text-muted mb-2">Visibility</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGameVisibility('public')}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      gameVisibility === 'public'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    🌍 Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameVisibility('private')}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      gameVisibility === 'private'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    🔒 Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameVisibility('tournament')}
                    disabled
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      gameVisibility === 'tournament'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted cursor-not-allowed opacity-50'
                    }`}
                  >
                    🏆 Tournament
                  </button>
                </div>
              </div>

              {/* Game Type - Ranked/Casual */}
              <div className="mb-4">
                <p className="text-xs text-muted mb-2">Game Type</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGameType('casual')
                      setIsRanked(false)
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      gameType === 'casual'
                        ? 'bg-green-600 text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    😎 Casual
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGameType('ranked')
                      setIsRanked(true)
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      gameType === 'ranked'
                        ? 'bg-purple-600 text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    ⚔️ Ranked
                  </button>
                </div>
              </div>

              {/* Time Limit */}
              <div className="mb-4">
                <p className="text-xs text-muted mb-2">Turn Time Limit</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTurnTimeLimit('24h')}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      turnTimeLimit === '24h'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    📆 24 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setTurnTimeLimit('12h')}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      turnTimeLimit === '12h'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    🕰️ 12 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setTurnTimeLimit('6h')}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      turnTimeLimit === '6h'
                        ? 'bg-violet text-white'
                        : 'bg-surface-2 text-muted hover:bg-gray-600'
                    }`}
                  >
                    🕐 6 Hours
                  </button>
                </div>
              </div>

              {/* Private Game Invite Code */}
              {gameVisibility === 'private' && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Enter invite code (e.g., GAME123)"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-white placeholder-gray-400 focus:border-violet focus:outline-none transition-all duration-200"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-muted mt-1">Players will need this code to join</p>
                </div>
              )}
            </div>
          </div>

          {/* Ranked Game Info */}
          {isRanked && (
            <div className="mt-6 p-4 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-500/30">
              <div className="p-3 bg-yellow-900/30 rounded-lg border border-yellow-600/50">
                <p className="text-sm font-semibold text-yellow-400 mb-2">⚔️ Ranked Game Requirements:</p>
                <ul className="text-xs text-muted space-y-1">
                  <li>• Minimum 3 players required</li>
                  <li>• No AI players allowed</li>
                  <li>• Must be a public game</li>
                  <li>• No team play</li>
                  <li>• Rating changes based on final position</li>
                  <li>• Skill difference limit: ±500 CP</li>
                </ul>
              </div>
            </div>
          )}

          {/* Randomize Settings */}
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleRandomizeSettings}
              disabled={isRanked}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                isRanked
                  ? 'bg-surface-2 text-muted cursor-not-allowed'
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

      {/* Responsive Grid Container - More condensed */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* 1. Game Mode Card */}
        <OptionCard 
          number="1" 
          title="Game Mode"
          lockable={!isRanked}
          isLocked={lockedSettings.has('gameMode')}
          onToggleLock={() => toggleLock('gameMode')}
        >
          <div className="space-y-2">
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
              <input
                type="radio"
                name="gameMode"
                value="classic"
                checked={gameMode === 'classic'}
                onChange={(e) => setGameMode(e.target.value)}
                className="mr-3 accent-violet"
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
                className="mr-3 accent-violet"
              />
              <div className="flex-1">
                <span className="text-white">Capitals</span>
                <p className="text-xs text-muted mt-1">Protect your capital territory to win</p>
              </div>
            </label>
            <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200 relative overflow-hidden">
              <input
                type="radio"
                name="gameMode"
                value="domination"
                checked={gameMode === 'domination'}
                onChange={(e) => setGameMode(e.target.value)}
                className="mr-3 accent-violet"
                disabled
              />
              <div className="flex-1">
                <span className="text-muted">Domination</span>
                <p className="text-xs text-muted mt-1">Control key strategic points</p>
              </div>
              <div className="absolute top-1 right-1">
                <span className="text-xs bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-0.5 text-orange-400 font-semibold">
                  Soon
                </span>
              </div>
            </label>
          </div>
        </OptionCard>

        {/* 2. Number of Players Card */}
        <OptionCard
          number="2"
          title="Number of Players"
          lockable={!isRanked}
          isLocked={lockedSettings.has('maxPlayers')}
          onToggleLock={() => toggleLock('maxPlayers')}
        >
          <div className="grid grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => {
              const playerCount = i + 1
              const validTeamOptions = getValidTeamOptions(playerCount)
              const isTeamCompatible = teams === 0 || validTeamOptions.includes(teams)
              const isDisabled = playerCount === 1 || (teams > 0 && !isTeamCompatible)
              
              return (
                <button
                  key={playerCount}
                  className={`p-3 rounded-lg font-bold transition-all duration-200 ${
                    isDisabled
                      ? 'bg-white/5 text-muted cursor-not-allowed opacity-50'
                      : maxPlayers === playerCount
                        ? 'bg-violet text-white shadow-lg'
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

        {/* 3. Teams Card */}
        <OptionCard
          number="3"
          title="Teams"
          lockable={!isRanked}
          isLocked={lockedSettings.has('teams')}
          onToggleLock={() => toggleLock('teams')}
        >
          <div className="grid grid-cols-1 gap-2">
            {[0, 2, 3, 4, 5, 6].map((teamOption) => {
              const validTeamOptions = getValidTeamOptions(maxPlayers)
              const isValid = validTeamOptions.includes(teamOption)
              
              return (
                <button
                  key={teamOption}
                  type="button"
                  onClick={() => isValid && setTeams(teamOption)}
                  disabled={!isValid}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    !isValid
                      ? 'bg-white/5 text-muted cursor-not-allowed opacity-50'
                      : teams === teamOption
                        ? 'bg-violet text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {teamOption === 0 ? 'Free for All' : `${teamOption} Teams (${Math.floor(maxPlayers / teamOption)} each)`}
                </button>
              )
            })}
          </div>
          {teams > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm text-muted mb-2">Team Assignment:</p>
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

        {/* 4. Turn Time Limits Card */}
        <OptionCard
          number="4"
          title="Turn Time Limits"
          lockable={!isRanked}
          isLocked={lockedSettings.has('turnTimeLimit')}
          onToggleLock={() => toggleLock('turnTimeLimit')}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted mb-2">Real-Time Games</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(5)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    turnTimeLimit === 5
                      ? 'bg-violet text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  5 minutes
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(10)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    turnTimeLimit === 10
                      ? 'bg-violet text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  10 minutes
                </button>
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted mb-2">Long-Term Games</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(6 * 60)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    turnTimeLimit === 6 * 60
                      ? 'bg-violet text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  6 hours
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(12 * 60)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    turnTimeLimit === 12 * 60
                      ? 'bg-violet text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  12 hours
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(24 * 60)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    turnTimeLimit === 24 * 60
                      ? 'bg-violet text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  24 hours
                </button>
              </div>
            </div>
          </div>
        </OptionCard>

        {/* 5. Fortification Card */}
        <OptionCard
          number="5"
          title="Fortification"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fortification')}
          onToggleLock={() => toggleLock('fortification')}
        >
          <div className="grid grid-cols-1 gap-2">
            {[
              { value: 'adjacent', label: '🔗 Adjacent Only', description: 'Move troops only between connected territories' },
              { value: 'unlimited', label: '🌍 Unlimited', description: 'Move troops between any owned territories' }
            ].map(option => (
              <span 
                key={option.value}
                className={`group relative px-3 py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer ${
                  fortification === option.value
                    ? 'bg-violet text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                onClick={() => setFortification(option.value)}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {/* Hover tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 absolute left-full top-0 ml-2 px-3 py-2 bg-surface-1 text-muted text-xs rounded-lg shadow-lg z-10 whitespace-nowrap transition-opacity duration-200 pointer-events-none">
                    {option.description}
                  </div>
                </div>
              </span>
            ))}
          </div>
        </OptionCard>

        {/* 6. Spoils of War Card */}
        <OptionCard
          number="6"
          title="Spoils of War"
          lockable={!isRanked}
          isLocked={lockedSettings.has('spoilsType')}
          onToggleLock={() => toggleLock('spoilsType')}
        >
          <div className="grid grid-cols-1 gap-2">
            {[
              { value: 'escalating', label: '📈 Escalating', description: 'Card values increase each turn (2,4,6,8...)' },
              { value: 'fixed', label: '⚖️ Fixed Value', description: 'Cards always worth the same amount' },
              { value: 'static', label: '🔒 Static', description: 'No card bonuses, pure strategy' }
            ].map(option => (
              <span 
                key={option.value}
                className={`group relative px-3 py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer ${
                  spoilsType === option.value
                    ? 'bg-violet text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                onClick={() => setSpoilsType(option.value)}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {/* Hover tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 absolute left-full top-0 ml-2 px-3 py-2 bg-surface-1 text-muted text-xs rounded-lg shadow-lg z-10 whitespace-nowrap transition-opacity duration-200 pointer-events-none">
                    {option.description}
                  </div>
                </div>
              </span>
            ))}
          </div>
        </OptionCard>

        {/* 7. Advanced Options Card */}
        <OptionCard
          number="7"
          title="Advanced Options"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fogOfWar') || lockedSettings.has('territoryModifiers')}
          onToggleLock={() => {
            toggleLock('fogOfWar')
            toggleLock('territoryModifiers')
          }}
        >
          <div className="space-y-6">
            {/* Fog of War Section */}
            <div>
              <h4 className="text-sm font-medium text-white mb-3">☀️ Fog of War</h4>
              <div className="space-y-2">
                <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                  <input
                    type="radio"
                    name="fog"
                    value="off"
                    checked={fogOfWar === 'off'}
                    onChange={(e) => setFogOfWar(e.target.value)}
                    className="mr-3 accent-violet"
                  />
                  <div className="flex-1">
                    <span className="text-white">☀️ No Fog</span>
                    <p className="text-xs text-muted mt-1">See entire map at all times</p>
                  </div>
                </label>
                <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                  <input
                    type="radio"
                    name="fog"
                    value="adjacent"
                    checked={fogOfWar === 'adjacent'}
                    onChange={(e) => setFogOfWar(e.target.value)}
                    className="mr-3 accent-violet"
                  />
                  <div className="flex-1">
                    <span className="text-white">🔗 Adjacent Only</span>
                    <p className="text-xs text-muted mt-1">Only see territories next to your own</p>
                  </div>
                </label>
                <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                  <input
                    type="radio"
                    name="fog"
                    value="persistent"
                    checked={fogOfWar === 'persistent'}
                    onChange={(e) => setFogOfWar(e.target.value)}
                    className="mr-3 accent-violet"
                  />
                  <div className="flex-1">
                    <span className="text-white">🗺️ Persistent Vision</span>
                    <p className="text-xs text-muted mt-1">
                      Once revealed, territories stay visible
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Territory Modifiers Section */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-white mb-3">⚡ Territory Modifiers</h4>
              <div className="space-y-3">
                <label className="flex items-center p-3 bg-white/10 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/20 transition-all duration-200">
                  <input
                    type="checkbox"
                    checked={useTerritoryModifiers}
                    onChange={(e) => setUseTerritoryModifiers(e.target.checked)}
                    className="mr-3 accent-violet"
                  />
                  <div className="flex-1">
                    <span className="text-white">Enable Territory Modifiers</span>
                    <p className="text-xs text-muted mt-1">
                      Add special properties to territories (defense bonuses, supply lines, etc.)
                    </p>
                  </div>
                </label>

                {useTerritoryModifiers && (
                  <div className="mt-3 pt-3 border-t border-gray-500">
                    <p className="text-sm text-muted mb-2">Modifier Distribution:</p>
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
                          <p className="text-xs text-muted">Few strategic territories</p>
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
                          <p className="text-xs text-muted">Moderate strategic depth</p>
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
                          <p className="text-xs text-muted">Many strategic territories</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </OptionCard>
      </div>

      {/* Choose Your Color - Before Map Selection */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl hover:shadow-2xl">
          <h2 className="text-lg font-bold flex items-center gap-3 mb-4">
            <span className="text-2xl bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              8
            </span>
            <span className="text-white">Choose Your Color</span>
          </h2>
          <div className="space-y-4">
            {/* Standard Player Colors */}
            <div>
              <p className="text-xs text-muted mb-2">Player Colors</p>
              <div className="grid grid-cols-6 gap-2">
                {PLAYER_COLORS.map((hexColor, index) => {
                  return (
                    <button
                      key={hexColor}
                      className={`group relative h-10 w-10 rounded border transition-all ${
                        selectedColor === hexColor
                          ? 'border-white scale-110 shadow-lg ring-2 ring-white/50'
                          : 'border-border hover:border-gray-400 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hexColor }}
                      onClick={() => setSelectedColor(hexColor)}
                    >
                      {selectedColor === hexColor && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold drop-shadow-lg">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Premium Colors */}
            <div>
              <p className="text-xs text-muted mb-2">Premium Colors</p>
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(PREMIUM_PLAYER_COLORS).map(([key, colorData]) => {
                  const hasGradient = 'gradient' in colorData
                  const colorValue = hasGradient ? colorData.gradient : colorData.solid
                  
                  return (
                    <button
                      key={key}
                      className={`group relative h-10 w-10 rounded border transition-all ${
                        selectedColor === key
                          ? 'border-yellow-400 scale-110 shadow-lg ring-2 ring-yellow-400/50'
                          : 'border-border hover:border-yellow-600 hover:scale-105'
                      } ${key === 'NeonGreen' ? 'shadow-[0_0_6px_rgba(57,255,20,0.3)]' : ''}`}
                      style={{
                        background: hasGradient ? colorValue : undefined,
                        backgroundColor: !hasGradient ? colorValue : undefined,
                      }}
                      onClick={() => setSelectedColor(key)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-yellow-400 text-xs">⭐</span>
                        {selectedColor === key && (
                          <span className="text-white text-sm font-bold drop-shadow-lg ml-1">✓</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Selector - Full Width */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
            <span className="text-2xl bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              9
            </span>
            <span className="text-white">Select Map</span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map List */}
            <div className="lg:col-span-1">
              <input
                placeholder="Search maps..."
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-white placeholder-muted mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {maps.map((map) => (
                  <div
                    key={map.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedMap === map.id
                        ? 'bg-violet shadow-lg'
                        : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                    }`}
                    onClick={() => setSelectedMap(map.id)}
                  >
                    <div className="font-bold text-white">{map.name}</div>
                    <div className="text-sm text-muted">
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
                  <span className="text-muted">Map Preview (Coming Soon)</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted">Map Size:</span>
                    <span className="ml-2 text-white">Large</span>
                  </div>
                  <div>
                    <span className="text-muted">Territories:</span>
                    <span className="ml-2 text-white">42</span>
                  </div>
                  <div>
                    <span className="text-muted">Regions:</span>
                    <span className="ml-2 text-white">6</span>
                  </div>
                  <div>
                    <span className="text-muted">Games Played:</span>
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
          className="flex-1 py-3 bg-violet hover:brightness-110 disabled:bg-surface-2 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105"
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
