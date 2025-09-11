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

// Map MovementType to fortification display names
const movementTypeToFortification = (movementType: MovementType): string => {
  switch (movementType) {
    case 'classic_adjacent':
      return 'adjacent'
    case 'adjacent_multi':
      return 'adjacent_multi'
    case 'path_single':
      return 'chained'
    case 'path_multi':
      return 'unlimited'
    default:
      return 'adjacent'
  }
}

const fortificationToMovementType = (fortification: string): MovementType => {
  switch (fortification) {
    case 'adjacent':
      return 'classic_adjacent'
    case 'adjacent_multi':
      return 'adjacent_multi'
    case 'chained':
      return 'path_single'
    case 'unlimited':
      return 'path_multi'
    default:
      return 'classic_adjacent'
  }
}

// Get color name helper
const getColorName = (color: string | PlayerColor): string => {
  // Check if it's a premium color
  if (color in PREMIUM_PLAYER_COLORS) {
    // Map premium color keys to display names
    const premiumNames: Record<string, string> = {
      Gold: 'Gold',
      Silver: 'Silver',
      Bronze: 'Bronze',
      Rainbow: 'Rainbow',
      NeonGreen: 'Neon Green',
      Electric: 'Electric',
    }
    return premiumNames[color] || color
  }
  
  // Map standard colors to names
  const standardColorNames: Record<string, string> = {
    '#FF0000': 'Red',
    '#0000FF': 'Blue',
    '#00FF00': 'Green',
    '#FFFF00': 'Yellow',
    '#800080': 'Purple',
    '#FFA500': 'Orange',
    '#00FFFF': 'Cyan',
    '#FFC0CB': 'Pink',
    '#A52A2A': 'Brown',
    '#32CD32': 'Lime',
    '#4B0082': 'Indigo',
    '#008080': 'Teal',
  }
  
  return standardColorNames[color] || 'Custom'
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
  className?: string
}

const OptionCard: React.FC<OptionCardProps> = ({
  number,
  title,
  children,
  comingSoon = false,
  lockable = false,
  isLocked = false,
  onToggleLock,
  className = '',
}) => (
  <div
    className={`bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl hover:shadow-2xl ${comingSoon ? 'opacity-50' : ''} ${className}`}
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
  const [gameMode, setGameMode] = useState<'classic' | 'capitals' | 'random'>('classic')
  const [fogOfWar, setFogOfWar] = useState<'off' | 'adjacent' | 'persistent' | 'random'>('off')
  const [teams, setTeams] = useState<number | 'random'>(0)
  const [teamAssignment, setTeamAssignment] = useState('random')
  const [fortification, setFortification] = useState<'adjacent' | 'adjacent_multi' | 'chained' | 'unlimited' | 'random'>('adjacent')
  const [selectedColor, setSelectedColor] = useState<PlayerColor>(preferredColor)
  const [turnTimeLimit, setTurnTimeLimit] = useState(24 * 60) // in minutes
  const [gameSpeed, setGameSpeed] = useState<'realtime' | 'async'>('async')
  const [cardTradeBonus, setCardTradeBonus] = useState('progressive')
  const [staticBonusValue, setStaticBonusValue] = useState(10)
  const [spoilsType, setSpoilsType] = useState<'escalating' | 'fixed' | 'static' | 'random'>('escalating')
  const [useTerritoryModifiers, setUseTerritoryModifiers] = useState<boolean | 'random'>(false)
  const [modifierDistribution, setModifierDistribution] = useState<
    'sparse' | 'balanced' | 'abundant'
  >('balanced')
  const [isRanked, setIsRanked] = useState(false)
  const [gameType, setGameType] = useState<'casual' | 'ranked'>('casual')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useAutoName, setUseAutoName] = useState(true)
  const [playersOption, setPlayersOption] = useState<number | 'random'>(6)
  const [createAndStay, setCreateAndStay] = useState(false)

  // Settings lock state for randomization
  const [lockedSettings, setLockedSettings] = useState<Set<string>>(new Set())

  // Mock maps data (moved here so it's available for generateSmartName)
  const maps = [
    { id: 'classic', name: 'Classic World', territories: 42, players: '2-6', size: 'Large' },
    { id: 'europe', name: 'Europe', territories: 24, players: '2-4', size: 'Medium' },
    { id: 'asia', name: 'Asia', territories: 30, players: '2-5', size: 'Large' },
    { id: 'random', name: 'Random Map', territories: 0, players: 'Any', size: 'Random' },
  ]

  // Generate smart game name
  const generateSmartName = () => {
    const mapName = maps.find((m) => m.id === selectedMap)?.name || 'Classic'
    const playerText = playersOption === 'random' ? 'RND-P' : `${maxPlayers}P`

    // Build descriptive elements
    const elements = []

    // Ranked indicator
    if (isRanked) elements.push('[RANKED]')

    // Player count
    elements.push(playerText)

    // Team configuration
    if (teams === 'random') {
      elements.push('RND-Teams')
    } else if (teams > 0) {
      elements.push(`${teams}v${Math.floor(maxPlayers / teams)}`)
    } else {
      elements.push('FFA')
    }

    // Map name
    elements.push(selectedMap === 'random' ? 'RND-Map' : mapName)

    // Special rules (only include if not default)
    const specialRules = []
    if (gameMode === 'capitals') specialRules.push('Capitals')
    if (gameMode === 'random') specialRules.push('RND-Mode')
    if (fogOfWar === 'adjacent') specialRules.push('Fog')
    if (fogOfWar === 'persistent') specialRules.push('PersistentFog')
    if (fogOfWar === 'random') specialRules.push('RND-Fog')
    if (fortification === 'unlimited') specialRules.push('UnlimitedMove')
    if (fortification === 'chained') specialRules.push('ChainedMove')
    if (fortification === 'adjacent_multi') specialRules.push('MultiMove')
    if (fortification === 'random') specialRules.push('RND-Fort')
    if (turnTimeLimit !== 24 * 60) {
      if (turnTimeLimit < 60) specialRules.push(`${turnTimeLimit}min`)
      else specialRules.push(`${Math.floor(turnTimeLimit / 60)}h`)
    }
    if (useTerritoryModifiers === true) specialRules.push('Modifiers')
    if (useTerritoryModifiers === 'random') specialRules.push('RND-Mods')
    if (spoilsType === 'random') specialRules.push('RND-Spoils')

    if (specialRules.length > 0) {
      elements.push(`[${specialRules.join('+')}]`)
    }

    return elements.join(' ')
  }

  // Update maxPlayers when playersOption changes
  useEffect(() => {
    if (playersOption !== 'random') {
      setMaxPlayers(playersOption)
    }
  }, [playersOption])

  // Auto-generate game name when auto-naming is enabled
  useEffect(() => {
    if (useAutoName) {
      setGameName(generateSmartName())
    }
  }, [
    useAutoName,
    maxPlayers,
    playersOption,
    teams,
    selectedMap,
    gameMode,
    fogOfWar,
    fortification,
    useTerritoryModifiers,
    isRanked,
    spoilsType,
    turnTimeLimit,
  ])

  // Update placeholder to show what auto-name would be
  const gameNamePlaceholder = generateSmartName()

  // Validate ranked game settings
  useEffect(() => {
    if (isRanked) {
      // Enforce ranked game requirements
      if (maxPlayers < 3) {
        setMaxPlayers(3)
        setPlayersOption(3)
      }
      if (gameVisibility === 'private') {
        setGameVisibility('public')
      }
      if (teams !== 0) {
        setTeams(0)
      }
      // Reset random options
      if (gameMode === 'random') setGameMode('classic')
      if (teams === 'random') setTeams(0)
      if (fogOfWar === 'random') setFogOfWar('off')
      if (fortification === 'random') setFortification('adjacent')
      if (spoilsType === 'random') setSpoilsType('escalating')
      if (useTerritoryModifiers === 'random') setUseTerritoryModifiers(false)
      if (playersOption === 'random') setPlayersOption(6)
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

      // Resolve random options
      let finalGameMode = gameMode === 'random' 
        ? ['classic', 'capitals'][Math.floor(Math.random() * 2)] as 'classic' | 'capitals'
        : gameMode as 'classic' | 'capitals'
      
      let finalPlayers = playersOption === 'random'
        ? Math.floor(Math.random() * 6) + 2
        : maxPlayers
        
      let finalTeams = teams === 'random'
        ? getValidTeamOptions(finalPlayers)[Math.floor(Math.random() * getValidTeamOptions(finalPlayers).length)]
        : teams
        
      let finalFortification = fortification === 'random'
        ? ['adjacent', 'adjacent_multi', 'chained', 'unlimited'][Math.floor(Math.random() * 4)] as 'adjacent' | 'adjacent_multi' | 'chained' | 'unlimited'
        : fortification
        
      let finalSpoils = spoilsType === 'random'
        ? ['escalating', 'fixed', 'static'][Math.floor(Math.random() * 3)] as 'escalating' | 'fixed' | 'static'
        : spoilsType
        
      let finalFog = fogOfWar === 'random'
        ? ['off', 'adjacent', 'persistent'][Math.floor(Math.random() * 3)] as 'off' | 'adjacent' | 'persistent'
        : fogOfWar
        
      let finalModifiers = useTerritoryModifiers === 'random'
        ? Math.random() > 0.5
        : useTerritoryModifiers as boolean
        
      let finalMap = selectedMap === 'random'
        ? maps.filter(m => m.id !== 'random')[Math.floor(Math.random() * (maps.length - 1))].id
        : selectedMap

      const gameData: CreateGameData = {
        name: gameName || generateSmartName(),
        maxPlayers: finalPlayers,
        isPrivate: gameVisibility === 'private',
        isRanked,
        gameType: 'custom',
        mapId: finalMap,
        movementType: fortificationToMovementType(finalFortification),
        allowTeamPlay: finalTeams > 0,
        teamMode: finalTeams > 0 ? 'teams' : 'none',
        numberOfTeams: finalTeams > 0 ? finalTeams : undefined,
        capitalsEnabled: finalGameMode === 'capitals',
        useTerritoryModifiers: finalModifiers,
        modifierDistribution: finalModifiers ? modifierDistribution : 'none',
      }

      const response = await gameService.createRoom(gameData)

      if (response.room) {
        if (createAndStay) {
          // Clear form for next game
          setGameName('')
          setUseAutoName(true)
          setError(null)
          // Show success message
          setError(`✅ Game "${response.room.name}" created successfully! Create another?`)
        } else {
          navigate(`/room/${response.room.id}`)
        }
      } else {
        throw new Error('Failed to create game room')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create game')
    } finally {
      setIsCreating(false)
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
      {/* Header with integrated game name */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-3xl font-bold text-primary-soft">Create New Game</h1>
              {/* Small game name box next to header */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={useAutoName ? generateSmartName() : "Game name"}
                  className={`px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-white placeholder-gray-400 focus:border-primary focus:outline-none transition-all duration-200 text-sm w-64 ${
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
                <label className="flex items-center cursor-pointer" title="Auto-generate game name">
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
                    className="mr-1.5 accent-violet"
                  />
                  <span className="text-xs text-muted whitespace-nowrap">Auto-name</span>
                </label>
              </div>
            </div>
            <p className="text-muted">
              Configure your perfect strategic warfare experience
              {guntsPrescriptions && (
                <span className="block mt-1 text-sm text-primary-soft italic">
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
        <div className={`max-w-7xl mx-auto mb-6 p-4 ${error.startsWith('✅') ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'} border rounded-lg`}>
          <div className="flex items-center space-x-2">
            <span className={error.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
              {error.startsWith('✅') ? '' : '❌'}
            </span>
            <span className={error.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>{error}</span>
          </div>
        </div>
      )}

      {/* Responsive Grid Container - 10 boxes layout */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* 1. Game Settings Card */}
        <OptionCard number="1" title="Game Settings">
          <div className="space-y-4">
            {/* Visibility */}
            <div>
              <p className="text-xs text-muted mb-2">Visibility</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGameVisibility('public')}
                  className={`flex-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    gameVisibility === 'public'
                      ? 'bg-primary text-white'
                      : 'bg-surface-2 text-muted hover:bg-gray-600'
                  }`}
                >
                  🌍 Public
                </button>
                <button
                  type="button"
                  onClick={() => setGameVisibility('private')}
                  className={`flex-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    gameVisibility === 'private'
                      ? 'bg-primary text-white'
                      : 'bg-surface-2 text-muted hover:bg-gray-600'
                  }`}
                >
                  🔒 Private
                </button>
              </div>
            </div>

            {/* Game Type */}
            <div>
              <p className="text-xs text-muted mb-2">Game Type</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGameType('casual')
                    setIsRanked(false)
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    gameType === 'casual'
                      ? 'bg-green-600 text-white'
                      : 'bg-surface-2 text-muted hover:bg-gray-600'
                  }`}
                >
                  😎 Casual
                  <p className="text-xs opacity-70 mt-0.5">For fun</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameType('ranked')
                    setIsRanked(true)
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    gameType === 'ranked'
                      ? 'bg-purple-600 text-white'
                      : 'bg-surface-2 text-muted hover:bg-gray-600'
                  }`}
                >
                  ⚔️ Ranked
                  <p className="text-xs opacity-70 mt-0.5">Affects rating</p>
                </button>
              </div>
            </div>

            {/* Private Game Invite Code */}
            {gameVisibility === 'private' && (
              <div>
                <input
                  type="text"
                  placeholder="Enter invite code (e.g., GAME123)"
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-white placeholder-gray-400 focus:border-primary focus:outline-none transition-all duration-200"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted mt-1">Players will need this code to join</p>
              </div>
            )}
          </div>
        </OptionCard>

        {/* 2. Game Mode Card */}
        <OptionCard 
          number="2" 
          title="Game Mode"
          lockable={!isRanked}
          isLocked={lockedSettings.has('gameMode')}
          onToggleLock={() => toggleLock('gameMode')}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setGameMode('classic')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                gameMode === 'classic'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium">⚔️ Classic Risk</div>
              <p className="text-xs opacity-70 mt-1">Conquer all territories to win</p>
            </button>
            <button
              type="button"
              onClick={() => setGameMode('capitals')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                gameMode === 'capitals'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium">🏰 Capitals</div>
              <p className="text-xs opacity-70 mt-1">Protect your capital territory to stay alive</p>
            </button>
            {!isRanked && (
              <button
                type="button"
                onClick={() => setGameMode('random')}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  gameMode === 'random'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="font-medium">🎲 Random</div>
                <p className="text-xs opacity-70 mt-1">Game mode chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* 3. Turn Time Limits Card */}
        <OptionCard
          number="3"
          title="Turn Time Limits"
          lockable={!isRanked}
          isLocked={lockedSettings.has('turnTimeLimit')}
          onToggleLock={() => toggleLock('turnTimeLimit')}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted mb-2">⚡ Real-Time Games</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(5)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 5
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  5 min
                  <p className="text-xs opacity-70">Quick</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(10)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 10
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  10 min
                  <p className="text-xs opacity-70">Normal</p>
                </button>
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted mb-2">📅 Long-Term Games</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(6 * 60)}
                  className={`px-2 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 6 * 60
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  6h
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(12 * 60)}
                  className={`px-2 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 12 * 60
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  12h
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(24 * 60)}
                  className={`px-2 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 24 * 60
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  24h
                  <p className="text-xs opacity-70">Default</p>
                </button>
              </div>
            </div>
          </div>
        </OptionCard>

        {/* 4. Number of Players Card */}
        <OptionCard
          number="4"
          title="Number of Players"
          lockable={!isRanked}
          isLocked={lockedSettings.has('maxPlayers')}
          onToggleLock={() => toggleLock('maxPlayers')}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map((playerCount) => {
                const validTeamOptions = getValidTeamOptions(playerCount)
                const isTeamCompatible = teams === 0 || teams === 'random' || validTeamOptions.includes(teams as number)
                const isDisabled = teams !== 0 && teams !== 'random' && !isTeamCompatible
                
                return (
                  <button
                    key={playerCount}
                    className={`p-3 rounded-lg font-bold transition-all duration-200 ${
                      isDisabled
                        ? 'bg-white/5 text-muted cursor-not-allowed opacity-50'
                        : playersOption === playerCount
                          ? 'bg-primary text-white shadow-lg'
                          : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20'
                    }`}
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setPlayersOption(playerCount)}
                  >
                    {playerCount}
                  </button>
                )
              })}
              {!isRanked && (
                <button
                  className={`p-3 rounded-lg font-bold transition-all duration-200 ${
                    playersOption === 'random'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                      : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20'
                  }`}
                  onClick={() => setPlayersOption('random')}
                >
                  🎲
                </button>
              )}
            </div>
            <p className="text-xs text-muted">
              {playersOption === 'random' 
                ? 'Random player count (2-8) chosen when game starts'
                : `Game will start with ${playersOption} players`
              }
            </p>
          </div>
        </OptionCard>

        {/* 5. Teams Card */}
        <OptionCard
          number="5"
          title="Teams"
          lockable={!isRanked}
          isLocked={lockedSettings.has('teams')}
          onToggleLock={() => toggleLock('teams')}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTeams(0)}
              className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                teams === 0
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">Free for All</div>
              <p className="text-xs opacity-70">Every player for themselves</p>
            </button>
            
            {playersOption !== 'random' && [2, 3, 4].map((teamOption) => {
              const validTeamOptions = getValidTeamOptions(maxPlayers)
              const isValid = validTeamOptions.includes(teamOption)
              
              return isValid ? (
                <button
                  key={teamOption}
                  type="button"
                  onClick={() => setTeams(teamOption)}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    teams === teamOption
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="font-medium text-sm">{teamOption} Teams</div>
                  <p className="text-xs opacity-70">{Math.floor(maxPlayers / teamOption)} players per team</p>
                </button>
              ) : null
            })}
            
            {!isRanked && (
              <button
                type="button"
                onClick={() => setTeams('random')}
                className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                  teams === 'random'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="font-medium text-sm">🎲 Random Teams</div>
                <p className="text-xs opacity-70">Team configuration chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* 6. Fortification Card */}
        <OptionCard
          number="6"
          title="Fortification"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fortification')}
          onToggleLock={() => toggleLock('fortification')}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setFortification('adjacent')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                fortification === 'adjacent'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">🔗 Adjacent Only</div>
              <p className="text-xs opacity-70">Move troops only between connected territories</p>
            </button>
            
            <button
              type="button"
              onClick={() => setFortification('adjacent_multi')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                fortification === 'adjacent_multi'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">🔄 Adjacent Multiple</div>
              <p className="text-xs opacity-70">Multiple moves between adjacent territories</p>
            </button>
            
            <button
              type="button"
              onClick={() => setFortification('chained')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                fortification === 'chained'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">⛓️ Chained</div>
              <p className="text-xs opacity-70">Move along a path of connected territories</p>
            </button>
            
            <button
              type="button"
              onClick={() => setFortification('unlimited')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                fortification === 'unlimited'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">🌍 Unlimited</div>
              <p className="text-xs opacity-70">Move between any owned territories</p>
            </button>
            
            {!isRanked && (
              <button
                type="button"
                onClick={() => setFortification('random')}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  fortification === 'random'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="font-medium text-sm">🎲 Random</div>
                <p className="text-xs opacity-70">Fortification type chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* 7. Spoils of War Card */}
        <OptionCard
          number="7"
          title="Spoils of War"
          lockable={!isRanked}
          isLocked={lockedSettings.has('spoilsType')}
          onToggleLock={() => toggleLock('spoilsType')}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSpoilsType('escalating')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                spoilsType === 'escalating'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">📈 Escalating</div>
              <p className="text-xs opacity-70">Card values increase each turn (2,4,6,8...)</p>
            </button>
            
            <button
              type="button"
              onClick={() => setSpoilsType('fixed')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                spoilsType === 'fixed'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">⚖️ Fixed Value</div>
              <p className="text-xs opacity-70">Cards always worth the same amount</p>
            </button>
            
            <button
              type="button"
              onClick={() => setSpoilsType('static')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                spoilsType === 'static'
                  ? 'bg-primary text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">🔒 Static</div>
              <p className="text-xs opacity-70">No card bonuses, pure strategy</p>
            </button>
            
            {!isRanked && (
              <button
                type="button"
                onClick={() => setSpoilsType('random')}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  spoilsType === 'random'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="font-medium text-sm">🎲 Random</div>
                <p className="text-xs opacity-70">Card bonus type chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* 8. Advanced Options Card */}
        <OptionCard
          number="8"
          title="Advanced Options"
          lockable={!isRanked}
          isLocked={lockedSettings.has('fogOfWar') || lockedSettings.has('territoryModifiers')}
          onToggleLock={() => {
            toggleLock('fogOfWar')
            toggleLock('territoryModifiers')
          }}
        >
          <div className="space-y-4">
            {/* Fog of War Section */}
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Fog of War</h4>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setFogOfWar('off')}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    fogOfWar === 'off'
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">☀️ No Fog</div>
                  <p className="text-xs opacity-70">See entire map</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFogOfWar('adjacent')}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    fogOfWar === 'adjacent'
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">🔗 Adjacent</div>
                  <p className="text-xs opacity-70">See neighbors only</p>
                </button>
                {!isRanked && (
                  <button
                    type="button"
                    onClick={() => setFogOfWar('random')}
                    className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                      fogOfWar === 'random'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <div className="text-sm">🎲 Random</div>
                    <p className="text-xs opacity-70">Random fog setting</p>
                  </button>
                )}
              </div>
            </div>

            {/* Territory Modifiers Section */}
            <div className="pt-3 border-t border-border">
              <h4 className="text-sm font-medium text-white mb-2">Territory Modifiers</h4>
              <button
                type="button"
                onClick={() => {
                  if (useTerritoryModifiers === false) setUseTerritoryModifiers(true)
                  else if (useTerritoryModifiers === true && !isRanked) setUseTerritoryModifiers('random')
                  else setUseTerritoryModifiers(false)
                }}
                className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                  useTerritoryModifiers === true
                    ? 'bg-primary text-white'
                    : useTerritoryModifiers === 'random'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="text-sm">
                  {useTerritoryModifiers === true && '⚡ Enabled'}
                  {useTerritoryModifiers === false && '❌ Disabled'}
                  {useTerritoryModifiers === 'random' && '🎲 Random'}
                </div>
                <p className="text-xs opacity-70">
                  {useTerritoryModifiers === true && 'Territories have special properties'}
                  {useTerritoryModifiers === false && 'Standard territories only'}
                  {useTerritoryModifiers === 'random' && 'Randomly chosen when game starts'}
                </p>
              </button>
            </div>
          </div>
        </OptionCard>

        {/* 9. Choose Your Color Card */}
        <OptionCard number="9" title="Choose Your Color">
          <div className="space-y-3">
            {/* Standard Player Colors */}
            <div>
              <p className="text-xs text-muted mb-2">Player Colors</p>
              <div className="grid grid-cols-6 gap-2">
                {PLAYER_COLORS.map((hexColor) => {
                  const colorName = getColorName(hexColor)
                  return (
                    <button
                      key={hexColor}
                      className={`group relative h-12 w-12 rounded-lg border-2 transition-all ${
                        selectedColor === hexColor
                          ? 'border-white scale-110 shadow-lg ring-2 ring-white/50'
                          : 'border-border hover:border-gray-400 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hexColor }}
                      onClick={() => setSelectedColor(hexColor)}
                      title={colorName}
                    >
                      {selectedColor === hexColor && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">✓</span>
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
                  const colorName = getColorName(key)
                  
                  return (
                    <button
                      key={key}
                      className={`group relative h-12 w-12 rounded-lg border-2 transition-all ${
                        selectedColor === key
                          ? 'border-yellow-400 scale-110 shadow-lg ring-2 ring-yellow-400/50'
                          : 'border-border hover:border-yellow-600 hover:scale-105'
                      } ${key === 'NeonGreen' ? 'shadow-[0_0_6px_rgba(57,255,20,0.3)]' : ''}`}
                      style={{
                        background: hasGradient ? colorValue : undefined,
                        backgroundColor: !hasGradient ? colorValue : undefined,
                      }}
                      onClick={() => setSelectedColor(key)}
                      title={colorName}
                    >
                      {selectedColor === key && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </OptionCard>
      </div>

      {/* 10. Select Map - Full Width */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
            <span className="text-2xl bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              10
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
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-primary scrollbar-track-surface-2">
                {maps.map((map) => (
                  <div
                    key={map.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedMap === map.id
                        ? map.id === 'random'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg'
                          : 'bg-primary shadow-lg'
                        : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                    }`}
                    onClick={() => setSelectedMap(map.id)}
                  >
                    <div className="font-bold text-white">
                      {map.id === 'random' && '🎲 '}
                      {map.name}
                    </div>
                    <div className="text-sm text-muted">
                      {map.territories > 0 
                        ? `${map.territories} territories • ${map.players} players`
                        : 'Randomly selected when game starts'
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Map Preview */}
            <div className="lg:col-span-2">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="w-full h-48 bg-white/5 rounded-lg mb-4 flex items-center justify-center border border-white/10">
                  <span className="text-muted">
                    {selectedMap === 'random' ? '🎲 Random Map Selection' : 'Map Preview (Coming Soon)'}
                  </span>
                </div>
                {selectedMap !== 'random' && (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ranked Game Info */}
      {isRanked && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="p-4 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-500/30">
            <p className="text-sm font-semibold text-yellow-400 mb-2">⚔️ Ranked Game Requirements:</p>
            <ul className="text-xs text-muted space-y-1">
              <li>• Minimum 3 players required</li>
              <li>• No AI players allowed</li>
              <li>• Must be a public game</li>
              <li>• No team play</li>
              <li>• Rating changes based on final position</li>
              <li>• Skill difference limit: ±500 CP</li>
              <li>• Random options are disabled</li>
            </ul>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto flex gap-4">
        <button
          className="flex-1 py-3 bg-primary hover:brightness-110 disabled:bg-surface-2 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105"
          onClick={() => {
            setCreateAndStay(false)
            handleCreateGame()
          }}
          disabled={isCreating || (gameVisibility === 'private' && !inviteCode.trim())}
        >
          {isCreating ? '🔄 Creating...' : '🎮 Create & Join Game'}
        </button>
        <button
          className="py-3 px-6 bg-violet/80 hover:brightness-110 disabled:bg-surface-2 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all duration-200"
          onClick={() => {
            setCreateAndStay(true)
            handleCreateGame()
          }}
          disabled={isCreating || (gameVisibility === 'private' && !inviteCode.trim())}
        >
          {isCreating ? '🔄 Creating...' : '➕ Create & Make Another'}
        </button>
      </div>
    </div>
  )
}

export default CreateGamePage