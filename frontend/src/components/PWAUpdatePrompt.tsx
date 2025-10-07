import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import toast from 'react-hot-toast'

export default function PWAUpdatePrompt() {
  const shownOffline = useRef(false)
  const shownRefresh = useRef(false)

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegistered(_reg) {
      // Optional: reg?.update?.()
      // console.info('SW registered', reg)
    },
  })

  useEffect(() => {
    if (offlineReady && !shownOffline.current) {
      shownOffline.current = true
      toast.success('App cached for offline use')
    }
  }, [offlineReady])

  useEffect(() => {
    if (needRefresh && !shownRefresh.current) {
      shownRefresh.current = true
      const id = toast((t) => (
        <div className="flex items-center gap-3">
          <span>New version available</span>
          <button
            type="button"
            className="px-2 py-1 rounded bg-[color:var(--color-primary)] text-white"
            onClick={() => {
              updateServiceWorker(true).then(() => {
                toast.dismiss(t.id)
              })
            }}
          >
            Reload
          </button>
        </div>
      ), { duration: 10000 })

      // Dismiss after some time to avoid sticking
      window.setTimeout(() => toast.dismiss(id), 15000)
    }
  }, [needRefresh, updateServiceWorker])

  return null
}
