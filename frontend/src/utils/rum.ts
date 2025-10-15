// Minimal RUM: capture LCP and send to backend when page is hidden
// Avoids extra deps (web-vitals) and sends a concise payload.

type LCPEntry = LargestContentfulPaint & { element?: Element | null }

function sendBeacon(path: string, data: unknown): void {
  try {
    const url = path.startsWith('http') ? path : `${location.origin}${path}`
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return
    // Fallback to fetch without blocking unload
    void fetch(url, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' }, keepalive: true })
  } catch {
    // ignore
  }
}

export function startVitalsRUM(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return
  // Only run in production-like builds
  try {
    // @ts-expect-error Vite injects env
    if (!(import.meta?.env?.PROD ?? false)) return
  } catch {
    // best-effort
  }

  let lcp: LCPEntry | null = null
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries() as LCPEntry[]
      for (const entry of entries) {
        lcp = entry
      }
    })
    po.observe({ type: 'largest-contentful-paint', buffered: true as unknown as boolean })

    const finalize = () => {
      if (!lcp) return
      const value = (lcp.renderTime || lcp.loadTime || lcp.startTime) || 0
      // Rudimentary element info without text content
      const tag = lcp.element ? lcp.element.tagName : undefined
      const id = lcp.element && (lcp.element as HTMLElement).id ? (lcp.element as HTMLElement).id : undefined
      const classes = lcp.element && (lcp.element as HTMLElement).className
      const theme = document.documentElement.getAttribute('data-theme') || undefined
      const payload = {
        metric: 'LCP',
        value,
        size: (lcp as { size?: number }).size ?? undefined,
        url: location.pathname,
        tag,
        id,
        classHint: typeof classes === 'string' ? classes.split(' ').slice(0, 3) : undefined,
        theme,
        dpr: Math.round(window.devicePixelRatio * 100) / 100,
        ts: Date.now(),
      }
      sendBeacon('/api/rum/vitals', payload)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finalize()
    }
    window.addEventListener('visibilitychange', onVisibility, { once: true })
    window.addEventListener('pagehide', finalize, { once: true })
  } catch {
    // ignore failures
  }
}

