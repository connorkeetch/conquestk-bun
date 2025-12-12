// Socket.io removed - using Colyseus in server.ts
// TODO: Reimplement notifications through Colyseus ChatRoom

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
  _userIds: string[],
  _payload: RealtimeNotificationPayload,
): void => {
  // No-op: Socket.io removed, notifications will be handled by Colyseus ChatRoom
}

export const emitNotificationToAdmin = (
  _userId: string | null | undefined,
  _payload: RealtimeNotificationPayload,
): void => {
  // No-op: Socket.io removed, notifications will be handled by Colyseus ChatRoom
}
