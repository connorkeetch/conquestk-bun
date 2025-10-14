import { MatchSvcClient } from '@conquestk/match-client'
import RedisPkg from 'ioredis'
import type { Server } from 'socket.io'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

const normalizeBaseUrl = (u: string | undefined): string => {
  const raw = (u || 'http://localhost:8085').trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  return withScheme.replace(/\/+$/, '')
}

const baseUrl = normalizeBaseUrl(process.env.MATCHSVC_URL)
const hmac = process.env.MATCHSVC_HMAC_SECRET
const USE_MATCHSVC = String(process.env.USE_MATCHSVC || '').toLowerCase() === 'true'

export const matchClient = new MatchSvcClient({ baseUrl, hmacSecret: hmac })

// --- Local presence fallback (TS) ---
// When USE_MATCHSVC !== 'true', we handle presence directly via Redis to avoid
// depending on the Go service. This keeps behavior predictable for manual games.
type PresenceDoc = {
  status: 'online' | 'offline'
  lastSeen: number
  connectionIds: string[]
  roomId?: string | null
}

const P_ONLINE_SET = 'presence:online:users'
const presenceKey = (userId: string) => `presence:${userId}`
const roomMembersKey = (roomId: string) => `room:${roomId}:members`

async function localSetOnline(userId: string, connectionId: string, roomId?: string) {
  const r = getRedisClient()
  if (!r) return
  const key = presenceKey(userId)
  let doc: PresenceDoc | null = null
  try {
    const raw = await r.get(key)
    if (raw) doc = JSON.parse(raw) as PresenceDoc
  } catch {
    // ignore
  }
  const ids = new Set<string>(doc?.connectionIds ?? [])
  ids.add(connectionId)
  const payload: PresenceDoc = {
    status: 'online',
    lastSeen: Date.now(),
    connectionIds: Array.from(ids),
    ...(roomId ? { roomId } : doc?.roomId ? { roomId: doc.roomId } : {}),
  }
  await r.set(key, JSON.stringify(payload))
  await r.sadd(P_ONLINE_SET, userId)
  if (roomId) await r.sadd(roomMembersKey(roomId), userId)
}

async function localSetOffline(userId: string, connectionId: string) {
  const r = getRedisClient()
  if (!r) return
  const key = presenceKey(userId)
  const raw = await r.get(key)
  if (!raw) return
  let doc: PresenceDoc
  try {
    doc = JSON.parse(raw) as PresenceDoc
  } catch {
    return
  }
  const nextIds = (doc.connectionIds || []).filter((id) => id !== connectionId)
  const offline = nextIds.length === 0
  const payload: PresenceDoc = {
    status: offline ? 'offline' : 'online',
    lastSeen: Date.now(),
    connectionIds: nextIds,
    roomId: doc.roomId ?? null,
  }
  await r.set(key, JSON.stringify(payload))
  if (offline) {
    await r.srem(P_ONLINE_SET, userId)
    if (doc.roomId) await r.srem(roomMembersKey(doc.roomId), userId)
  }
}

async function localMove(userId: string, fromRoomId?: string, toRoomId?: string) {
  const r = getRedisClient()
  if (!r) return
  if (fromRoomId) await r.srem(roomMembersKey(fromRoomId), userId)
  if (toRoomId) await r.sadd(roomMembersKey(toRoomId), userId)
  const key = presenceKey(userId)
  let doc: PresenceDoc | null = null
  try {
    const raw = await r.get(key)
    if (raw) doc = JSON.parse(raw) as PresenceDoc
  } catch {
    // ignore
  }
  const payload: PresenceDoc = {
    status: 'online',
    lastSeen: Date.now(),
    connectionIds: doc?.connectionIds ?? [],
    roomId: typeof toRoomId === 'string' ? toRoomId : (doc?.roomId ?? null),
  }
  await r.set(key, JSON.stringify(payload))
}

export async function matchPresenceOnline(userId: string, connectionId: string, roomId?: string) {
  if (USE_MATCHSVC) {
    try {
      await matchClient.presenceOnline({
        user_id: userId,
        connection_id: connectionId,
        ...(roomId ? { room_id: roomId } : {}),
      })
    } catch (e) {
      logger.debug('matchsvc presenceOnline failed (best-effort)', { error: (e as Error)?.message })
    }
    return
  }
  await localSetOnline(userId, connectionId, roomId)
}

export async function matchPresenceOffline(userId: string, connectionId: string) {
  if (USE_MATCHSVC) {
    try {
      await matchClient.presenceOffline({ user_id: userId, connection_id: connectionId })
    } catch (e) {
      logger.debug('matchsvc presenceOffline failed (best-effort)', {
        error: (e as Error)?.message,
      })
    }
    return
  }
  await localSetOffline(userId, connectionId)
}

export async function matchPresenceMove(userId: string, fromRoomId?: string, toRoomId?: string) {
  if (USE_MATCHSVC) {
    try {
      await matchClient.presenceMove({
        user_id: userId,
        ...(fromRoomId ? { from_room_id: fromRoomId } : {}),
        ...(toRoomId ? { to_room_id: toRoomId } : {}),
      })
    } catch (e) {
      logger.debug('matchsvc presenceMove failed (best-effort)', { error: (e as Error)?.message })
    }
    return
  }
  await localMove(userId, fromRoomId, toRoomId)
}

export async function startMatchSvcSubscriber(io: Server) {
  if (!USE_MATCHSVC) {
    _subscriberActive = false
    logger.info('ℹ️ matchsvc disabled; subscriber not started')
    return
  }
  try {
    const client = getRedisClient()
    if (!client) {
      logger.warn('matchsvc subscriber disabled (Redis not available)')
      return
    }
    const RedisCtor = RedisPkg as unknown as typeof import('ioredis').default
    const sub = new RedisCtor(client.options as unknown as Record<string, unknown>)
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
