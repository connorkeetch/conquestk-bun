import {
  DEFAULT_THEME_ID,
  isThemeId,
  normalizeThemeId,
  THEME_IDS,
  type ThemeId,
} from '@conquestk/shared/types/themes'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { featureFlagService } from '../services/featureFlagService'
import { loadThemeFonts } from '../styles/loadThemeFonts'

// Theme Configuration - Metadata Only
// CSS in app.css handles all actual styling

export interface ThemeDefinition {
  id: ThemeId
  name: string
  displayColor: string // Color for UI picker/preview
  description: string
  isPremium?: boolean
}

export interface ThemeConfig {
  themes: ThemeDefinition[]
  defaultTheme: string
}

// Theme metadata for UI display
// Actual styling is done via CSS in app.css using [data-theme="id"] selectors
const THEME_METADATA: Record<ThemeId, Omit<ThemeDefinition, 'id'>> = {
  default: {
    name: 'Default',
    displayColor: '#2563EB',
    description: 'Blue theme with purple gradient background',
  },
  dark: {
    name: 'Dark',
    displayColor: '#111827',
    description: 'Neutral dark background',
  },
  light: {
    name: 'Light',
    displayColor: '#93C5FD',
    description: 'Neutral light background',
  },
  'violet-dark': {
    name: 'Violet (Dark)',
    displayColor: '#7C3AED',
    description: 'Violet accents on dark surfaces',
  },
  'violet-light': {
    name: 'Violet (Light)',
    displayColor: '#8B5CF6',
    description: 'Violet accents on light surfaces',
  },
  'blue-dark': {
    name: 'Blue (Dark)',
    displayColor: '#2563EB',
    description: 'Blue accents on dark surfaces',
  },
  'blue-light': {
    name: 'Blue (Light)',
    displayColor: '#3B82F6',
    description: 'Blue accents on light surfaces',
  },
  'red-dark': {
    name: 'Red (Dark)',
    displayColor: '#DC2626',
    description: 'Red accents on dark surfaces',
  },
  'red-light': {
    name: 'Red (Light)',
    displayColor: '#EF4444',
    description: 'Red accents on light surfaces',
  },
  'green-dark': {
    name: 'Green (Dark)',
    displayColor: '#10B981',
    description: 'Green accents on dark surfaces',
  },
  'green-light': {
    name: 'Green (Light)',
    displayColor: '#34D399',
    description: 'Green accents on light surfaces',
  },
  black: {
    name: 'Black',
    displayColor: '#1f2937',
    description: 'Pure black with gray accents',
  },
  highcontrast: {
    name: 'High Contrast',
    displayColor: '#00B4FF',
    description: 'Accessibility-focused high contrast (WCAG AAA)',
  },
  retrospace: {
    name: 'RetroSpace',
    displayColor: '#0F4CDA',
    description: 'Premium early-2000s social profile homage with blue tabs and white panels',
    isPremium: true,
  },
  frontier: {
    name: 'Frontier',
    displayColor: '#C47E35',
    description: 'Premium cowboy fantasy with saddle browns and turquoise accents',
    isPremium: true,
  },
  metal: {
    name: 'Metal Mayhem',
    displayColor: '#FF2D95',
    description: 'Premium heavy metal theme with neon grid energy',
    isPremium: true,
  },
  halloween: {
    name: 'Halloween',
    displayColor: '#FF6B35',
    description: 'Spooky seasonal theme with pumpkin orange and midnight purple',
    isPremium: true,
  },
  'cutlers-cheese': {
    name: "Cutler's Cheese",
    displayColor: '#F5B700',
    description: 'Premium cheddar couture with fondue glows and breadstick accents',
    isPremium: true,
  },
}

const ORDERED_THEME_IDS: ThemeId[] = [
  DEFAULT_THEME_ID,
  ...THEME_IDS.filter((id) => id !== DEFAULT_THEME_ID),
]

export const THEMES: ThemeDefinition[] = ORDERED_THEME_IDS.map((id) => ({
  id,
  ...THEME_METADATA[id],
}))

export const STANDARD_THEMES = THEMES.filter((theme) => !theme.isPremium)
export const PREMIUM_THEMES = THEMES.filter((theme) => theme.isPremium)

// Export configuration
export const THEME_CONFIG: ThemeConfig = {
  themes: THEMES,
  defaultTheme: DEFAULT_THEME_ID,
}

// Helper functions
export function getThemeById(id: string): ThemeDefinition | undefined {
  if (!isThemeId(id)) {
    return undefined
  }

  return THEMES.find((theme) => theme.id === id)
}

const BACKGROUND_MOTION_KEY = 'backgroundMotion'

export function getBackgroundMotionPreference(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const stored = localStorage.getItem(BACKGROUND_MOTION_KEY)
    if (stored === 'off') {
      return false
    }
    if (stored === 'on') {
      return true
    }
  } catch {
    // Ignore storage errors and fall back to default
  }

  // Heuristics: disable motion by default when the user signals bandwidth or motion limits.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false
    }
  } catch {
    // Ignore media query failures (older browsers / SSR hydration)
  }

  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
      mozConnection?: { saveData?: boolean; effectiveType?: string }
      webkitConnection?: { saveData?: boolean; effectiveType?: string }
    }
    const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection
    if (connection?.saveData) {
      return false
    }
    if (typeof connection?.effectiveType === 'string') {
      const type = connection.effectiveType.toLowerCase()
      if (type === '2g' || type === 'slow-2g') {
        return false
      }
    }
  } catch {
    // Ignore navigator.connection access issues (unsupported browser)
  }

  return true
}

export function setBackgroundMotionPreference(enabled: boolean, persist = true): void {
  if (typeof document === 'undefined') {
    return
  }

  document.body.setAttribute('data-background-motion', enabled ? 'on' : 'off')

  if (persist) {
    try {
      localStorage.setItem(BACKGROUND_MOTION_KEY, enabled ? 'on' : 'off')
    } catch {
      // Ignore storage failures (e.g., Safari private mode)
    }
  }
}

export function applyTheme(themeId: string): void {
  if (typeof document === 'undefined') {
    return
  }

  // Pure CSS-based theming - just set the data-theme attribute
  // All styling is handled by CSS rules in app.css
  const normalizedTheme = normalizeThemeId(themeId)
  document.documentElement.setAttribute('data-theme', normalizedTheme)
  setBackgroundMotionPreference(getBackgroundMotionPreference(), false)

  // Non-blocking: lazy-load decorative fonts for this theme
  try {
    const schedule = (fn: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void }
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn)
      else setTimeout(fn, 0)
    }
    schedule(() => {
      void loadThemeFonts(normalizedTheme)
    })
  } catch {
    // ignore font load errors
  }

  // Optional: persist to cookie for first-paint fallback (behind feature flag)
  try {
    if (featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_COOKIE_FALLBACK)) {
      setThemeCookie(normalizedTheme)
      themeDebugLog('applyTheme: wrote cookie', { normalizedTheme })
    }
  } catch {
    // ignore cookie errors
  }

  // Update dynamic overlays for select themes
  try {
    updateDynamicOverlay(normalizedTheme)
  } catch {
    // ignore overlay update errors (non-browser or observer issues)
  }
}

export function getStoredTheme(): ThemeId {
  try {
    const storedTheme = localStorage.getItem('colorTheme')
    const normalized = normalizeThemeId(storedTheme)
    themeDebugLog('getStoredTheme', { storedTheme, normalized })
    return normalized
  } catch {
    themeDebugLog('getStoredTheme: localStorage failed; defaulting', { fallback: DEFAULT_THEME_ID })
    return DEFAULT_THEME_ID
  }
}

export function storeTheme(themeId: string): ThemeId {
  const normalizedTheme = normalizeThemeId(themeId)

  try {
    localStorage.setItem('colorTheme', normalizedTheme)
  } catch (_error) {
    // Silently fail if localStorage is not available
  }

  // Optional cookie persistence for first-paint fallback (behind feature flag)
  try {
    if (
      typeof document !== 'undefined' &&
      featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_COOKIE_FALLBACK)
    ) {
      setThemeCookie(normalizedTheme)
      themeDebugLog('storeTheme: wrote cookie', { normalizedTheme })
    }
  } catch {
    // ignore cookie errors
  }

  return normalizedTheme
}

// --- Internals: cookie + debug helpers ---
function setThemeCookie(themeId: string) {
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const domain = host.endsWith('conquestk.com') ? '; Domain=.conquestk.com' : ''
  const secure = isHttps ? '; Secure' : ''
  const sameSite = '; SameSite=Lax'
  // Short TTL (3 days)
  const expires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toUTCString()
  /* biome-ignore lint/suspicious/noDocumentCookie: Use cookie for first-paint theme fallback */
  document.cookie = `ck_theme=${encodeURIComponent(themeId)}; Expires=${expires}; Path=/${domain}${sameSite}${secure}`
}

function isThemeDebugEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('themeDebug') === '1')
      return true
  } catch {
    // ignore localStorage access in non-browser environments
  }
  try {
    const value = `; ${document.cookie}`
    const parts = value.split('; ck_theme_debug=')
    if (parts.length === 2) {
      const v = parts.pop()?.split(';').shift()
      if (v === '1') return true
    }
  } catch {
    // ignore cookie parsing errors (non-browser)
  }
  // Feature flag can also enable logs globally
  try {
    return featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_DEBUG_LOGS)
  } catch {
    return false
  }
}

function themeDebugLog(message: string, data?: unknown) {
  if (!isThemeDebugEnabled()) return
  try {
    /* biome-ignore lint/suspicious/noConsole: Debug logging gated by isThemeDebugEnabled */
    console.info('[theme]', message, data ?? '')
  } catch {
    // ignore console issues (e.g., non-interactive env)
  }
}

// ================== Dynamic Overlay Generator ==================
let overlayEl: HTMLStyleElement | null = null
let overlayObserverInitialized = false
let overlayResizeListenerInitialized = false

function ensureOverlayEl(): HTMLStyleElement {
  if (overlayEl && document.head.contains(overlayEl)) return overlayEl
  overlayEl = document.createElement('style')
  overlayEl.id = 'dynamic-theme-overlay'
  document.head.appendChild(overlayEl)
  return overlayEl
}

function motionEnabled(): boolean {
  const reduced = window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) return false
  const attr = document.body.getAttribute('data-background-motion')
  return attr !== 'off'
}

function isPremiumTheme(themeId: ThemeId): boolean {
  try {
    const dict = THEME_METADATA as Record<string, { isPremium?: boolean } | undefined>
    const meta = dict[themeId]
    return Boolean(meta?.isPremium)
  } catch {
    return false
  }
}

function updateDynamicOverlay(themeId: ThemeId) {
  const el = ensureOverlayEl()
  if (themeId === 'halloween') {
    const css = generateHalloweenOverlayCSS(motionEnabled())
    el.textContent = css
    themeDebugLog('overlay: halloween applied')
  } else if (themeId === 'metal') {
    const css = generateMetalOverlayCSS(motionEnabled())
    el.textContent = css
    themeDebugLog('overlay: metal applied')
  } else if (themeId === 'cutlers-cheese') {
    const css = generateCheeseOverlayCSS(motionEnabled())
    el.textContent = css
    themeDebugLog('overlay: cheese applied')
  } else if (isPremiumTheme(themeId)) {
    // Generic premium handler: if SVG shapes are provided at runtime
    const css = generateGenericSVGOverlayCSS(themeId, motionEnabled())
    el.textContent = css
    if (css) themeDebugLog('overlay: generic premium applied', { themeId })
  } else {
    // Clear overlays for other themes (let static CSS drive them)
    el.textContent = ''
  }

  if (!overlayObserverInitialized) {
    overlayObserverInitialized = true
    // Watch theme and background-motion attribute changes
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
      if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const motionObserver = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
      if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
    })
    motionObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-background-motion'],
    })

    // Respect OS reduced-motion changes
    try {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      mql.addEventListener('change', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
        if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
      })
    } catch {
      // ignore media query listener setup failures
    }
  }

  // Recompute overlays on window resize so density/placement rescale on narrow viewports
  if (!overlayResizeListenerInitialized) {
    overlayResizeListenerInitialized = true
    try {
      let resizeTimer: number | undefined
      const onResize = () => {
        // debounce to avoid excessive recalculation while resizing
        if (resizeTimer) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
          if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
        }, 120)
      }
      window.addEventListener('resize', onResize)
    } catch {
      // ignore if window is not available
    }
  }
}

// ===== Helper: non-overlapping background image layout =====
type Rect = { x: number; y: number; w: number; h: number }

function rectsOverlap(a: Rect, b: Rect, buffer: number): boolean {
  return !(
    a.x + a.w + buffer <= b.x ||
    b.x + b.w + buffer <= a.x ||
    a.y + a.h + buffer <= b.y ||
    b.y + b.h + buffer <= a.y
  )
}

function layoutNonOverlapping(
  pickImage: () => string,
  count: number,
  sizeRange: [number, number],
  aspectRange: [number, number],
  buffer: number,
  maxTries = 40,
) {
  const images: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  const repeats: string[] = []

  const vw = Math.max(320, Math.floor(window?.innerWidth ?? 1280))
  const vh = Math.max(320, Math.floor(window?.innerHeight ?? 800))

  const placed: Rect[] = []

  for (let i = 0; i < count; i++) {
    const img = pickImage()
    // Choose size
    const base = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0])
    let w = Math.round(base)
    let h = Math.round(base * (aspectRange[0] + Math.random() * (aspectRange[1] - aspectRange[0])))

    let placedOk = false
    let attempt = 0
    let x = 0
    let y = 0
    while (attempt < maxTries && !placedOk) {
      // Random top-left ensuring it fits viewport
      x = Math.max(0, Math.round(Math.random() * Math.max(1, vw - w)))
      y = Math.max(0, Math.round(Math.random() * Math.max(1, vh - h)))
      const rect: Rect = { x, y, w, h }
      placedOk = !placed.some((r) => rectsOverlap(r, rect, buffer))
      if (!placedOk) {
        // On later attempts, slightly shrink to help packing
        if (attempt > maxTries * 0.6) {
          w = Math.max(32, Math.round(w * 0.9))
          h = Math.max(32, Math.round(h * 0.9))
        }
      }
      attempt++
    }
    // If we failed to place without overlap, skip this element to avoid collisions on small/narrow viewports
    if (!placedOk) {
      continue
    }
    const rect: Rect = { x, y, w, h }
    placed.push(rect)

    images.push(img)
    sizes.push(`${rect.w}px ${rect.h}px`)
    positions.push(`${((rect.x / vw) * 100).toFixed(2)}% ${((rect.y / vh) * 100).toFixed(2)}%`)
    repeats.push('no-repeat')
  }

  return { images, sizes, positions, repeats }
}

function generateHalloweenOverlayCSS(withMotion: boolean): string {
  // Responsive scaling based on viewport area (helps narrow screens)
  const vw = Math.max(320, Math.floor(window?.innerWidth ?? 1280))
  const vh = Math.max(320, Math.floor(window?.innerHeight ?? 800))
  const area = (vw * vh) / (1280 * 800)
  const sizeScale = Math.min(1, Math.max(0.7, vw / 1280))
  // SVG tiles (data URIs)
  const pumpkins = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%23FF7A1A' d='M20 24c-6 0-10 7-10 14s4 14 10 14c4 0 6-2 12-2s8 2 12 2c6 0 10-7 10-14s-4-14-10-14c-4 0-6 2-12 2s-8-2-12-2z'/%3E%3Cpath fill='%238A4B0A' d='M30 14h4v8h-4z'/%3E%3Cpath fill='%23FF9248' d='M24 24c-3 2-5 6-5 13s2 13 5 15c4 0 7-2 11-2s7 2 11 2c3-2 5-8 5-15s-2-11-5-13c-4 0-7 2-11 2s-7-2-11-2z' opacity='.55'/%3E%3C/svg%3E")`
  const tombstone = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 484.853 484.853'%3E%3Cg%3E%3Cpath fill='%23B0A8A1' d='M102.984,196.089c-6.084,0-9.539,0.49-11.334,0.819v30.55h9.858c12.465,0,19.865-6.242,19.865-15.929 C121.374,201.344,114.479,196.249,102.984,196.089z'/%3E%3Cpath fill='%23B0A8A1' d='M246.282,196.418c-5.077,0-8.539,0.49-10.338,0.977v32.696c2.131,0.49,4.753,0.66,8.377,0.66 c13.308,0,21.508-6.742,21.508-18.074C265.829,202.494,258.768,196.418,246.282,196.418z'/%3E%3Cpath fill='%238A4B0A' d='M306.117,1.029c-30.336,0-58.905,7.615-83.93,20.961c95.901,20.104,168.158,105.299,168.158,207.082 v254.753l94.508-65.743V179.764C484.853,81.055,404.821,1.029,306.117,1.029z'/%3E%3Cpath fill='%23B0A8A1' d='M178.742,50.334C80.032,50.334,0,130.362,0,229.072v254.753h357.477V229.072 C357.477,130.362,277.447,50.334,178.742,50.334z M141.408,257.85c1.508,5.432,3.015,11.234,4.395,16.412 c0.951,3.522,0.21,7.295-2.001,10.191c-2.233,2.897-5.67,4.605-9.328,4.605h-1.029c-5.504,0-10.354-3.618-11.927-8.906 c-1.28-4.358-2.775-10.042-4.409-16.887c-2.953-13.795-7.742-17.574-17.914-17.734H91.65v31.131 c0,6.845-5.555,12.396-12.404,12.396c-6.855,0-12.411-5.552-12.411-12.396v-85.857c0-6.418,4.896-11.787,11.299-12.349 c6.484-0.569,14.031-0.931,22.054-0.931c16.42,0,27.932,2.464,35.796,8.706c6.579,5.255,10.19,12.979,10.19,23.16 c0,14.125-10.014,23.82-19.532,27.263v0.498C134.344,240.276,138.617,247.666,141.408,257.85z M189.43,276.493 c0,6.943-5.635,12.566-12.566,12.566c-6.938,0-12.566-5.623-12.566-12.566V190.91c0-6.939,5.628-12.565,12.566-12.565 c6.932,0,12.566,5.626,12.566,12.565V276.493z M280.451,238.3c-8.552,8.051-21.2,11.662-35.966,11.662 c-3.294,0-6.265-0.16-8.541-0.49v27.191c0,6.845-5.553,12.396-12.409,12.396c-6.855,0-12.41-5.552-12.41-12.396V190.76 c0-6.422,4.902-11.79,11.307-12.35c6.163-0.548,13.588-0.884,22.529-0.884c15.445,0,26.454,2.953,33.835,8.866 c7.065,5.586,11.845,14.785,11.845,25.627C290.641,222.862,287.018,232.057,280.451,238.3z'/%3E%3C/g%3E%3C/svg%3E")`
  const bat = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 494.135 494.135'%3E%3Cpath fill='%232C1B47' d='M492.994 175.631c-19.072-39.3-92.593-42.967-164.196-8.191-18.276 8.865-34.64 19.378-48.588 30.764-.35.298-.77.499-1.141.777-1.406-7.294-4.277-13.852-8.264-19.09l8.345-6.275c3.618-2.725 4.357-7.865 1.637-11.483-2.69-3.62-7.85-4.331-11.467-1.633l-11.836 8.887c-3.297-1.395-6.758-2.328-10.426-2.328-3.649 0-7.11.934-10.408 2.328l-11.823-8.887c-3.618-2.714-8.771-1.987-11.5 1.633-2.701 3.618-1.98 8.758 1.637 11.483l8.358 6.275c-3.969 5.229-6.853 11.787-8.264 19.085-.382-.289-.796-.498-1.184-.803-13.931-11.379-30.282-21.877-48.525-30.732-71.616-34.776-145.126-31.109-164.216 8.191a11.35 11.35 0 0 0 .658 11.059 11.33 11.33 0 0 0 9.787 5.213 53.7 53.7 0 0 1 24.726 5.398c19.392 9.417 30.589 28.73 30.684 48.908 0 3.555 1.699 6.896 4.533 9.025a11.33 11.33 0 0 0 9.942 1.818c12.446-3.596 26.188-2.817 38.79 3.298 15.855 7.706 26.293 22.047 29.661 38.062a11.28 11.28 0 0 0 5.297 7.42 11.33 11.33 0 0 0 9.053 1.115c10.057-3.028 21.173-2.482 31.373 2.464 9.655 4.677 41.14 41.144 51.422 41.144 10.3 0 41.797-36.467 51.44-41.144 10.2-4.946 21.329-5.492 31.372-2.464 3.041.918 6.327.502 9.048-1.115a11.3 11.3 0 0 0 5.316-7.42c3.367-16.015 13.793-30.356 29.66-38.062 12.589-6.115 26.332-6.894 38.79-3.298 3.41.985 7.096.314 9.931-1.818a11.33 11.33 0 0 0 4.545-9.025c.101-20.178 11.279-39.491 30.683-48.908a53.65 53.65 0 0 1 24.732-5.398c3.937.082 7.656-1.89 9.768-5.213 2.142-3.323 2.368-7.511.65-11.06'/%3E%3C/svg%3E")`
  const ghost = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath fill='%23F7ECF1' d='M12.935 5.666c-.084-.237-.253-.442-.35-.675a16 16 0 0 1-.46-1.232c-.116-.363-.154-.754-.3-1.102-.21-.501-.667-.567-1.035-.163-.185.204-.309.463-.458.7-.17.267-.308.562-.512.8-.326.38-.702.292-.876-.176-.044-.118-.06-.247-.087-.372-.11-.496-.179-1.007-.34-1.486-.254-.75-.808-1.094-1.413-.913-.468.14-.92.33-1.433.516.058.112.134.236.188.369a.9.9 0 0 1 .07.312c-.002.375-.001.753-.035 1.126-.023.25-.02.603-.174.719-.254.192-.44-.136-.605-.31-.184-.192-.334-.417-.502-.624-.113-.138-.22-.284-.35-.403-.726-.665-1.503-.47-1.886.475-.415 1.02-.566 2.143-1.281 3.047-.245.309.065.723.488.71.203-.006.406-.066.607-.056.102.005.28.103.285.17.064.745.615.968 1.2 1.166.551.186 1.123.342 1.454.95.424-.893.288-1.773.245-2.648.221.626.254 1.267.13 1.902-.074.38-.16.816-.399 1.09-.364.42-.408.832-.347 1.34.06.51.03 1.032.054 1.548.008.161.017.403.113.46.147.089.442.135.548.047a4.5 4.5 0 0 0 .873-.932c.34-.508.778-.789 1.378-.839l.457-.037c.865-.073 1.265-.39 1.387-1.237.136-.943.196-1.897.292-2.846.043-.43.075-.862.145-1.287.065-.393.22-.584.475-.684-.83 1.297-.257 2.793-.672 4.148l.125.045c.104-.068.203-.149.315-.198a1.6 1.6 0 0 1 .367-.101c.595-.108.656-.167.618-.773-.017-.283.058-.471.34-.554.353-.102.495-.357.446-.7-.059-.406.043-.608.502-.63.423-.019.556-.261.413-.662'/%3E%3C/svg%3E")`

  // Build randomized layers
  const shapes = [pumpkins, tombstone, bat, ghost]
  const weights = [3, 2, 3, 2] // fewer pumpkins than before

  const pick = (): string => {
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < shapes.length; i++) {
      r -= weights[i]
      if (r < 0) return shapes[i]
    }
    return shapes[0]
  }

  // Density scales with viewport area; clamp to keep sane on mobile
  const baseCount = 18
  const count = Math.round(baseCount * Math.min(1.8, Math.max(0.6, area)))
  const { images, sizes, positions, repeats } = layoutNonOverlapping(
    pick,
    count,
    [Math.round(60 * sizeScale), Math.round(200 * sizeScale)],
    [0.9, 1.2],
    18,
  )

  // Add soft glow gradients at the end
  const gradients = [
    'radial-gradient(3px 3px at 10% 20%, rgba(255, 107, 53, 0.4), transparent)',
    'radial-gradient(2px 2px at 80% 60%, rgba(139, 21, 56, 0.3), transparent)',
    'radial-gradient(1px 1px at 30% 70%, rgba(255, 215, 0, 0.3), transparent)',
  ]

  images.push(...gradients)
  sizes.push('300px 300px', '220px 220px', '220px 220px')
  positions.push('10% 20%', '80% 60%', '30% 70%')
  repeats.push('no-repeat', 'no-repeat', 'no-repeat')

  const imageList = images.join(',\n    ')
  const sizeList = sizes.join(',\n    ')
  const posList = positions.join(',\n    ')
  const repeatList = repeats.join(',\n    ')

  const motionCss = withMotion
    ? `animation: halloween-scroll 60s linear infinite; will-change: transform;`
    : `animation: none;`

  return `
/* dynamic halloween overlay */
[data-theme="halloween"] body::after { 
  background-image:
    ${imageList};
  background-size:
    ${sizeList};
  background-position:
    ${posList};
  background-repeat:
    ${repeatList};
  ${motionCss}
}

@keyframes halloween-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(480px); }
}
`
}

function generateCheeseOverlayCSS(withMotion: boolean): string {
  // Responsive scaling based on viewport area (helps narrow screens)
  const vw = Math.max(320, Math.floor(window?.innerWidth ?? 1280))
  const vh = Math.max(320, Math.floor(window?.innerHeight ?? 800))
  const area = (vw * vh) / (1280 * 800)
  const sizeScale = Math.min(1, Math.max(0.7, vw / 1280))
  // Updated wedge (rich detail)
  const wedge = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%23e0a03d' d='M216.459 41.099C85.671 52.629 7.604 142.674 7.604 142.674v328.342h496.792V142.674z'/%3E%3Ccircle fill='%23f6e088' cx='251.407' cy='152.809' r='55.935'/%3E%3Cpath fill='%23f6e088' d='M7.604 379.638v91.377h91.377c0-50.465-40.911-91.377-91.377-91.377m430.891-113.442c0 36.396 29.505 65.901 65.901 65.901V200.295c-36.396 0-65.901 29.505-65.901 65.901'/%3E%3Ccircle fill='%23f6e088' cx='135.35' cy='288.504' r='38.527'/%3E%3Cpath fill='%23f6e088' d='M320.887 335.14c-48.488 0-87.795 39.307-87.795 87.795 0 17.752 5.273 34.268 14.332 48.081H394.35c9.059-13.812 14.332-30.33 14.332-48.081 0-48.489-39.307-87.795-87.795-87.795'/%3E%3Cpath fill='%23491e17' d='m217.434 33.38-1.642.145C146.629 39.622 92.224 67.54 58.762 89.887c-36.298 24.242-56.08 46.855-56.904 47.806L0 139.837V478.62h512V137.292zM15.208 463.412v-75.828c40.139 3.629 72.199 35.689 75.828 75.828zm236.444 0c-7.179-12.25-10.956-26.16-10.956-40.477 0-44.218 35.973-80.191 80.191-80.191s80.191 35.974 80.191 80.191c0 14.318-3.777 28.227-10.956 40.477zm155.632 0c5.914-12.6 9.002-26.373 9.002-40.477 0-52.603-42.796-95.399-95.399-95.399s-95.399 42.796-95.399 95.399c0 14.105 3.088 27.877 9.002 40.477H106.296c-3.704-48.529-42.559-87.384-91.088-91.088V150.278h83.644V135.07H25.885c9.208-8.57 23.31-20.545 41.757-32.825 31.643-21.063 82.885-47.335 147.852-53.422l244.49 86.247H312.401c-7.699-26.423-32.12-45.791-60.995-45.791s-53.296 19.369-60.995 45.791H119.13v15.208h68.806a65 65 0 0 0-.065 2.536c0 35.033 28.502 63.535 63.535 63.535s63.535-28.502 63.535-63.535c0-.85-.03-1.693-.065-2.536h181.916v42.807c-36.971 3.817-65.901 35.149-65.901 73.112s28.93 69.295 65.901 73.112v124.104zm-107.551-310.6c0 26.647-21.679 48.327-48.327 48.327s-48.327-21.679-48.327-48.327 21.679-48.327 48.327-48.327c26.648.001 48.327 21.68 48.327 48.327M496.792 324c-28.567-3.737-50.693-28.235-50.693-57.803 0-29.569 22.127-54.067 50.693-57.803z'/%3E%3Cpath fill='%23491e17' d='M320.887 297.12v15.208c60.989 0 110.607 49.617 110.607 110.607h15.208c0-69.375-56.44-125.815-125.815-125.815M135.35 242.371c-25.437 0-46.131 20.694-46.131 46.131s20.694 46.131 46.131 46.131 46.131-20.694 46.131-46.131-20.694-46.131-46.131-46.131m0 77.053c-17.051 0-30.923-13.872-30.923-30.923s13.872-30.923 30.923-30.923 30.923 13.872 30.923 30.923-13.871 30.923-30.923 30.923'/%3E%3C/svg%3E")`
  // Cheese wheel (stylized fill)
  const wheel = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 47.301 47.301'%3E%3Cpath fill='%23F5B700' d='M40.429 21.948c6.817-7.027 4.138-14.586-5.985-16.88-10.124-2.296-23.86 1.542-30.679 8.57-5.643 5.815-4.764 11.985 1.44 15.244.419.221.927.188 1.313-.086l15.578-11.002 1.497 11.182a1.263 1.263 0 0 0 1.553 1.056c6-1.483 11.632-4.324 15.283-8.084'/%3E%3Cpath fill='%23F5B700' d='M47.209 25.615c-.016-.114-.957-3.97-1.816-7.486-.716 1.77-1.999 3.438-3.53 5.21-5.061 5.854-13.696 8.14-16.783 8.795a1.26 1.26 0 0 0-.988 1.391l1.059 8.272a1.26 1.26 0 0 0 1.457 1.084 45 45 0 0 0 2.473-.478c2.824-.638 19.608-6.549 18.128-16.788m-26.51-3.214a.655.655 0 0 0-1.027-.449c-.128.888-.668 1.554-1.316 1.554a1 1 0 0 1-.597-.205L6.822 31.026c-.172.711-.665 1.294-1.174 1.46l-.243-1.291-.335-.155a16 16 0 0 1-1.956-1.067.698.698 0 0 0-1.056.755l1.236 5.024a9.25 9.25 0 0 0 3.167 4.63 1.26 1.26 0 0 0 1.508.043l3.75-2.644c-.003-.044-.01-.087-.01-.133 0-.803.446-1.453.997-1.453.267 0 .509.155.688.405l8.024-5.655c-.253-.357-.412-.855-.412-1.409 0-.582.174-1.104.45-1.463zM6.74 37.918l-.071.008-.501-2.673c.174-.128.411-.241.572-.241.551 0 .998.649.998 1.452 0 .804-.446 1.454-.998 1.454m3.626-4.423c-.742 0-1.344-.877-1.344-1.959s.602-1.958 1.344-1.958 1.344.876 1.344 1.958c-.001 1.081-.603 1.959-1.344 1.959m3.994.767c-.276 0-.5-.326-.5-.729s.224-.729.5-.729c.277 0 .501.326.501.729s-.224.729-.501.729m1-4.994c-.277 0-.5-.326-.5-.729 0-.401.223-.729.5-.729.276 0 .5.327.5.729-.001.403-.224.729-.5.729m2.995.725c-.55 0-.997-.65-.997-1.454 0-.802.447-1.453.997-1.453.551 0 .998.651.998 1.453 0 .803-.446 1.454-.998 1.454'/%3E%3C/svg%3E")`

  const shapes = [wedge, wheel]
  const weights = [3, 2]

  const pick = (): string => {
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < shapes.length; i++) {
      r -= weights[i]
      if (r < 0) return shapes[i]
    }
    return shapes[0]
  }

  // Density scales with viewport area; clamp for mobile friendliness
  const baseCount = 16
  const count = Math.round(baseCount * Math.min(1.8, Math.max(0.6, area)))
  const { images, sizes, positions, repeats } = layoutNonOverlapping(
    pick,
    count,
    [Math.round(70 * sizeScale), Math.round(220 * sizeScale)],
    [0.8, 1.2],
    20,
  )

  // Subtle background holes as repeating tile
  const holes = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='6' cy='6' r='2.5' fill='%23FFD97A'/%3E%3Ccircle cx='18' cy='8' r='2' fill='%23FFE18D'/%3E%3Ccircle cx='10' cy='18' r='1.8' fill='%23F5C33B'/%3E%3C/svg%3E")`
  images.push(holes)
  sizes.push('44px 44px')
  positions.push('0 0')
  repeats.push('repeat')

  const imageList = images.join(',\n    ')
  const sizeList = sizes.join(',\n    ')
  const posList = positions.join(',\n    ')
  const repeatList = repeats.join(',\n    ')

  const motionCss = withMotion
    ? `animation: cheese-scroll 90s linear infinite; will-change: transform;`
    : `animation: none;`

  return `
/* dynamic cheese overlay */
[data-theme="cutlers-cheese"] body::after {
  background-image:
    ${imageList};
  background-size:
    ${sizeList};
  background-position:
    ${posList};
  background-repeat:
    ${repeatList};
  ${motionCss}
}

@keyframes cheese-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(420px); }
}
`
}

// Dynamic Metal overlay: randomized SVG stamps with subtle motion
function generateMetalOverlayCSS(withMotion: boolean): string {
  // Mirror Halloween approach: disable runtime injection to avoid drift
  const provided: string[] | undefined = undefined

  const toDataUrl = (raw: string): string => `url("data:image/svg+xml,${encodeURIComponent(raw)}")`

  // Built-in metal shapes: prefer your provided SVGs; otherwise use curated set.
  // Use neon/contrast colors for visible stamps.
  const guitar = toDataUrl(
    "<svg fill='%23FF2D95' version='1.1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 481.677 481.678' xml:space='preserve'><g><g><path d='M44.812,438.499c72.248,66.792,155.854,33.166,155.854,33.166S178.86,334.45,304.26,337.176 c0,0-7.273-24.534,19.998-58.168l-4.096-4.092c0,0-33.166,34.083-65.434,28.181c-21.78-3.987-16.417-23.492-10.782-36.447 l129.61-131.652c12.828-11.071,29.37-13.395,38.992-5.176c-0.673-13.187,5.414-28.427,17.524-40.541 c12.712-12.706,28.842-18.751,42.467-17.34l9.137-9.135l-1.378-27.966l-2.886-2.879c-1.026,3.078-2.545,6.233-4.652,9.279 c-7.39,10.654-18.507,15.733-24.83,11.343c-3.903-2.711-5.054-8.383-3.643-14.829c-6.448,1.406-12.119,0.26-14.836-3.643 c-4.384-6.328,0.697-17.444,11.349-24.832c3.042-2.112,6.2-3.625,9.273-4.652l-1.683-1.691l-28.253-1.386l-10.547,10.549 c0.204,12.868-5.843,27.475-17.549,39.174c-11.71,11.696-26.305,17.751-39.177,17.545l-0.705,0.705 c7.942,9.989,5.121,26.904-6.633,39.653L220.113,236.549c-6.344,3.228-13.337,5.642-18.542,4.292 c-12.269-3.178-40.892-4.544,34.534-107.229l-4.089-4.089c0,0-46.805,36.802-75.426,37.257c0,0,11.356,125.862-147.219,117.229 C9.378,284.009-27.432,371.712,44.812,438.499z'/></g></g></svg>",
  )
  const horns = toDataUrl(
    "<svg fill='%237B87FF' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><g><g><path d='M384,0c-35.29,0-64,28.71-64,64v25.003c-6.677-2.368-13.855-3.669-21.333-3.669c-16.38,0-31.334,6.192-42.667,16.348 c-11.332-10.156-26.287-16.348-42.667-16.348c-7.478,0-14.656,1.301-21.333,3.669V64c0-35.29-28.71-64-64-64 C92.71,0,64,28.71,64,64v170.667V320c0,105.87,86.13,192,192,192s192-86.13,192-192V64C448,28.71,419.29,0,384,0z M298.666,128 c11.763,0,21.334,9.57,21.334,21.333v67.669c-6.677-2.368-13.855-3.669-21.333-3.669h-21.333v-64h-0.001 C277.333,137.57,286.903,128,298.666,128z M192,149.333C192,137.57,201.57,128,213.333,128s21.333,9.57,21.333,21.333v64H192 V149.333z M106.666,64L106.666,64c0.001-11.763,9.571-21.333,21.334-21.333s21.333,9.57,21.333,21.333v85.333v64h-42.667V64z M405.333,320c0,82.342-66.991,149.333-149.333,149.333S106.667,402.342,106.667,320v-64h64H256h42.667 C310.43,256,320,265.57,320,277.333s-9.57,21.333-21.333,21.333h-128c-11.782,0-21.333,9.552-21.333,21.333 s9.552,21.333,21.333,21.333h128c35.29,0,64-28.709,64-64v-42.667v-85.333V64c0-11.763,9.57-21.333,21.333-21.333 s21.333,9.57,21.333,21.333V320z'/></g></g></svg>",
  )
  // Simple stylized skull (light fill + dark eyes/mouth)
  const skull = toDataUrl(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><g fill='none' stroke-linecap='round' stroke-linejoin='round'><path fill='%23EDECF8' d='M32 6c12 0 22 9 22 20 0 7-4 11-7 13v5c0 2-1 3-3 3h-3v3c0 2-1 3-3 3h-6c-2 0-3-1-3-3v-3h-3c-2 0-3-1-3-3v-5c-3-2-7-6-7-13 0-11 10-20 22-20z'/><circle cx='24' cy='30' r='4' fill='%23000'/><circle cx='40' cy='30' r='4' fill='%23000'/><path stroke='%23A8A5C5' stroke-width='2' d='M26 42h12'/><path stroke='%23A8A5C5' stroke-width='2' d='M24 47h16'/></g></svg>",
  )
  // Default shapes set (no guitar pick to avoid "map marker" appearance)
  const providedList: string[] = Array.isArray(provided) ? provided : []
  const shapes = providedList.length > 0 ? providedList.map(toDataUrl) : [guitar, horns, skull]
  // Equal weighting across default shapes; provided shapes are also equal weight
  const weights = new Array(shapes.length).fill(1)

  const choose = (): string => {
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < shapes.length; i++) {
      r -= weights[i]
      if (r < 0) return shapes[i]
    }
    return shapes[0]
  }

  // Density scales with viewport area; clamp for mobile friendliness
  const vw = Math.max(320, Math.floor(window?.innerWidth ?? 1280))
  const vh = Math.max(320, Math.floor(window?.innerHeight ?? 800))
  const area = (vw * vh) / (1280 * 800)
  const sizeScale = Math.min(1, Math.max(0.7, vw / 1280))
  const baseCount = 20
  const count = Math.round(baseCount * Math.min(1.8, Math.max(0.6, area)))
  const { images, sizes, positions, repeats } = layoutNonOverlapping(
    choose,
    count,
    [Math.round(80 * sizeScale), Math.round(220 * sizeScale)],
    [0.8, 1.3],
    22,
  )

  // Ensure at least one skull is present when using built-in shapes
  // (helps verify visibility without relying on randomness)
  if (providedList.length === 0) {
    const hasSkull = images.includes(skull)
    if (!hasSkull && images.length > 0) {
      // Replace a random existing shape layer with the skull while keeping its size/position
      const idx = Math.floor(Math.random() * images.length)
      images[idx] = skull
    }
  }

  // A few soft glows for depth
  const glows = [
    'radial-gradient(220px 180px at 20% 30%, rgba(255, 53, 94, 0.18), transparent)',
    'radial-gradient(280px 200px at 78% 24%, rgba(123, 135, 255, 0.14), transparent)',
    'radial-gradient(180px 160px at 48% 72%, rgba(159, 252, 255, 0.12), transparent)',
  ]
  images.push(...glows)
  sizes.push('auto', 'auto', 'auto')
  positions.push('20% 30%', '78% 24%', '48% 72%')
  repeats.push('no-repeat', 'no-repeat', 'no-repeat')

  const imageList = images.join(',\n    ')
  const sizeList = sizes.join(',\n    ')
  const posList = positions.join(',\n    ')
  const repeatList = repeats.join(',\n    ')

  const motionCss = withMotion
    ? `animation: metal-scroll 72s linear infinite; will-change: transform;`
    : `animation: none;`

  return `
/* dynamic metal overlay */
[data-theme="metal"] body::after {
  background-image:
    ${imageList};
  background-size:
    ${sizeList};
  background-position:
    ${posList};
  background-repeat:
    ${repeatList};
  opacity: 0.9;
  ${motionCss}
}

`
}

// Generic SVG overlay for any premium theme that provides shapes via
//   window.__THEME_SVGS__ = { [themeId: string]: string[] }
function generateGenericSVGOverlayCSS(themeId: ThemeId, withMotion: boolean): string {
  let shapes: string[] | undefined
  try {
    const ww = window as unknown as { __THEME_SVGS__?: Record<string, string[]> }
    shapes = ww.__THEME_SVGS__?.[themeId]
  } catch {
    shapes = undefined
  }

  if (!shapes || shapes.length === 0) return ''

  const toDataUrl = (raw: string): string => `url("data:image/svg+xml,${encodeURIComponent(raw)}")`
  const urls = shapes.map(toDataUrl)
  const weights = new Array(urls.length).fill(1)
  const pick = (): string => {
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < urls.length; i++) {
      r -= weights[i]
      if (r < 0) return urls[i]
    }
    return urls[0]
  }

  // Density and size scale with viewport area/width
  const vw = Math.max(320, Math.floor(window?.innerWidth ?? 1280))
  const vh = Math.max(320, Math.floor(window?.innerHeight ?? 800))
  const area = (vw * vh) / (1280 * 800)
  const sizeScale = Math.min(1, Math.max(0.7, vw / 1280))
  const baseCount = 18
  const count = Math.round(baseCount * Math.min(2.2, Math.max(0.8, area)))

  const { images, sizes, positions, repeats } = layoutNonOverlapping(
    pick,
    count,
    [Math.round(70 * sizeScale), Math.round(220 * sizeScale)],
    [0.8, 1.25],
    20,
  )

  const imageList = images.join(',\n    ')
  const sizeList = sizes.join(',\n    ')
  const posList = positions.join(',\n    ')
  const repeatList = repeats.join(',\n    ')

  const motionCss = withMotion
    ? `animation: svg-scroll-${themeId} 80s linear infinite; will-change: transform;`
    : `animation: none;`

  return `
/* dynamic generic overlay: ${themeId} */
[data-theme="${themeId}"] body::after {
  background-image:
    ${imageList};
  background-size:
    ${sizeList};
  background-position:
    ${posList};
  background-repeat:
    ${repeatList};
  opacity: 0.9;
  ${motionCss}
}

@keyframes svg-scroll-${themeId} {
  0% { transform: translateY(0); }
  100% { transform: translateY(520px); }
}
`
}
