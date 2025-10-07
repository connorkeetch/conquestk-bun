import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'

export default function PWAUpdatePrompt() {
  const shownOffline = useRef(false)
  const shownRefresh = useRef(false)

  // Detect if this navigation was a reload; skip toasts on pure reloads
  const isReload = useMemo(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
      if (nav && 'type' in nav) return nav.type === 'reload'
      // Fallback for older browsers
      // @ts-expect-error legacy
      return (performance.navigation && performance.navigation.type === 1) || false
    } catch {
      return false
    }
  }, [])

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegistered(_reg) {
      // Optional: reg?.update?.()
      // console.info('SW registered', reg)
    },
  })

  useEffect(() => {
    if (offlineReady && !shownOffline.current) {
      const hadSW = localStorage.getItem('pwa:has-sw') === '1'
      const sessionShown = sessionStorage.getItem('pwa:shown-offline') === '1'
      if (isReload || hadSW || sessionShown) return
      shownOffline.current = true
      sessionStorage.setItem('pwa:shown-offline', '1')
      localStorage.setItem('pwa:has-sw', '1')
      toast.success('App cached for offline use')
    }
  }, [offlineReady, isReload])

  useEffect(() => {
    if (needRefresh && !shownRefresh.current) {
      const sessionShown = sessionStorage.getItem('pwa:shown-refresh') === '1'
      if (isReload || sessionShown) return
      shownRefresh.current = true
      sessionStorage.setItem('pwa:shown-refresh', '1')
      const id = toast(
        (t) => (
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
        ),
        { duration: 10000 },
      )

      // Dismiss after some time to avoid sticking
      window.setTimeout(() => toast.dismiss(id), 15000)
    }
  }, [needRefresh, updateServiceWorker, isReload])

  return null
}
