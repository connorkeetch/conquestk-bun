import { useEffect, useState } from 'react'
import { useAppSelector } from '@/hooks/redux'

export function ConnectionBanner() {
  const status = useAppSelector((s) => s.uiRoom.connectionStatus)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(status !== 'connected')
  }, [status])

  if (!visible) return null

  const text = status === 'connecting' ? 'Reconnecting…' : 'Disconnected. Trying to reconnect…'

  return (
    <div className="fixed top-0 inset-x-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="pointer-events-auto rounded bg-[color:var(--color-warning)] text-[color:var(--color-on-warning, #111)] shadow-md px-3 py-2 text-sm">
          {text}
        </div>
      </div>
    </div>
  )
}
