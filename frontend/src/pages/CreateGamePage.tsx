import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import MapDetailModal from '@/components/MapDetailModal'
import { extractFirstHexColor, pickTextOnColor } from '@/utils/color'
import { logger } from '@/utils/logger'
import { PLAYER_COLORS, type PlayerColor, PREMIUM_PLAYER_COLORS } from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import api from '../services/api'
import { type CreateGameData, gameService } from '../services/gameService'
import type { AIDifficulty } from '../types/game'

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
  play_count_30d?: number
  rating_average?: number
  rating_count?: number
  tags?: string[]
  imageUrl?: string | null
  image_url?: string | null
  createdAt?: string | null
}

const computeMapSizeFromCounts = (
  territoryCount?: number,
): 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Massive' | 'Unknown' => {
  const count = typeof territoryCount === 'number' ? territoryCount : NaN
  if (!Number.isFinite(count) || count <= 0) return 'Unknown'
  if (count <= 35) return 'Small'
  if (count <= 45) return 'Medium'
  if (count <= 65) return 'Large'
  if (count <= 90) return 'Very Large'
  return 'Massive'
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
    'Brown', // #5C4033
  ]

  // For standard player colors, get the index and return the name
  const colorIndex = (PLAYER_COLORS as readonly string[]).indexOf(color)
  if (colorIndex !== -1) {
    return playerColorNames[colorIndex]
  }

  return 'Custom'
}

const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  recruit: 'Recruit',
  commander: 'Commander',
  grandmaster: 'Grandmaster',
}

const AI_DIFFICULTY_DESCRIPTIONS: Record<AIDifficulty, string> = {
  recruit: 'Fast, forgiving baseline opponent',
  commander: 'Balanced with threat awareness',
  grandmaster: 'Advanced tactics and deeper lookahead',
}

const AI_DIFFICULTY_ORDER: AIDifficulty[] = ['recruit', 'commander', 'grandmaster']

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
    className={`panel transition-shadow duration-200 hover:shadow-[var(--shadow-2)] ${
      comingSoon ? 'opacity-60 pointer-events-none' : ''
    } ${className}`}
  >
    <div className="flex items-start justify-between gap-3 mb-4">
      <h2 className="flex items-center gap-3 text-lg font-semibold text-[color:var(--heading)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-primary)] text-[color:var(--color-primary)] text-base font-semibold">
          {number}
        </span>
        <span>{title}</span>
      </h2>
      {comingSoon && (
        <span className="badge text-[color:var(--color-warning)] border-[color:var(--color-warning)] bg-[color:var(--hover-bg)]">
          Coming Soon
        </span>
      )}
    </div>
    <div>{children}</div>
  </div>
)

const choiceClass = (isActive: boolean, extra: string) =>
  `panel-outline transition-colors ${
    isActive
      ? 'theme-selected'
      : 'text-muted hover:text-[color:var(--heading)] hover:border-[color:var(--hover-border)] hover:bg-[color:var(--hover-bg)]'
  } ${extra}`

const disabledChoiceClass = 'panel-outline text-muted opacity-50 cursor-not-allowed'

const reportError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    logger.error(message, error)
  }
}

const CreateGamePage: React.FC = () => {
  const navigate = useNavigate()
  const settings = useAppSelector((state) => state.settings)
  const guntsPrescriptions = useFeatureFlag('gunts_prescriptions')
  // Removed tournament visibility option; comingSoon UI flag not needed here
  const territoryModifiersEnabled = useFeatureFlag(FEATURE_FLAGS.TERRITORY_MODIFIERS)
  const [searchParams] = useSearchParams()

  const initialMode: 'casual' | 'ranked' =
    searchParams.get('mode') === 'ranked' ? 'ranked' : 'casual'

  // Get preferred color from settings, default to first player color
  const preferredColor = settings.game?.preferredColor || PLAYER_COLORS[0]

  // Form state
  const [gameVisibility, setGameVisibility] = useState<'public' | 'private'>('public')
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
  const [useTerritoryModifiers, setUseTerritoryModifiers] = useState<boolean>(false)
  // Hidden Treasures (new ruleset) UI state
  const [treasurePayoutMode, setTreasurePayoutMode] = useState<
    'classic' | 'fixed' | 'none' | 'triangular'
  >('classic')
  // Diamond chance is fixed at 8% per new rules
  const DIAMOND_PERCENT = 0.08
  const [fixedTreasureValue, setFixedTreasureValue] = useState<number>(8)
  // Hand cap and diamond set bonus are fixed constants per new rules
  const TREASURE_HAND_CAP = 5
  const DIAMOND_SET_BONUS = 3
  const [isRanked, setIsRanked] = useState(initialMode === 'ranked')

  // Accessible, unique IDs for form controls
  const fixedPayoutId = useId()
  // no-op ids removed with simplified UI
  const [gameType, setGameType] = useState<'casual' | 'ranked'>(initialMode)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useAutoName, setUseAutoName] = useState(true)
  const [playersOption, setPlayersOption] = useState<number | 'random'>(6)
  const [createAndStay, setCreateAndStay] = useState(false)
  const [mapSearch, setMapSearch] = useState('')
  const [mapSizeFilter, setMapSizeFilter] = useState<
    '' | 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Massive'
  >('')
  const [aiCounts, setAiCounts] = useState<Record<AIDifficulty, number>>({
    recruit: 0,
    commander: 0,
    grandmaster: 0,
  })

  // Maps state
  const [maps, setMaps] = useState<GameMap[]>([])
  const [mapsLoading, setMapsLoading] = useState(true)
  const [mapDetailModalId, setMapDetailModalId] = useState<string | null>(null)

  const allowedAiDifficulties = useMemo(
    () => ['recruit', 'commander', 'grandmaster'] as AIDifficulty[],
    [],
  )

  const maxAiSlots = useMemo(() => Math.max(0, maxPlayers - 1), [maxPlayers])

  const normalizeAiCounts = useCallback(
    (counts: Record<AIDifficulty, number>): Record<AIDifficulty, number> => {
      const baseline: Record<AIDifficulty, number> = {
        recruit: 0,
        commander: 0,
        grandmaster: 0,
      }

      if (isRanked || allowedAiDifficulties.length === 0) {
        return baseline
      }

      const sanitized: Record<AIDifficulty, number> = { ...baseline }
      let total = 0

      allowedAiDifficulties.forEach((difficulty) => {
        const raw = counts[difficulty] ?? 0
        const value = Math.max(0, Math.trunc(raw))
        sanitized[difficulty] = value
        total += value
      })

      let overflow = total - maxAiSlots
      if (overflow > 0) {
        const reductionOrder = [...AI_DIFFICULTY_ORDER].reverse()
        while (overflow > 0) {
          const target = reductionOrder.find(
            (difficulty) => allowedAiDifficulties.includes(difficulty) && sanitized[difficulty] > 0,
          )
          if (!target) {
            break
          }
          sanitized[target] -= 1
          overflow -= 1
        }
      }

      return sanitized
    },
    [allowedAiDifficulties, isRanked, maxAiSlots],
  )

  useEffect(() => {
    setAiCounts((previous) => {
      const normalized = normalizeAiCounts(previous)
      const hasChanged = AI_DIFFICULTY_ORDER.some(
        (difficulty) => normalized[difficulty] !== previous[difficulty],
      )
      return hasChanged ? normalized : previous
    })
  }, [normalizeAiCounts])

  const totalAiOpponents = useMemo(
    () => allowedAiDifficulties.reduce((sum, difficulty) => sum + (aiCounts[difficulty] ?? 0), 0),
    [aiCounts, allowedAiDifficulties],
  )

  const remainingAiSlots = Math.max(0, maxAiSlots - totalAiOpponents)

  const buildAiOpponentPayload = useCallback(
    (counts: Record<AIDifficulty, number>) => {
      const payload: Array<{ difficulty: AIDifficulty; personalitySeed?: number | null }> = []
      if (isRanked) {
        return payload
      }

      allowedAiDifficulties.forEach((difficulty) => {
        const count = counts[difficulty] ?? 0
        for (let index = 0; index < count; index += 1) {
          payload.push({ difficulty })
        }
      })

      return payload
    },
    [allowedAiDifficulties, isRanked],
  )

  const handleAiCountChange = useCallback(
    (difficulty: AIDifficulty, value: number) => {
      setAiCounts((previous) => normalizeAiCounts({ ...previous, [difficulty]: value }))
    },
    [normalizeAiCounts],
  )

  const adjustAiCount = useCallback(
    (difficulty: AIDifficulty, delta: number) => {
      setAiCounts((previous) =>
        normalizeAiCounts({ ...previous, [difficulty]: (previous[difficulty] ?? 0) + delta }),
      )
    },
    [normalizeAiCounts],
  )

  const showAiOpponentCard = !isRanked

  const getStepNumber = useCallback(
    (base: number) => {
      if (!showAiOpponentCard) {
        return String(base)
      }
      if (base < 5) {
        return String(base)
      }
      return String(base + 1)
    },
    [showAiOpponentCard],
  )

  const lastAppliedModeRef = useRef<'casual' | 'ranked' | null>(initialMode)
  const modeParam = searchParams.get('mode')

  useEffect(() => {
    if (!territoryModifiersEnabled && useTerritoryModifiers) {
      setUseTerritoryModifiers(false)
    }
  }, [territoryModifiersEnabled, useTerritoryModifiers])

  useEffect(() => {
    const normalizedMode =
      modeParam === 'ranked' ? 'ranked' : modeParam === 'casual' ? 'casual' : null

    if (!normalizedMode) {
      lastAppliedModeRef.current = null
      return
    }

    if (lastAppliedModeRef.current === normalizedMode) {
      return
    }

    lastAppliedModeRef.current = normalizedMode

    if (normalizedMode === 'ranked') {
      setIsRanked(true)
      setGameType('ranked')
    } else {
      setIsRanked(false)
      setGameType('casual')
    }
  }, [modeParam])

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
      if (territoryModifiersEnabled && useTerritoryModifiers) specialRules.push('Modifiers')
      // Spoils removed; Hidden Treasures is configured separately

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
      selectedMap,
      maps,
      isRanked,
      maxPlayers,
      fogOfWar,
      turnTimeLimit,
      useTerritoryModifiers,
      territoryModifiersEnabled,
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
      if (playersOption === 'random') setPlayersOption(6)
    }
  }, [isRanked, maxPlayers, gameVisibility, teams, gameMode, fortification, playersOption])

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

      const finalModifiers = territoryModifiersEnabled && useTerritoryModifiers

      // Filter out random option and select a random map
      const availableMaps = maps.filter((m) => m.id !== 'random')
      const finalMap =
        selectedMap === 'random'
          ? availableMaps[Math.floor(Math.random() * availableMaps.length)]?.id || 'classic'
          : selectedMap

      const aiOpponentsPayload = buildAiOpponentPayload(aiCounts)
      const maxAllowedAi = Math.max(0, finalPlayers - 1)

      if (aiOpponentsPayload.length > maxAllowedAi) {
        setError(`Reduce AI opponents to ${maxAllowedAi} or choose a higher player count.`)
        return
      }

      const gameData: CreateGameData = {
        name: gameName || generateSmartName(true), // Resolve random options when creating
        maxPlayers: finalPlayers,
        isPrivate: gameVisibility === 'private',
        isRanked,
        gameType: 'custom',
        mapId: finalMap,
        movementType: fortificationToMovementType(finalFortification),
        fogOfWar,
        turnTimerSeconds:
          typeof turnTimeLimit === 'number' ? Math.trunc(turnTimeLimit * 60) : undefined,
        allowTeamPlay: finalTeams > 0,
        teamMode: finalTeams > 0 ? 'teams' : 'none',
        numberOfTeams: finalTeams > 0 ? finalTeams : undefined,
        capitalsEnabled: finalGameMode === 'capitals',
        useTerritoryModifiers: finalModifiers,
      }

      // Attach Hidden Treasures configuration
      gameData.treasureConfig = {
        enabled: treasurePayoutMode !== 'none',
        payoutMode: treasurePayoutMode,
        diamondsPercent: DIAMOND_PERCENT,
        fixedValue: fixedTreasureValue,
        handCap: TREASURE_HAND_CAP,
        diamondSetBonus: DIAMOND_SET_BONUS,
      }

      if (aiOpponentsPayload.length > 0) {
        gameData.aiOpponents = aiOpponentsPayload
      }

      const response = await gameService.createRoom(gameData)

      if (response.room) {
        if (createAndStay) {
          // Clear form for next game
          setGameName('')
          setUseAutoName(true)
          setError(null)
          // Show success message
          setError(
            `✅ Game "${response.room.name}${
              typeof response.room.roomCode === 'number' ? ` — Room ${response.room.roomCode}` : ''
            }" created successfully! Create another?`,
          )
        } else {
          navigate(`/room/${response.room.roomCode ?? response.room.id}`)
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
          <Link to="/lobby" className="btn btn-secondary">
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
                  className={`btn btn-secondary flex-1 justify-start gap-2 text-left ${
                    gameVisibility === 'public' ? 'theme-selected' : ''
                  }`}
                >
                  🌍 Public
                </button>
                <button
                  type="button"
                  onClick={() => setGameVisibility('private')}
                  className={`btn btn-secondary flex-1 justify-start gap-2 text-left ${
                    gameVisibility === 'private' ? 'theme-selected' : ''
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
                  className={`btn btn-secondary flex-1 flex-col items-start text-left gap-1 ${
                    gameType === 'casual' ? 'theme-selected' : ''
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
                  className={`btn btn-secondary flex-1 flex-col items-start text-left gap-1 ${
                    gameType === 'ranked' ? 'theme-selected' : ''
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
              className={choiceClass(
                gameMode === 'classic',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-[color:var(--heading)]">⚔️ Classic Risk</div>
              <p className="text-xs text-muted">Conquer all territories to win</p>
            </button>
            <button
              type="button"
              onClick={() => setGameMode('capitals')}
              className={choiceClass(
                gameMode === 'capitals',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-[color:var(--heading)]">🏰 Capitals</div>
              <p className="text-xs text-muted">Protect your capital territory to stay alive</p>
            </button>
            {!isRanked && (
              <button
                type="button"
                onClick={() => setGameMode('random')}
                className={
                  choiceClass(gameMode === 'random', 'w-full p-3 text-left flex flex-col gap-1') +
                  (gameMode === 'random'
                    ? ' bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white'
                    : '')
                }
              >
                <div className="font-medium">🎲 Random</div>
                <p className="text-xs opacity-90">Game mode chosen when game starts</p>
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
                  className={choiceClass(turnTimeLimit === 5, 'px-3 py-2 text-sm text-left')}
                >
                  <span className="font-semibold text-[color:var(--heading)]">5 min</span>
                  <p className="text-xs text-muted">Quick</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(10)}
                  className={choiceClass(turnTimeLimit === 10, 'px-3 py-2 text-sm text-left')}
                >
                  <span className="font-semibold text-[color:var(--heading)]">10 min</span>
                  <p className="text-xs text-muted">Normal</p>
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted mb-2">📅 Long-Term Games</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(6 * 60)}
                  className={choiceClass(turnTimeLimit === 6 * 60, 'px-2 py-2 text-sm')}
                >
                  6h
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(12 * 60)}
                  className={choiceClass(turnTimeLimit === 12 * 60, 'px-2 py-2 text-sm')}
                >
                  12h
                </button>
                <button
                  type="button"
                  onClick={() => setTurnTimeLimit(24 * 60)}
                  className={choiceClass(turnTimeLimit === 24 * 60, 'px-2 py-2 text-sm text-left')}
                >
                  <span className="font-semibold text-[color:var(--heading)]">24h</span>
                  <p className="text-xs text-muted">Default</p>
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
                    className={`${
                      isDisabled
                        ? `${disabledChoiceClass} p-3 text-center font-bold`
                        : choiceClass(
                            playersOption === playerCount,
                            'p-3 text-center font-bold transition-all duration-200',
                          )
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
                  className={
                    choiceClass(
                      playersOption === 'random',
                      'p-3 text-center font-bold transition-all duration-200',
                    ) +
                    (playersOption === 'random'
                      ? ' bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white'
                      : '')
                  }
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

        {showAiOpponentCard && (
          <OptionCard number="5" title="AI Opponents (Optional)">
            {allowedAiDifficulties.length === 0 ? (
              <p className="text-xs text-muted">
                No AI difficulties are currently enabled for your account. Ask an admin to enable an
                AI tier flag to add computer opponents.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  You can reserve up to {maxAiSlots} AI slot{maxAiSlots === 1 ? '' : 's'} in this
                  lobby.{' '}
                  {remainingAiSlots > 0
                    ? `${remainingAiSlots} open slot${remainingAiSlots === 1 ? '' : 's'} remaining.`
                    : 'No open slots remain—lower counts or raise max players.'}
                </p>
                {playersOption === 'random' && (
                  <p className="text-xs text-amber-300">
                    Random player counts are resolved at game creation. If the roll produces fewer
                    seats than the reserved AI total, excess opponents are dropped automatically.
                  </p>
                )}
                <div className="space-y-2">
                  {allowedAiDifficulties.map((difficulty) => {
                    const count = aiCounts[difficulty] ?? 0
                    const label = AI_DIFFICULTY_LABELS[difficulty]
                    const description = AI_DIFFICULTY_DESCRIPTIONS[difficulty]
                    const canDecrease = count > 0
                    const canIncrease = remainingAiSlots > 0

                    return (
                      <div
                        key={difficulty}
                        className="panel-outline flex items-center justify-between p-3"
                      >
                        <div className="mr-4">
                          <div className="font-medium text-sm text-[color:var(--heading)]">
                            {label}
                          </div>
                          <p className="text-xs text-muted">{description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => adjustAiCount(difficulty, -1)}
                            disabled={!canDecrease}
                            className="btn btn-secondary btn-icon"
                            aria-label={`Remove ${label} AI opponent`}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={maxAiSlots}
                            value={count}
                            onChange={(event) => {
                              const nextValue = Number.parseInt(event.target.value, 10)
                              handleAiCountChange(
                                difficulty,
                                Number.isNaN(nextValue) ? 0 : Math.max(0, nextValue),
                              )
                            }}
                            className="form-input w-16 text-center"
                          />
                          <button
                            type="button"
                            onClick={() => adjustAiCount(difficulty, 1)}
                            disabled={!canIncrease}
                            className="btn btn-secondary btn-icon"
                            aria-label={`Add ${label} AI opponent`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </OptionCard>
        )}

        {/* 5. Teams Card */}
        <OptionCard number={getStepNumber(5)} title="Teams">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTeams(0)}
              className={choiceClass(teams === 0, 'w-full p-3 text-left flex flex-col gap-1')}
            >
              <div className="font-medium text-sm text-[color:var(--heading)]">Free for All</div>
              <p className="text-xs text-muted">Every player for themselves</p>
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
                    className={choiceClass(
                      teams === teamOption,
                      'w-full p-3 text-left flex flex-col gap-1',
                    )}
                  >
                    <div className="font-medium text-sm text-[color:var(--heading)]">
                      {teamOption} Teams
                    </div>
                    <p className="text-xs text-muted">
                      {Math.floor(maxPlayers / teamOption)} players per team
                    </p>
                  </button>
                ) : null
              })}

            {!isRanked && (
              <button
                type="button"
                onClick={() => setTeams('random')}
                className={
                  choiceClass(teams === 'random', 'w-full p-3 text-left flex flex-col gap-1') +
                  (teams === 'random'
                    ? ' bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white'
                    : '')
                }
              >
                <div className="font-medium text-sm">🎲 Random Teams</div>
                <p className="text-xs opacity-90">Team configuration chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* 6. Fortification Card */}
        <OptionCard number={getStepNumber(6)} title="Fortification">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setFortification('adjacent')}
              className={choiceClass(
                fortification === 'adjacent',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-sm text-[color:var(--heading)]">
                🔗 Adjacent Only
              </div>
              <p className="text-xs text-muted">Move troops only between connected territories</p>
            </button>

            <button
              type="button"
              onClick={() => setFortification('adjacent_multi')}
              className={choiceClass(
                fortification === 'adjacent_multi',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-sm text-[color:var(--heading)]">
                🔄 Adjacent Multiple
              </div>
              <p className="text-xs text-muted">Multiple moves between adjacent territories</p>
            </button>

            <button
              type="button"
              onClick={() => setFortification('chained')}
              className={choiceClass(
                fortification === 'chained',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-sm text-[color:var(--heading)]">⛓️ Chained</div>
              <p className="text-xs text-muted">Move along a path of connected territories</p>
            </button>

            <button
              type="button"
              onClick={() => setFortification('unlimited')}
              className={choiceClass(
                fortification === 'unlimited',
                'w-full p-3 text-left flex flex-col gap-1',
              )}
            >
              <div className="font-medium text-sm text-[color:var(--heading)]">🌍 Unlimited</div>
              <p className="text-xs text-muted">Move between any owned territories</p>
            </button>

            {!isRanked && (
              <button
                type="button"
                onClick={() => setFortification('random')}
                className={
                  choiceClass(
                    fortification === 'random',
                    'w-full p-3 text-left flex flex-col gap-1',
                  ) +
                  (fortification === 'random'
                    ? ' bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white'
                    : '')
                }
              >
                <div className="font-medium text-sm">🎲 Random</div>
                <p className="text-xs opacity-90">Fortification type chosen when game starts</p>
              </button>
            )}
          </div>
        </OptionCard>

        {/* Spoils of War removed; Hidden Treasures replaces it */}

        {/* 7. Hidden Treasures Card */}
        <OptionCard number={getStepNumber(7)} title="Hidden Treasures">
          <div className="space-y-4">
            {/* Brief description */}
            <p className="text-xs text-muted">
              Hidden Treasures replace classic spoils. Capture territories to earn treasure cards
              and turn in sets for troop reinforcements based on the payout mode.
            </p>
            <div>
              <p className="text-xs text-muted mb-2">Payout Mode</p>
              <div className="space-y-2">
                {/* Classic first and default */}
                <button
                  type="button"
                  className={choiceClass(
                    treasurePayoutMode === 'classic',
                    'w-full p-3 text-left flex flex-col gap-1',
                  )}
                  onClick={() => setTreasurePayoutMode('classic')}
                >
                  <div className="text-sm text-[color:var(--heading)]">📜 Classic</div>
                  <p className="text-xs text-muted">4, 6, 8, 10, 12, 15, ...</p>
                </button>
                <button
                  type="button"
                  className={choiceClass(
                    treasurePayoutMode === 'triangular',
                    'w-full p-3 text-left flex flex-col gap-1',
                  )}
                  onClick={() => setTreasurePayoutMode('triangular')}
                >
                  <div className="text-sm text-[color:var(--heading)]">📈 Progressive</div>
                  <p className="text-xs text-muted">4, 6, 9, 13, 18, ...</p>
                </button>
                <button
                  type="button"
                  className={choiceClass(
                    treasurePayoutMode === 'fixed',
                    'w-full p-3 text-left flex flex-col gap-1',
                  )}
                  onClick={() => setTreasurePayoutMode('fixed')}
                >
                  <div className="text-sm text-[color:var(--heading)]">⚖️ Fixed</div>
                  <p className="text-xs text-muted">Same troops every set</p>
                </button>
                <button
                  type="button"
                  className={choiceClass(
                    treasurePayoutMode === 'none',
                    'w-full p-3 text-left flex flex-col gap-1',
                  )}
                  onClick={() => setTreasurePayoutMode('none')}
                >
                  <div className="text-sm text-[color:var(--heading)]">🚫 Disabled</div>
                  <p className="text-xs text-muted">No set payouts</p>
                </button>
              </div>
            </div>

            {treasurePayoutMode === 'fixed' && (
              <div className="flex items-center gap-3">
                <label htmlFor={fixedPayoutId} className="text-sm text-[color:var(--heading)] w-40">
                  Fixed payout
                </label>
                <input
                  id={fixedPayoutId}
                  type="number"
                  min={1}
                  max={50}
                  value={fixedTreasureValue}
                  onChange={(e) =>
                    setFixedTreasureValue(Math.max(1, Math.min(50, Number(e.target.value) || 0)))
                  }
                  className="form-input w-28"
                />
                <span className="text-xs text-muted">troops</span>
              </div>
            )}

            {/* Removed: implementation details text per request */}
          </div>
        </OptionCard>

        {/* 9. Advanced Options Card */}
        <OptionCard number={getStepNumber(8)} title="Advanced Options">
          <div className="space-y-4">
            {/* Fog of War first, full-width Enabled/Disabled */}
            <div>
              <h4 className="text-sm font-medium text-[color:var(--heading)] mb-2">Fog of War</h4>
              <p className="text-xs text-muted mb-2">
                When enabled, you see your territories and their neighbors.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setFogOfWar('off')}
                  className={choiceClass(fogOfWar === 'off', 'w-full px-3 py-2 text-left')}
                >
                  Disabled
                </button>
                <button
                  type="button"
                  onClick={() => setFogOfWar('adjacent')}
                  className={choiceClass(fogOfWar === 'adjacent', 'w-full px-3 py-2 text-left')}
                >
                  Enabled
                </button>
              </div>
            </div>

            {/* Territory Modifiers now Enabled/Disabled full-width buttons */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-[color:var(--heading)]">
                Territory Modifiers
              </h4>
              <p className="text-xs text-muted">
                When enabled, the game uses any modifiers predefined on the selected map (no random
                distribution).
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setUseTerritoryModifiers(false)}
                  className={choiceClass(!useTerritoryModifiers, 'w-full px-3 py-2 text-left')}
                >
                  Disabled
                </button>
                <button
                  type="button"
                  onClick={() => setUseTerritoryModifiers(true)}
                  className={choiceClass(useTerritoryModifiers, 'w-full px-3 py-2 text-left')}
                >
                  Enabled
                </button>
              </div>
            </div>
          </div>
        </OptionCard>

        {/* 9. Choose Your Color Card */}
        <OptionCard number={getStepNumber(9)} title="Choose Your Color">
          <div className="space-y-3">
            {/* Display selected color name */}
            <div className="panel-outline text-center py-3">
              <span className="text-sm font-semibold text-[color:var(--heading)]">
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
                        <span
                          className="absolute inset-0 flex items-center justify-center text-lg font-bold drop-shadow-lg"
                          style={{ color: pickTextOnColor(hexColor) }}
                          aria-hidden
                        >
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
                  const checkHex = hasGradient
                    ? extractFirstHexColor(colorValue) || '#000000'
                    : colorValue

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
                        <span
                          className="absolute inset-0 flex items-center justify-center text-lg font-bold drop-shadow-lg"
                          style={{ color: pickTextOnColor(checkHex) }}
                          aria-hidden
                        >
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
              {getStepNumber(10)}
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
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={mapSizeFilter}
                  onChange={(e) => setMapSizeFilter(e.target.value as typeof mapSizeFilter)}
                  className="bg-surface-2 border border-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All Sizes</option>
                  <option value="Small">Small (≤35)</option>
                  <option value="Medium">Medium (36–45)</option>
                  <option value="Large">Large (46–65)</option>
                  <option value="Very Large">Very Large (66–90)</option>
                  <option value="Massive">Massive (91+)</option>
                </select>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-primary scrollbar-track-surface-2">
                {mapsLoading ? (
                  <div className="text-center py-4 text-muted">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                    Loading maps...
                  </div>
                ) : (
                  maps
                    .filter((map) => {
                      const matchesSearch =
                        mapSearch === '' ||
                        map.name.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        map.description?.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        map.tags?.some((tag) => tag.toLowerCase().includes(mapSearch.toLowerCase()))
                      const matchesSize =
                        mapSizeFilter === '' ||
                        computeMapSizeFromCounts(map.territory_count) === mapSizeFilter
                      return matchesSearch && matchesSize
                    })
                    .map((map) => {
                      const ratingAverage = Number(map.rating_average ?? 0)
                      const totalPlays = Number(map.play_count ?? 0)

                      return (
                        <button
                          key={map.id}
                          type="button"
                          className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                            selectedMap === map.id
                              ? map.id === 'random'
                                ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-lg'
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
                            {ratingAverage > 0 && (
                              <div className="text-xs text-yellow-400">
                                {'⭐'.repeat(Math.floor(ratingAverage))}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-muted">
                            {map.territory_count > 0
                              ? `${map.territory_count} territories • Map Size: ${computeMapSizeFromCounts(map.territory_count)}`
                              : 'Randomly selected when game starts'}
                          </div>
                          {map.creator_name && map.id !== 'classic' && map.id !== 'random' && (
                            <div className="text-xs text-muted mt-1">
                              by {map.creator_name}
                              {totalPlays > 0 && ` • ${totalPlays} plays`}
                            </div>
                          )}
                        </button>
                      )
                    })
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
                  const isRandomMap = selectedMapData.id === 'random'
                  const ratingAverage = Number(selectedMapData.rating_average ?? 0)
                  const ratingCount = Number(selectedMapData.rating_count ?? 0)
                  const totalPlays = Number(selectedMapData.play_count ?? 0)
                  const monthlyPlays = Number(selectedMapData.play_count_30d ?? 0)

                  const handleOpenMapDetails = () => {
                    if (isRandomMap) {
                      return
                    }
                    setMapDetailModalId(selectedMapData.id)
                  }

                  return (
                    <>
                      <button
                        type="button"
                        onClick={handleOpenMapDetails}
                        disabled={isRandomMap}
                        className={`relative w-full h-60 md:h-72 rounded-lg mb-4 flex items-center justify-center border border-white/10 overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isRandomMap
                            ? 'bg-white/5'
                            : 'bg-white/10 hover:border-primary/60 cursor-zoom-in group'
                        }`}
                        aria-label={
                          isRandomMap ? 'Map preview' : 'Open detailed map preview with tokens'
                        }
                      >
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={selectedMapData.name}
                            className="h-full max-h-full w-full max-w-full object-contain"
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
                        {!isRandomMap && (
                          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                            Click to expand
                          </span>
                        )}
                      </button>
                      {selectedMap !== 'random' && (
                        <div>
                          {selectedMapData.description && (
                            <p className="text-sm text-muted mb-3">{selectedMapData.description}</p>
                          )}
                          <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <dt className="text-muted">Territories</dt>
                              <dd className="text-white">
                                {selectedMapData.territory_count || 'Unknown'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Continents</dt>
                              <dd className="text-white">
                                {selectedMapData.continent_count || 'Unknown'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Map Size</dt>
                              <dd className="text-white">
                                {computeMapSizeFromCounts(selectedMapData.territory_count)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Games Last Month</dt>
                              <dd className="text-white">
                                {monthlyPlays > 0 ? monthlyPlays : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Games Played</dt>
                              <dd className="text-white">{totalPlays > 0 ? totalPlays : '—'}</dd>
                            </div>
                            {selectedMapData.creator_name && selectedMapData.id !== 'classic' && (
                              <div className="col-span-2">
                                <dt className="text-muted">Created by</dt>
                                <dd className="text-white">{selectedMapData.creator_name}</dd>
                              </div>
                            )}
                            {selectedMapData.createdAt && (
                              <div className="col-span-2">
                                <dt className="text-muted">Created</dt>
                                <dd className="text-white">
                                  {new Date(selectedMapData.createdAt).toLocaleDateString(
                                    undefined,
                                    {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    },
                                  )}
                                </dd>
                              </div>
                            )}
                            {ratingAverage > 0 && (
                              <div className="col-span-2">
                                <dt className="text-muted">Rating</dt>
                                <dd className="text-yellow-400">
                                  {'⭐'.repeat(Math.floor(ratingAverage))}
                                  <span className="text-white ml-1">
                                    ({ratingAverage.toFixed(1)}/5 from {ratingCount} reviews)
                                  </span>
                                </dd>
                              </div>
                            )}
                          </dl>
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

      <MapDetailModal
        isOpen={mapDetailModalId !== null}
        mapId={mapDetailModalId}
        onClose={() => setMapDetailModalId(null)}
      />
    </div>
  )
}

export default CreateGamePage
