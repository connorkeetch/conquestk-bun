import { useAppSelector } from '@/hooks/redux'

export function ConnectionStatusBanner() {
  const connectionStatus = useAppSelector((state) => state.uiRoom.connectionStatus)
  const desyncDetected = useAppSelector((state) => state.uiRoom.desyncDetected)
  const resyncing = useAppSelector((state) => state.uiRoom.resyncing)

  // Determine what to show based on state priority
  const getStatus = () => {
    if (desyncDetected || resyncing) {
      return {
        text: 'Syncing game state...',
        color: 'bg-yellow-600/20 text-yellow-200 border-yellow-600/30',
        icon: '🔄',
      }
    }

    if (connectionStatus === 'disconnected') {
      return {
        text: 'Disconnected - Attempting to reconnect...',
        color: 'bg-red-600/20 text-red-200 border-red-600/30',
        icon: '⚠️',
      }
    }

    if (connectionStatus === 'connecting') {
      return {
        text: 'Connecting...',
        color: 'bg-blue-600/20 text-blue-200 border-blue-600/30',
        icon: '🔌',
      }
    }

    // Connected - don't show banner
    return null
  }

  const status = getStatus()

  if (!status) return null

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 border-b ${status.color} text-sm font-medium`}
    >
      <span>{status.icon}</span>
      <span>{status.text}</span>
    </div>
  )
}
