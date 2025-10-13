import { useCallback, useEffect, useMemo, useState } from 'react'

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

  // Persistence keys for reminders
  const DONT_ASK_KEY = 'pwa:install:dont-ask'
  const SNOOZE_KEY = 'pwa:install:snooze-until'
  const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  const shouldSuppress = useCallback(() => {
    try {
      if (localStorage.getItem(DONT_ASK_KEY) === '1') return true
      const snooze = Number(localStorage.getItem(SNOOZE_KEY) || 0)
      if (Number.isFinite(snooze) && snooze > Date.now()) return true
    } catch {
      // ignore storage errors (private mode / disabled storage)
    }
    return false
  }, [])

  const remindLater = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
    } catch {
      // ignore storage errors
    }
    setVisible(false)
    setIosVisible(false)
    setDeferredPrompt(null)
  }

  const dontAskAgain = () => {
    try {
      localStorage.setItem(DONT_ASK_KEY, '1')
    } catch {
      // ignore storage errors
    }
    setVisible(false)
    setIosVisible(false)
    setDeferredPrompt(null)
  }

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
      if (!shouldSuppress()) setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBIP as EventListener)
    window.addEventListener('appinstalled', hide)

    // iOS Safari has no BIP: show a coachmark for Add to Home Screen
    if (isIOS() && isSafari()) {
      // Avoid showing immediately on first render to prevent flicker
      const t = window.setTimeout(() => {
        if (!shouldSuppress()) setIosVisible(true)
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
  }, [installed, shouldSuppress])

  if (installed) return null

  // iOS coachmark
  if (iosVisible && !deferredPrompt) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[92%] sm:w-[420px] rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] shadow-xl p-3 flex flex-col gap-3 sm:flex-row sm:items-center text-sm">
        <div className="flex-1">
          <div className="font-semibold mb-0.5">Install Conquest K</div>
          <div className="text-muted">Tap Share → "Add to Home Screen"</div>
        </div>
        <div className="flex items-stretch gap-2 sm:items-center sm:ml-auto">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)]"
            onClick={remindLater}
          >
            Remind me later
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-[color:var(--color-primary)] text-white"
            onClick={() => setIosVisible(false)}
          >
            Okay
          </button>
        </div>
        <div className="flex sm:block">
          <button
            type="button"
            className="text-xs text-muted hover:text-[color:var(--text)] sm:ml-2 text-left"
            onClick={dontAskAgain}
          >
            Don’t ask again
          </button>
        </div>
      </div>
    )
  }

  // Chrome/Android prompt
  if (visible && deferredPrompt) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[92%] sm:w-[420px] rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] shadow-xl p-3 flex flex-col gap-3 sm:flex-row sm:items-center text-sm">
        <div className="flex-1">
          <div className="font-semibold mb-0.5">Install Conquest K</div>
          <div className="text-muted">Use the app fullscreen and get faster launch</div>
        </div>
        <div className="flex items-stretch gap-2 sm:items-center sm:ml-auto">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)]"
            onClick={remindLater}
          >
            Remind me later
          </button>
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
        <div className="flex sm:block">
          <button
            type="button"
            className="text-xs text-muted hover:text-[color:var(--text)] sm:ml-2 text-left"
            onClick={dontAskAgain}
          >
            Don’t ask again
          </button>
        </div>
      </div>
    )
  }

  return null
}
