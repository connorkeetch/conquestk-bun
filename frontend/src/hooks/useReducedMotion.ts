import { useEffect, useState } from 'react'

export default function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    try {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } catch {
      // Fallback for older browsers
      type LegacyMQL = MediaQueryList & {
        addListener?: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => void
        removeListener?: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => void
      }
      const legacy = mq as LegacyMQL
      legacy.addListener?.(onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void)
      return () =>
        legacy.removeListener?.(onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void)
    }
  }, [])

  return reduced
}
