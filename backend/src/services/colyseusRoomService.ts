import { matchMaker } from 'colyseus'
import { logger } from '../utils/logger.js'

const ROOM_NAME = 'game'

export interface ColyseusLobbyRoomOptions {
  roomId: string
  mapId: string
  hostId: string
  maxPlayers?: number | null
  gameMode?: string | null
  fogOfWar?: boolean | null
  turnTimerSeconds?: number | null
  teamMode?: boolean | null
  numberOfTeams?: number | null
}

export async function ensureColyseusLobbyRoom(options: ColyseusLobbyRoomOptions): Promise<void> {
  if (process.env.NODE_ENV === 'test') return
  if (!options.roomId || !options.mapId) return

  const gameId = options.roomId

  try {
    if (matchMaker.state !== matchMaker.MatchMakerState.READY) {
      logger.debug('Colyseus matchmaker not ready; skipping lobby room creation', {
        roomId: options.roomId,
      })
      return
    }

    const existing = await matchMaker.query({ name: ROOM_NAME, gameId })
    if (existing.length > 0) {
      return
    }

    const created = await matchMaker.createRoom(ROOM_NAME, {
      ...options,
      gameId,
    })

    logger.info('Colyseus lobby room created', {
      roomId: options.roomId,
      colyseusRoomId: created.roomId,
    })
  } catch (error) {
    logger.warn('Failed to ensure Colyseus lobby room', {
      roomId: options.roomId,
      error: error instanceof Error ? error.message : error,
    })
  }
}
