import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { gameService } from '../services/gameService'
import type { GameRoom } from '../types/gameRoom'

type PlayMode = 'casual' | 'ranked'

interface PlayModePageProps {
  mode: PlayMode
}

type NormalizedRoom = GameRoom & {
  isRanked?: boolean
  playerCount?: number
}

const MODE_CONFIG: Record<
  PlayMode,
  {
    title: string
    description: string
    heroEmoji: string
    highlight: string
    createCta: { label: string; path: string; secondary?: string }
    bulletPoints: string[]
    filter: (room: NormalizedRoom) => boolean
  }
> = {
  casual: {
    title: 'Casual Matches',
    description: 'Jump into open games with flexible settings and relaxed rules.',
    heroEmoji: '🎮',
    highlight: 'Open to everyone — no ladder requirements.',
    createCta: {
      label: 'Host Casual Lobby',
      path: '/create',
      secondary: 'Looking for a private game? Set visibility to private when creating a lobby.',
    },
    bulletPoints: [
      'Public and private games both supported',
      'Optional teams and modifiers',
      'Great for practice and new strategies',
    ],
    filter: (room) => room.isRanked !== true,
  },
  ranked: {
    title: 'Ranked Ladder',
    description: 'Face competitive opponents and climb the ConquestK ladder.',
    heroEmoji: '🏆',
    highlight: 'Ranked games follow strict rules for fair competition.',
    createCta: {
      label: 'Create Ranked Match',
      path: '/create',
      secondary: 'Ranked lobbies must be public, 3+ players, and disable teams.',
    },
    bulletPoints: [
      'Public only — no invite codes',
      '3-6 players, free-for-all',
      'ELO updates at the end of each game',
    ],
    filter: (room) => room.isRanked === true,
  },
}

const normalizeRoom = (
  room: GameRoom & { is_ranked?: boolean; current_players?: number },
): NormalizedRoom => {
  const isRanked =
    typeof room.isRanked === 'boolean'
      ? room.isRanked
      : typeof room.is_ranked === 'boolean'
        ? room.is_ranked
        : undefined

  const currentPlayers =
    typeof room.currentPlayers === 'number'
      ? room.currentPlayers
      : typeof room.playerCount === 'number'
        ? room.playerCount
        : typeof room.current_players === 'number'
          ? room.current_players
          : undefined

  return {
    ...room,
    isRanked,
    playerCount: currentPlayers,
  }
}

const statusLabel: Record<NonNullable<GameRoom['status']>, string> = {
  lobby: 'Waiting for players',
  initializing: 'Launching',
  active: 'In progress',
  completed: 'Finished',
  paused: 'Paused',
  abandoned: 'Abandoned',
}

const PlayModePage: React.FC<PlayModePageProps> = ({ mode }) => {
  const navigate = useNavigate()
  const config = MODE_CONFIG[mode]
  const [rooms, setRooms] = useState<NormalizedRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await gameService.getPublicGames()
      const rawRooms = Array.isArray(response.rooms)
        ? (response.rooms as Array<GameRoom & { is_ranked?: boolean; current_players?: number }>)
        : []
      const normalized = rawRooms.map((room) => normalizeRoom(room))
      setRooms(normalized)
    } catch (err) {
      logger.error(`[PlayMode] Failed to load ${mode} rooms`, err)
      setError('Unable to load games right now. Please try again in a moment.')
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const filteredRooms = useMemo(() => rooms.filter((room) => config.filter(room)), [rooms, config])

  const handleJoin = async (roomId: string) => {
    try {
      setJoiningRoomId(roomId)
      const response = await gameService.joinRoom(roomId)
      if (response.room || response.success) {
        navigate(`/room/${roomId}`)
        return
      }
      navigate(`/room/${roomId}`)
    } catch (err: unknown) {
      logger.error('[PlayMode] Failed to join room', err)
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { response?: { data?: { message?: string } }; message?: string })?.message ||
        'We could not join that game. It might be full or already started.'
      setError(message)
    } finally {
      setJoiningRoomId(null)
    }
  }

  const createPath = useMemo(() => {
    if (mode === 'ranked') {
      return '/create?mode=ranked'
    }
    return config.createCta.path
  }, [mode, config.createCta.path])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl" aria-hidden>
                {config.heroEmoji}
              </span>
              <h1 className="text-3xl font-bold text-white">{config.title}</h1>
            </div>
            <p className="text-muted text-lg mb-3">{config.description}</p>
            <p className="text-primary-soft text-sm font-semibold uppercase tracking-wide">
              {config.highlight}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => void loadRooms()}
              disabled={loading}
              className="px-5 py-3 rounded-lg border border-white/20 text-white bg-transparent hover:bg-white/5 transition disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh Games'}
            </button>
            <Link
              to={createPath}
              className="px-5 py-3 rounded-lg bg-primary text-white font-semibold shadow hover:bg-primary"
            >
              {config.createCta.label}
            </Link>
          </div>
        </div>
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 text-sm text-muted">
          {config.bulletPoints.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-1 text-green-400">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {config.createCta.secondary && (
          <p className="mt-6 text-xs text-muted/80 italic">{config.createCta.secondary}</p>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <span>Available Games</span>
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs text-muted">
            {filteredRooms.length}
          </span>
        </h2>

        {loading ? (
          <div className="py-16 text-center text-muted">
            <div className="text-4xl mb-3">🔄</div>
            <p>Loading games…</p>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-16 text-center text-muted border border-dashed border-white/10 rounded-xl">
            <div className="text-4xl mb-4">🕒</div>
            <p className="text-lg mb-2">No games are open right now.</p>
            <p className="text-sm">
              Be the first to create a lobby or check back in a few minutes.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void loadRooms()}
                className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/5"
              >
                Refresh
              </button>
              <Link
                to={createPath}
                className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary"
              >
                {config.createCta.label}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-semibold text-white">
                      {room.name || 'Untitled Game'}
                    </h3>
                    {room.mapName && (
                      <span className="text-xs uppercase tracking-wide text-muted bg-white/10 px-2 py-1 rounded">
                        {room.mapName}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                    <span>
                      👥 {room.playerCount ?? room.currentPlayers ?? 0}/{room.maxPlayers} players
                    </span>
                    <span>• {statusLabel[room.status]}</span>
                    {room.hostUsername && <span>• Host: {room.hostUsername}</span>}
                    {room.allowTeamPlay && <span>• Teams enabled</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/room/${room.id}`}
                    className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleJoin(room.id)}
                    disabled={joiningRoomId === room.id}
                    className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {joiningRoomId === room.id ? 'Joining…' : 'Join Game'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-white/10 text-center text-sm text-muted">
        <Link to="/play" className="text-primary-soft hover:text-primary">
          ← Back to Play Hub
        </Link>
      </div>
    </div>
  )
}

export default PlayModePage
