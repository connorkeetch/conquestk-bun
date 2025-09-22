import { tryGetSocketServer } from './socketRegistry'

export interface RealtimeNotificationPayload {
  id: string
  type: string
  title: string
  message: string
  createdAt: string
  read?: boolean
  icon?: string
  actionUrl?: string
  actionLabel?: string
  metadata?: Record<string, unknown>
}

export const emitNotificationToUsers = (
  userIds: string[],
  payload: RealtimeNotificationPayload,
): void => {
  const io = tryGetSocketServer()
  if (!io) {
    return
  }

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  uniqueIds.forEach((userId) => {
    io.to(`user:${userId}`).emit('notification:new', payload)
  })
}

export const emitNotificationToAdmin = (
  userId: string | null | undefined,
  payload: RealtimeNotificationPayload,
): void => {
  if (!userId) {
    return
  }
  emitNotificationToUsers([userId], payload)
}
