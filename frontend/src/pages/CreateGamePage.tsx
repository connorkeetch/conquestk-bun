import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PLAYER_COLORS, type PlayerColor, PREMIUM_PLAYER_COLORS } from '../constants/colors'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import api from '../services/api'
import { type CreateGameData, gameService } from '../services/gameService'

// Map interface
interface GameMap {
  id: string
  name: string
  description: string
  territory_count: number
  continent_count: number
  min_players: number
  max_players: number
  is_featured?: boolean
  is_vip_only?: boolean
  creator_name?: string
  play_count?: number
  rating_average?: number
  rating_count?: number
  tags?: string[]
  imageUrl?: string | null
  image_url?: string | null
}

type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'

const RANDOM_MAP_OPTION: GameMap = {
  id: 'random',
  name: 'Random Map',
  description: 'Randomly selected when game starts',
  territory_count: 0,
  continent_count: 0,
  min_players: 2,
  max_players: 12,
  tags: ['random'],
  imageUrl: null,
  image_url: null,
}

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
      MidnightBlack: 'Midnight Black',
      PureWhite: 'Pure White',
      MetallicGold: 'Metallic Gold',
      NeonGreen: 'Neon Green',
      Dragonfire: 'Dragonfire',
    }
    return premiumNames[color] || color
  }

  // Map player colors to names (matching exact order in PLAYER_COLORS)
  const playerColorNames: string[] = [
    'Red', // #DC2626
    'Crimson', // #851D2D
    'Pink', // #EC4899
    'Orange', // #EA580C
    'Amber', // #F59E0B
    'Forest Green', // #014421
    'Emerald', // #059669
    'Blue', // #2563EB
    'Cyan', // #06B6D4
    'Violet', // #7C3AED
    'Tan', // #918151
    'Brown', // #7C2D12
  ]

  // For standard player colors, get the index and return the name
  const colorIndex = (PLAYER_COLORS as readonly string[]).indexOf(color)
  if (colorIndex !== -1) {
    return playerColorNames[colorIndex]
  }

  return 'Custom'
}

// Reusable OptionCard component
interface OptionCardProps {
  number: string
  title: string
  children: React.ReactNode
  comingSoon?: boolean
  className?: string
}

const OptionCard: React.FC<OptionCardProps> = ({
  number,
  title,
  children,
  comingSoon = false,
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
      {comingSoon && (
        <span className="text-xs bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-1 text-orange-400 font-semibold">
          Coming Soon
        </span>
      )}
    </div>
    <div className={comingSoon ? 'pointer-events-none' : ''}>{children}</div>
  </div>
)

const reportError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    // biome-ignore lint/suspicious/noConsole: Provide additional context during development.
    console.error(message, error)
  }
}

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
  const [selectedMap, setSelectedMap] = useState('')
  const [gameMode, setGameMode] = useState<'classic' | 'capitals' | 'random'>('classic')
  const [fogOfWar, setFogOfWar] = useState<'off' | 'adjacent' | 'persistent'>('off')
  const [teams, setTeams] = useState<number | 'random'>(0)
  const [fortification, setFortification] = useState<
    'adjacent' | 'adjacent_multi' | 'chained' | 'unlimited' | 'random'
  >('adjacent')
  const [selectedColor, setSelectedColor] = useState<PlayerColor>(preferredColor)
  const [turnTimeLimit, setTurnTimeLimit] = useState(24 * 60) // in minutes
  const [spoilsType, setSpoilsType] = useState<'escalating' | 'fixed' | 'static' | 'random'>(
    'escalating',
  )
  const [useTerritoryModifiers, setUseTerritoryModifiers] = useState<boolean>(false)
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
  const [mapSearch, setMapSearch] = useState('')

  // Maps state
  const [maps, setMaps] = useState<GameMap[]>([])
  const [mapsLoading, setMapsLoading] = useState(true)

  // Fetch available maps on component mount
  useEffect(() => {
    let isActive = true

    const fetchMaps = async () => {
      try {
        setMapsLoading(true)
        const response = await api.get('/maps/available-for-game')
        const availableMaps: GameMap[] = response.data.maps || []
        const allMaps = [...availableMaps, RANDOM_MAP_OPTION]

        if (!isActive) return

        setMaps(allMaps)
        setSelectedMap((previous) => previous || allMaps[0]?.id || RANDOM_MAP_OPTION.id)
      } catch (error) {
        if (!isActive) return

        reportError('Failed to fetch maps', error)
        setMaps([RANDOM_MAP_OPTION])
        setSelectedMap((previous) => previous || RANDOM_MAP_OPTION.id)
        setError((current) => current ?? 'Unable to load maps right now. Please try again shortly.')
      } finally {
        if (isActive) {
          setMapsLoading(false)
        }
      }
    }

    fetchMaps()

    return () => {
      isActive = false
    }
  }, [])

  const generateSmartName = useCallback(
    (resolveRandom = false) => {
      if (
        !resolveRandom &&
        (gameMode === 'random' ||
          playersOption === 'random' ||
          teams === 'random' ||
          fortification === 'random' ||
          spoilsType === 'random' ||
          selectedMap === 'random')
      ) {
        return '(autoname)'
      }

      const selectedMapData = maps.find((m) => m.id === selectedMap)
      const mapName = selectedMapData?.name || 'Unknown Map'
      const playerText = playersOption === 'random' ? 'RND-P' : `${maxPlayers}P`

      const elements: string[] = []

      if (isRanked) {
        elements.push('[RANKED]')
      }

      elements.push(playerText)

      if (teams === 'random') {
        elements.push('RND-Teams')
      } else if (typeof teams === 'number' && teams > 0) {
        elements.push(`${teams}v${Math.floor(maxPlayers / teams)}`)
      } else {
        elements.push('FFA')
      }

      elements.push(selectedMap === 'random' ? 'RND-Map' : mapName)

      const specialRules: string[] = []
      if (gameMode === 'capitals') specialRules.push('Capitals')
      if (gameMode === 'random') specialRules.push('RND-Mode')
      if (fogOfWar === 'adjacent') specialRules.push('Fog')
      if (fogOfWar === 'persistent') specialRules.push('PersistentFog')
      if (fortification === 'unlimited') specialRules.push('UnlimitedMove')
      if (fortification === 'chained') specialRules.push('ChainedMove')
      if (fortification === 'adjacent_multi') specialRules.push('MultiMove')
      if (fortification === 'random') specialRules.push('RND-Fort')
      if (turnTimeLimit !== 24 * 60) {
        if (turnTimeLimit < 60) specialRules.push(`${turnTimeLimit}min`)
        else specialRules.push(`${Math.floor(turnTimeLimit / 60)}h`)
      }
      if (useTerritoryModifiers) specialRules.push('Modifiers')
      if (spoilsType === 'random') specialRules.push('RND-Spoils')

      if (specialRules.length > 0) {
        elements.push(`[${specialRules.join('+')}]`)
      }

      return elements.join(' ')
    },
    [
      gameMode,
      playersOption,
      teams,
      fortification,
      spoilsType,
      selectedMap,
      maps,
      isRanked,
      maxPlayers,
      fogOfWar,
      turnTimeLimit,
      useTerritoryModifiers,
    ],
  )

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
  }, [useAutoName, generateSmartName])

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
      if (fortification === 'random') setFortification('adjacent')
      if (spoilsType === 'random') setSpoilsType('escalating')
      if (playersOption === 'random') setPlayersOption(6)
    }
  }, [
    isRanked,
    maxPlayers,
    gameVisibility,
    teams,
    gameMode,
    fortification,
    spoilsType,
    playersOption,
  ])

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
      const finalGameMode =
        gameMode === 'random'
          ? (['classic', 'capitals'][Math.floor(Math.random() * 2)] as 'classic' | 'capitals')
          : (gameMode as 'classic' | 'capitals')

      const finalPlayers =
        playersOption === 'random'
          ? Math.floor(Math.random() * 11) + 2 // 2-12 players
          : maxPlayers

      const finalTeams =
        teams === 'random'
          ? getValidTeamOptions(finalPlayers)[
              Math.floor(Math.random() * getValidTeamOptions(finalPlayers).length)
            ]
          : teams

      const finalFortification =
        fortification === 'random'
          ? (['adjacent', 'adjacent_multi', 'chained', 'unlimited'][
              Math.floor(Math.random() * 4)
            ] as 'adjacent' | 'adjacent_multi' | 'chained' | 'unlimited')
          : fortification

      const finalModifiers = useTerritoryModifiers

      // Filter out random option and select a random map
      const availableMaps = maps.filter((m) => m.id !== 'random')
      const finalMap =
        selectedMap === 'random'
          ? availableMaps[Math.floor(Math.random() * availableMaps.length)]?.id || 'classic'
          : selectedMap

      const gameData: CreateGameData = {
        name: gameName || generateSmartName(true), // Resolve random options when creating
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
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const apiError = error as { response?: { data?: { message?: string } } }
        setError(apiError.response?.data?.message || 'Failed to create game')
      } else if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('Failed to create game')
      }
    } finally {
      setIsCreating(false)
    }
  }

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
                  placeholder={useAutoName ? generateSmartName() : 'Game name'}
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
        <div
          className={`max-w-7xl mx-auto mb-6 p-4 ${error.startsWith('✅') ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'} border rounded-lg`}
        >
          <div className="flex items-center space-x-2">
            <span className={error.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
              {error.startsWith('✅') ? '' : '❌'}
            </span>
            <span className={error.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
              {error}
            </span>
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
                      ? 'theme-selected'
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
                      ? 'theme-selected'
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
        <OptionCard number="2" title="Game Mode">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setGameMode('classic')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                gameMode === 'classic'
                  ? 'theme-selected'
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
                  ? 'theme-selected'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium">🏰 Capitals</div>
              <p className="text-xs opacity-70 mt-1">
                Protect your capital territory to stay alive
              </p>
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
        <OptionCard number="3" title="Turn Time Limits">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted mb-2">⚡ Real-Time Games</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(5)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    turnTimeLimit === 5
                      ? 'theme-selected'
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
                      ? 'theme-selected'
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
                      ? 'theme-selected'
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
                      ? 'theme-selected'
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
                      ? 'theme-selected'
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
        <OptionCard number="4" title="Number of Players">
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((playerCount) => {
                const validTeamOptions = getValidTeamOptions(playerCount)
                const isTeamCompatible =
                  teams === 0 || teams === 'random' || validTeamOptions.includes(teams as number)
                const isDisabled = teams !== 0 && teams !== 'random' && !isTeamCompatible

                return (
                  <button
                    type="button"
                    key={playerCount}
                    className={`p-3 rounded-lg font-bold transition-all duration-200 ${
                      isDisabled
                        ? 'bg-white/5 text-muted cursor-not-allowed opacity-50'
                        : playersOption === playerCount
                          ? 'theme-selected shadow-lg'
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
                  type="button"
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
                ? 'Random player count (2-12) chosen when game starts'
                : `Game will start with ${playersOption} players`}
            </p>
          </div>
        </OptionCard>

        {/* 5. Teams Card */}
        <OptionCard number="5" title="Teams">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTeams(0)}
              className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                teams === 0 ? 'theme-selected' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="font-medium text-sm">Free for All</div>
              <p className="text-xs opacity-70">Every player for themselves</p>
            </button>

            {playersOption !== 'random' &&
              [2, 3, 4, 5, 6].map((teamOption) => {
                const validTeamOptions = getValidTeamOptions(maxPlayers)
                const isValid = validTeamOptions.includes(teamOption)

                return isValid ? (
                  <button
                    key={teamOption}
                    type="button"
                    onClick={() => setTeams(teamOption)}
                    className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                      teams === teamOption
                        ? 'theme-selected'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <div className="font-medium text-sm">{teamOption} Teams</div>
                    <p className="text-xs opacity-70">
                      {Math.floor(maxPlayers / teamOption)} players per team
                    </p>
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
        <OptionCard number="6" title="Fortification">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setFortification('adjacent')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                fortification === 'adjacent'
                  ? 'theme-selected'
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
                  ? 'theme-selected'
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
                  ? 'theme-selected'
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
                  ? 'theme-selected'
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
        <OptionCard number="7" title="Spoils of War">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSpoilsType('escalating')}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                spoilsType === 'escalating'
                  ? 'theme-selected'
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
                  ? 'theme-selected'
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
                  ? 'theme-selected'
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
        <OptionCard number="8" title="Advanced Options">
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
                      ? 'theme-selected'
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
                      ? 'theme-selected'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">🔗 Adjacent</div>
                  <p className="text-xs opacity-70">See neighbors only</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFogOfWar('persistent')}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    fogOfWar === 'persistent'
                      ? 'theme-selected'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">🗺️ Persistent</div>
                  <p className="text-xs opacity-70">Once revealed, stays visible</p>
                </button>
              </div>
            </div>

            {/* Territory Modifiers Section */}
            <div className="pt-3 border-t border-border">
              <h4 className="text-sm font-medium text-white mb-2">Territory Modifiers</h4>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setUseTerritoryModifiers(false)}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    !useTerritoryModifiers
                      ? 'theme-selected'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">❌ Disabled</div>
                  <p className="text-xs opacity-70">Standard territories only</p>
                </button>
                <button
                  type="button"
                  onClick={() => setUseTerritoryModifiers(true)}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                    useTerritoryModifiers
                      ? 'theme-selected'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-sm">⚡ Enabled</div>
                  <p className="text-xs opacity-70">Territories have special properties</p>
                </button>
              </div>

              {useTerritoryModifiers && (
                <div className="mt-3 pt-3 border-t border-gray-500">
                  <p className="text-sm text-muted mb-2">Distribution:</p>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setModifierDistribution('sparse')}
                      className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                        modifierDistribution === 'sparse'
                          ? 'theme-selected'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <div className="text-sm">Sparse (15%)</div>
                      <p className="text-xs opacity-70">Few strategic territories</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModifierDistribution('balanced')}
                      className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                        modifierDistribution === 'balanced'
                          ? 'theme-selected'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <div className="text-sm">Balanced (30%)</div>
                      <p className="text-xs opacity-70">Moderate strategic depth</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModifierDistribution('abundant')}
                      className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                        modifierDistribution === 'abundant'
                          ? 'theme-selected'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <div className="text-sm">Abundant (50%)</div>
                      <p className="text-xs opacity-70">Many strategic territories</p>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </OptionCard>

        {/* 9. Choose Your Color Card */}
        <OptionCard number="9" title="Choose Your Color">
          <div className="space-y-3">
            {/* Display selected color name */}
            <div className="text-center p-2 bg-white/10 rounded-lg">
              <span className="text-sm font-semibold text-white">
                Selected: {getColorName(selectedColor)}
              </span>
            </div>

            {/* Standard Player Colors */}
            <div>
              <p className="text-xs text-muted mb-2">Player Colors</p>
              <div className="grid grid-cols-6 gap-2">
                {PLAYER_COLORS.map((hexColor) => {
                  const colorName = getColorName(hexColor)
                  return (
                    <button
                      type="button"
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
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">
                          ✓
                        </span>
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
                      type="button"
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
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">
                          ✓
                        </span>
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
                value={mapSearch}
                onChange={(e) => setMapSearch(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-white placeholder-muted mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-primary scrollbar-track-surface-2">
                {mapsLoading ? (
                  <div className="text-center py-4 text-muted">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                    Loading maps...
                  </div>
                ) : (
                  maps
                    .filter(
                      (map) =>
                        mapSearch === '' ||
                        map.name.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        map.description?.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        map.tags?.some((tag) =>
                          tag.toLowerCase().includes(mapSearch.toLowerCase()),
                        ),
                    )
                    .map((map) => (
                      <button
                        key={map.id}
                        type="button"
                        className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                          selectedMap === map.id
                            ? map.id === 'random'
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg'
                              : 'theme-selected shadow-lg'
                            : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                        }`}
                        onClick={() => setSelectedMap(map.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-white">
                            {map.id === 'random' && '🎲 '}
                            {map.is_featured && '⭐ '}
                            {map.is_vip_only && '👑 '}
                            {map.name}
                          </div>
                          {map.rating_average && map.rating_average > 0 && (
                            <div className="text-xs text-yellow-400">
                              {'⭐'.repeat(Math.floor(map.rating_average))}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted">
                          {map.territory_count > 0
                            ? `${map.territory_count} territories • ${map.min_players}-${map.max_players} players`
                            : 'Randomly selected when game starts'}
                        </div>
                        {map.creator_name && map.id !== 'classic' && map.id !== 'random' && (
                          <div className="text-xs text-muted mt-1">
                            by {map.creator_name}
                            {map.play_count && map.play_count > 0 && ` • ${map.play_count} plays`}
                          </div>
                        )}
                      </button>
                    ))
                )}
              </div>
            </div>

            {/* Map Preview */}
            <div className="lg:col-span-2">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                {(() => {
                  const selectedMapData = maps.find((m) => m.id === selectedMap)

                  if (!selectedMapData) {
                    return (
                      <div className="text-center text-muted py-8">Select a map to see details</div>
                    )
                  }

                  const imageSrc = selectedMapData.imageUrl || selectedMapData.image_url

                  return (
                    <>
                      <div className="w-full h-48 bg-white/5 rounded-lg mb-4 flex items-center justify-center border border-white/10 overflow-hidden">
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={selectedMapData.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                              const parent = (e.target as HTMLImageElement).parentElement
                              if (parent) {
                                const fallback = document.createElement('div')
                                fallback.className = 'text-muted text-center'
                                fallback.innerHTML =
                                  selectedMap === 'random'
                                    ? '🎲 Random Map Selection'
                                    : '🗺️ Map Preview'
                                parent.appendChild(fallback)
                              }
                            }}
                          />
                        ) : (
                          <span className="text-muted">
                            {selectedMap === 'random' ? '🎲 Random Map Selection' : '🗺️ Map Preview'}
                          </span>
                        )}
                      </div>
                      {selectedMap !== 'random' && (
                        <div>
                          {selectedMapData.description && (
                            <p className="text-sm text-muted mb-3">{selectedMapData.description}</p>
                          )}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted">Territories:</span>
                              <span className="ml-2 text-white">
                                {selectedMapData.territory_count || 'Unknown'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">Continents:</span>
                              <span className="ml-2 text-white">
                                {selectedMapData.continent_count || 'Unknown'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">Players:</span>
                              <span className="ml-2 text-white">
                                {selectedMapData.min_players}-{selectedMapData.max_players}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">Games Played:</span>
                              <span className="ml-2 text-white">
                                {selectedMapData.play_count || 0}
                              </span>
                            </div>
                            {selectedMapData.creator_name && selectedMapData.id !== 'classic' && (
                              <div className="col-span-2">
                                <span className="text-muted">Created by:</span>
                                <span className="ml-2 text-white">
                                  {selectedMapData.creator_name}
                                </span>
                              </div>
                            )}
                            {selectedMapData.rating_average &&
                              selectedMapData.rating_average > 0 && (
                                <div className="col-span-2">
                                  <span className="text-muted">Rating:</span>
                                  <span className="ml-2 text-yellow-400">
                                    {'⭐'.repeat(Math.floor(selectedMapData.rating_average))}
                                    <span className="text-white ml-1">
                                      ({selectedMapData.rating_average.toFixed(1)}/5 from{' '}
                                      {selectedMapData.rating_count} reviews)
                                    </span>
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ranked Game Info */}
      {isRanked && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="p-4 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-500/30">
            <p className="text-sm font-semibold text-yellow-400 mb-2">
              ⚔️ Ranked Game Requirements:
            </p>
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
      <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          className="btn-primary btn-lg flex-1 w-full"
          onClick={() => {
            setCreateAndStay(false)
            handleCreateGame()
          }}
          disabled={isCreating || (gameVisibility === 'private' && !inviteCode.trim())}
        >
          {isCreating ? '🔄 Creating...' : '🎮 Create & Join Game'}
        </button>
        <button
          type="button"
          className="btn-secondary btn-lg w-full sm:w-auto"
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
