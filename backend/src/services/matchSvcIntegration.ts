import { MatchSvcClient } from '@conquestk/match-client'
import RedisPkg from 'ioredis'
import type { Server } from 'socket.io'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

const baseUrl = process.env.MATCHSVC_URL || 'http://localhost:8085'
const hmac = process.env.MATCHSVC_HMAC_SECRET

export const matchClient = new MatchSvcClient({ baseUrl, hmacSecret: hmac })

export async function matchPresenceOnline(userId: string, connectionId: string, roomId?: string) {
  try {
    await matchClient.presenceOnline({
      user_id: userId,
      connection_id: connectionId,
      ...(roomId ? { room_id: roomId } : {}),
    })
  } catch (e) {
    logger.debug('matchsvc presenceOnline failed (best-effort)', { error: (e as Error)?.message })
  }
}

export async function matchPresenceOffline(userId: string, connectionId: string) {
  try {
    await matchClient.presenceOffline({ user_id: userId, connection_id: connectionId })
  } catch (e) {
    logger.debug('matchsvc presenceOffline failed (best-effort)', { error: (e as Error)?.message })
  }
}

export async function matchPresenceMove(userId: string, fromRoomId?: string, toRoomId?: string) {
  try {
    await matchClient.presenceMove({
      user_id: userId,
      ...(fromRoomId ? { from_room_id: fromRoomId } : {}),
      ...(toRoomId ? { to_room_id: toRoomId } : {}),
    })
  } catch (e) {
    logger.debug('matchsvc presenceMove failed (best-effort)', { error: (e as Error)?.message })
  }
}

export async function startMatchSvcSubscriber(io: Server) {
  try {
    const client = getRedisClient()
    if (!client) {
      logger.warn('matchsvc subscriber disabled (Redis not available)')
      return
    }
    const sub = new RedisPkg(client.options)
    await sub.subscribe('matchsvc:events')
    _subscriberActive = true
    sub.on('message', async (_channel: string, message: string) => {
      try {
        const payload = JSON.parse(message) as { type: string; [k: string]: unknown }
        switch (payload.type) {
          case 'match.found': {
            const players = (payload.players as string[]) || []
            const matchId = String(payload.matchId || '')
            for (const userId of players) {
              io.to(`user:${userId}`).emit('notification:new', {
                id: `match:${matchId}:${userId}`,
                type: 'match.found',
                title: 'Match found',
                message: 'A game is ready for you',
                createdAt: new Date().toISOString(),
                metadata: payload,
              })
            }
            break
          }
          case 'presence.changed': {
            const userId = String(payload.userId || '')
            if (userId) {
              io.to(`user:${userId}`).emit('notification:new', {
                id: `presence:${userId}:${Date.now()}`,
                type: 'presence.changed',
                title: 'Presence update',
                message: `Status ${String((payload as { status?: unknown }).status)}`,
                createdAt: new Date().toISOString(),
                metadata: payload,
              })
            }
            break
          }
          case 'room.roster.updated': {
            const roomId = String(payload.roomId || '')
            if (roomId) {
              io.to(roomId).emit('notification:new', {
                id: `roster:${roomId}:${Date.now()}`,
                type: 'room.roster.updated',
                title: 'Room roster updated',
                message: 'Membership changed',
                createdAt: new Date().toISOString(),
                metadata: payload,
              })
            }
            break
          }
          default:
            break
        }
      } catch (e) {
        logger.debug('matchsvc subscriber parse/emit failed', { error: (e as Error)?.message })
      }
    })
    logger.info('✅ Subscribed to matchsvc:events')
  } catch (e) {
    logger.warn('matchsvc subscriber initialization failed', { error: (e as Error)?.message })
  }
}

let _subscriberActive = false
export function isMatchSvcSubscriberActive(): boolean {
  return _subscriberActive
}
