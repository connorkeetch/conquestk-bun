import apiClient from './api'

export interface ProfileRankSummary {
  name: string
  color: string
  insignia: string
  rating: number
  minRating?: number
  nextRank?: { name: string; minRating: number } | null
}

export interface ProfileSummary {
  id: string
  username: string
  email?: string
  emailVerified?: boolean
  avatarUrl: string | null
  bio?: string | null
  tagline?: string | null
  elo: number
  joinDate: string
  lastActive?: string | null
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  peakRating: number
  preferredColor?: string | null
  rank: ProfileRankSummary
}

export interface MatchHistoryEntry {
  gameId: string
  gameName: string | null
  gameMode: string | null
  status: string
  result: 'won' | 'lost'
  durationMinutes: number | null
  startedAt: string | null
  endedAt: string | null
}

export interface PlayerStatsOverview {
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  totalEliminations: number
  territoriesConquered: number
  longestWinStreak: number
  currentWinStreak: number
  favoriteMapId?: string | null
  updatedAt?: string | null
  bestTerritories?: number
  bestArmies?: number
  cardTrades?: number
  cardsTraded?: number
}

export interface MapStatsSummary {
  mapName: string
  gamesPlayed: number
  wins: number
  averageGameLength?: number
  bestTerritories?: number
}

export interface GameModeStatsSummary {
  mode: string
  gamesPlayed: number
  wins: number
  averageGameLength?: number
}

export interface TimelineEntry {
  date: string
  gamesPlayed: number
  wins: number
  playtimeMinutes: number
}

export interface PlayerStatsBreakdown {
  overall: PlayerStatsOverview
  maps: MapStatsSummary[]
  gameModes: GameModeStatsSummary[]
  timeline: TimelineEntry[]
}

const computeWinRate = (wins: number, gamesPlayed: number): number => {
  if (gamesPlayed <= 0) {
    return 0
  }
  return Math.round((wins / gamesPlayed) * 1000) / 10
}

type RawProfileSummary = {
  id: string
  username: string
  email?: unknown
  emailVerified?: unknown
  email_verified?: unknown
  avatarUrl?: unknown
  avatar_url?: unknown
  bio?: unknown
  tagline?: unknown
  elo: unknown
  joinDate?: unknown
  join_date?: unknown
  lastActive?: unknown
  last_active?: unknown
  gamesPlayed?: unknown
  games_played?: unknown
  gamesWon?: unknown
  games_won?: unknown
  gamesLost?: unknown
  games_lost?: unknown
  winRate?: unknown
  win_rate?: unknown
  peakRating?: unknown
  peak_rating?: unknown
  preferredColor?: unknown
  preferred_color?: unknown
  rank?: Record<string, unknown>
  rank_name?: unknown
  rank_color?: unknown
  rank_insignia?: unknown
  rank_rating?: unknown
  rank_min_rating?: unknown
  nextRank?: { name: string; minRating: number } | null
}

type RawStatsAggregated = Record<string, unknown>

type RawStatsBreakdown = {
  overall?: RawStatsAggregated
  byMap?: Record<string, RawStatsAggregated>
  by_map?: Record<string, RawStatsAggregated>
  byGameMode?: Record<string, RawStatsAggregated>
  by_game_mode?: Record<string, RawStatsAggregated>
  timeline?: Array<RawStatsAggregated>
}

const pickNumber = (
  source: Record<string, unknown>,
  keys: string[],
  fallback: number = 0,
): number => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number') {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }
  return fallback
}

const pickString = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') {
      return value
    }
  }
  return undefined
}

const pickNullableString = (source: Record<string, unknown>, keys: string[]): string | null => {
  const value = pickString(source, keys)
  return value ?? null
}

const normalizeMatchHistoryEntry = (data: Record<string, unknown>): MatchHistoryEntry => {
  const rawDuration = pickNumber(data, ['durationMinutes', 'duration_minutes'], -1)

  return {
    gameId: pickString(data, ['gameId', 'game_id']) ?? 'unknown',
    gameName: pickNullableString(data, ['gameName', 'game_name']),
    gameMode: pickNullableString(data, ['gameMode', 'game_mode']),
    status: pickString(data, ['status']) ?? 'unknown',
    result: pickString(data, ['result']) === 'won' ? 'won' : 'lost',
    durationMinutes: rawDuration >= 0 ? rawDuration : null,
    startedAt: pickNullableString(data, ['startedAt', 'started_at']),
    endedAt: pickNullableString(data, ['endedAt', 'ended_at']),
  }
}

const normalizeProfileSummary = (data: RawProfileSummary): ProfileSummary => {
  const rankSource = (data.rank ?? {}) as Record<string, unknown>

  const elo = pickNumber(data as Record<string, unknown>, ['elo'], 1000)
  const wins = pickNumber(data as Record<string, unknown>, ['wins', 'games_won'], 0)
  const gamesPlayed = pickNumber(
    data as Record<string, unknown>,
    ['gamesPlayed', 'games_played'],
    0,
  )

  return {
    id: data.id,
    username: data.username,
    email: pickString(data as Record<string, unknown>, ['email']),
    emailVerified: (data.emailVerified ?? data.email_verified) as boolean | undefined,
    avatarUrl: pickNullableString(data as Record<string, unknown>, ['avatarUrl', 'avatar_url']),
    bio: pickNullableString(data as Record<string, unknown>, ['bio']),
    tagline: pickNullableString(data as Record<string, unknown>, ['tagline']),
    elo,
    joinDate:
      pickString(data as Record<string, unknown>, ['joinDate', 'join_date']) ??
      new Date().toISOString(),
    lastActive: pickNullableString(data as Record<string, unknown>, ['lastActive', 'last_active']),
    gamesPlayed,
    wins,
    losses: pickNumber(
      data as Record<string, unknown>,
      ['losses', 'games_lost'],
      Math.max(0, gamesPlayed - wins),
    ),
    winRate: pickNumber(
      data as Record<string, unknown>,
      ['winRate', 'win_rate'],
      computeWinRate(wins, gamesPlayed),
    ),
    peakRating: pickNumber(data as Record<string, unknown>, ['peakRating', 'peak_rating'], elo),
    preferredColor: pickNullableString(data as Record<string, unknown>, [
      'preferredColor',
      'preferred_color',
    ]),
    rank: {
      name:
        pickString(rankSource, ['name']) ??
        pickString(data as Record<string, unknown>, ['rank_name']) ??
        'Unranked',
      color:
        pickString(rankSource, ['color']) ??
        pickString(data as Record<string, unknown>, ['rank_color']) ??
        '#ffffff',
      insignia:
        pickString(rankSource, ['insignia']) ??
        pickString(data as Record<string, unknown>, ['rank_insignia']) ??
        '🎖️',
      rating: pickNumber(
        rankSource,
        ['rating'],
        pickNumber(data as Record<string, unknown>, ['rank_rating'], elo),
      ),
      minRating: pickNumber(
        rankSource,
        ['minRating'],
        pickNumber(data as Record<string, unknown>, ['rank_min_rating'], 0),
      ),
      nextRank:
        (rankSource.nextRank as { name: string; minRating: number } | null) ??
        data.nextRank ??
        null,
    },
  }
}

const normalizeStatsBreakdown = (payload: RawStatsBreakdown): PlayerStatsBreakdown => {
  const overallSource = (payload.overall ?? {}) as Record<string, unknown>
  const gamesPlayed = pickNumber(overallSource, ['games_played', 'gamesPlayed'], 0)
  const wins = pickNumber(overallSource, ['games_won', 'gamesWon'], 0)
  const lossesRaw = pickNumber(
    overallSource,
    ['games_lost', 'gamesLost'],
    Math.max(0, gamesPlayed - wins),
  )

  const overall: PlayerStatsOverview = {
    gamesPlayed,
    wins,
    losses: lossesRaw,
    winRate: computeWinRate(wins, gamesPlayed),
    totalEliminations: pickNumber(overallSource, ['total_eliminations', 'totalEliminations'], 0),
    territoriesConquered: pickNumber(
      overallSource,
      ['total_territories_conquered', 'totalTerritoriesConquered'],
      0,
    ),
    longestWinStreak: pickNumber(
      overallSource,
      ['longest_win_streak', 'longestWinStreak', 'longest_streak'],
      0,
    ),
    currentWinStreak: pickNumber(
      overallSource,
      ['current_win_streak', 'currentWinStreak', 'current_streak'],
      0,
    ),
    favoriteMapId: pickNullableString(overallSource, ['favorite_map_id', 'favoriteMapId']),
    updatedAt: pickNullableString(overallSource, ['updated_at', 'updatedAt']),
    bestTerritories: pickNumber(overallSource, ['best_territories', 'bestTerritories'], 0),
    bestArmies: pickNumber(overallSource, ['best_armies', 'bestArmies'], 0),
    cardTrades: pickNumber(overallSource, ['card_trades', 'cardTrades'], 0),
    cardsTraded: pickNumber(overallSource, ['cards_traded', 'cardsTraded'], 0),
  }

  const byMapRaw = payload.byMap ?? payload.by_map ?? {}
  const maps: MapStatsSummary[] = Object.entries(byMapRaw).map(([mapName, value]) => {
    const mapSource = value as Record<string, unknown>
    const games = pickNumber(mapSource, ['games_played', 'gamesPlayed'], 0)
    const winsForMap = pickNumber(mapSource, ['games_won', 'gamesWon'], 0)
    const avgLength = pickNumber(mapSource, ['averageGameLength', 'avg_duration'], 0)
    const bestTerritories = pickNumber(mapSource, ['bestTerritories', 'best_territories'], 0)
    return {
      mapName,
      gamesPlayed: games,
      wins: winsForMap,
      averageGameLength: avgLength > 0 ? avgLength : undefined,
      bestTerritories: bestTerritories > 0 ? bestTerritories : undefined,
    }
  })

  const byGameModeRaw = payload.byGameMode ?? payload.by_game_mode ?? {}
  const gameModes: GameModeStatsSummary[] = Object.entries(byGameModeRaw).map(([mode, value]) => {
    const modeSource = value as Record<string, unknown>
    const games = pickNumber(modeSource, ['games_played', 'gamesPlayed'], 0)
    const winsPerMode = pickNumber(modeSource, ['games_won', 'gamesWon'], 0)
    const avgLength = pickNumber(modeSource, ['averageGameLength', 'avg_duration'], 0)
    return {
      mode,
      gamesPlayed: games,
      wins: winsPerMode,
      averageGameLength: avgLength > 0 ? avgLength : undefined,
    }
  })

  const timelineRaw = Array.isArray(payload.timeline) ? payload.timeline : []
  const timeline: TimelineEntry[] = timelineRaw.map((entry) => {
    const entrySource = entry as Record<string, unknown>
    const games = pickNumber(entrySource, ['games_played', 'gamesPlayed'], 0)
    const winsEntry = pickNumber(entrySource, ['games_won', 'gamesWon'], 0)
    return {
      date: pickString(entrySource, ['date']) ?? new Date().toISOString(),
      gamesPlayed: games,
      wins: winsEntry,
      playtimeMinutes: pickNumber(entrySource, ['playtime', 'playtimeMinutes'], 0),
    }
  })

  return {
    overall,
    maps,
    gameModes,
    timeline,
  }
}

interface RequestOptions {
  signal?: AbortSignal
}

interface MatchHistoryOptions extends RequestOptions {
  limit?: number
  offset?: number
  isOwnProfile?: boolean
}

export const profileService = {
  async getProfileByUsername(
    username: string,
    options: RequestOptions = {},
  ): Promise<ProfileSummary> {
    const response = await apiClient.get(`/users/${encodeURIComponent(username)}/profile`, {
      signal: options.signal,
    })
    return normalizeProfileSummary(response.data)
  },

  async getMyProfile(options: RequestOptions = {}): Promise<ProfileSummary> {
    const response = await apiClient.get('/users/profile', { signal: options.signal })
    return normalizeProfileSummary(response.data)
  },

  async getMyStats(options: RequestOptions = {}): Promise<PlayerStatsBreakdown> {
    const response = await apiClient.get('/profile/stats', { signal: options.signal })
    return normalizeStatsBreakdown(response.data)
  },

  async getMatchHistory(
    username: string,
    options: MatchHistoryOptions = {},
  ): Promise<{ matches: MatchHistoryEntry[]; hasMore: boolean; nextOffset: number }> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 50)
    const offset = Math.max(options.offset ?? 0, 0)
    const endpoint = options.isOwnProfile
      ? '/profile/history'
      : `/users/${encodeURIComponent(username)}/history`

    const response = await apiClient.get(endpoint, {
      params: { limit, offset },
      signal: options.signal,
    })

    const rawMatches = Array.isArray(response.data?.matches) ? response.data.matches : []
    const matches = rawMatches.map((item: Record<string, unknown>) =>
      normalizeMatchHistoryEntry(item),
    )

    const hasMore = Boolean(
      typeof response.data?.pagination?.hasMore === 'boolean'
        ? response.data.pagination.hasMore
        : matches.length === limit,
    )

    return {
      matches,
      hasMore,
      nextOffset: offset + matches.length,
    }
  },
}

export default profileService
export type UserSearchResult = { id: string; username: string }

export async function searchUsers(
  query: string,
  limit = 10,
  options: RequestOptions = {},
): Promise<UserSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const response = await apiClient.get<{
    users: Array<{ id: string; username: string }>
  }>('/users/search', {
    params: { q, limit },
    signal: options.signal,
  })
  return response.data.users ?? []
}
