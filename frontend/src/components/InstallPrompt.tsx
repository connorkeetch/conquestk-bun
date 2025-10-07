import { useEffect, useMemo, useRef, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorStandalone extends Navigator {
  standalone?: boolean
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as NavigatorStandalone).standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !/android/i.test(navigator.userAgent)
const isSafari = () =>
  /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosVisible, setIosVisible] = useState(false)
  // Track first render to delay iOS coachmark if needed
  const _firstRender = useRef(true)

  const installed = useMemo(() => isStandalone(), [])

  useEffect(() => {
    if (installed) return

    const hide = () => {
      setVisible(false)
      setIosVisible(false)
    }

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBIP as EventListener)
    window.addEventListener('appinstalled', hide)

    // iOS Safari has no BIP: show a coachmark for Add to Home Screen
    if (isIOS() && isSafari()) {
      // Avoid showing immediately on first render to prevent flicker
      const t = window.setTimeout(() => {
        setIosVisible(true)
      }, 1500)
      return () => {
        window.clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBIP as EventListener)
        window.removeEventListener('appinstalled', hide)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP as EventListener)
      window.removeEventListener('appinstalled', hide)
    }
  }, [installed])

  if (installed) return null

  // iOS coachmark
  if (iosVisible && !deferredPrompt) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[92%] sm:w-[420px] rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] shadow-xl p-3 flex items-center gap-3 text-sm">
        <div className="flex-1">
          <div className="font-semibold mb-0.5">Install Conquest K</div>
          <div className="text-muted">Tap Share → "Add to Home Screen"</div>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-[color:var(--color-primary)] text-white"
          onClick={() => setIosVisible(false)}
        >
          Got it
        </button>
      </div>
    )
  }

  // Chrome/Android prompt
  if (visible && deferredPrompt) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[92%] sm:w-[420px] rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] shadow-xl p-3 flex items-center gap-3 text-sm">
        <div className="flex-1">
          <div className="font-semibold mb-0.5">Install Conquest K</div>
          <div className="text-muted">Use the app fullscreen and get faster launch</div>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-[color:var(--color-primary)] text-white"
          onClick={async () => {
            try {
              await deferredPrompt.prompt()
              await deferredPrompt.userChoice
            } finally {
              setDeferredPrompt(null)
              setVisible(false)
            }
          }}
        >
          Install
        </button>
      </div>
    )
  }

  return null
}
