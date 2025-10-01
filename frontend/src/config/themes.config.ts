import {
  DEFAULT_THEME_ID,
  isThemeId,
  normalizeThemeId,
  THEME_IDS,
  type ThemeId,
} from '@shared/types/themes'
import { featureFlagService } from '../services/featureFlagService'
import { FEATURE_FLAGS } from '../constants/featureFlags'

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
  } catch {}
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
  document.cookie = `ck_theme=${encodeURIComponent(themeId)}; Expires=${expires}; Path=/${domain}${sameSite}${secure}`
}

function isThemeDebugEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('themeDebug') === '1') return true
  } catch {}
  try {
    const value = `; ${document.cookie}`
    const parts = value.split('; ck_theme_debug=')
    if (parts.length === 2) {
      const v = parts.pop()?.split(';').shift()
      if (v === '1') return true
    }
  } catch {}
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
    console.info('[theme]', message, data ?? '')
  } catch {}
}

// ================== Dynamic Overlay Generator ==================
let overlayEl: HTMLStyleElement | null = null
let overlayObserverInitialized = false

function ensureOverlayEl(): HTMLStyleElement {
  if (overlayEl && document.head.contains(overlayEl)) return overlayEl
  overlayEl = document.createElement('style')
  overlayEl.id = 'dynamic-theme-overlay'
  document.head.appendChild(overlayEl)
  return overlayEl
}

function motionEnabled(): boolean {
  const reduced = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return false
  const attr = document.body.getAttribute('data-background-motion')
  return attr !== 'off'
}

function updateDynamicOverlay(themeId: ThemeId) {
  const el = ensureOverlayEl()
  if (themeId === 'halloween') {
    const css = generateHalloweenOverlayCSS(motionEnabled())
    el.textContent = css
    themeDebugLog('overlay: halloween applied')
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const motionObserver = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
      if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
    })
    motionObserver.observe(document.body, { attributes: true, attributeFilter: ['data-background-motion'] })

    // Respect OS reduced-motion changes
    try {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      mql.addEventListener('change', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') as ThemeId | null
        if (currentTheme) updateDynamicOverlay(normalizeThemeId(currentTheme))
      })
    } catch {}
  }
}

function generateHalloweenOverlayCSS(withMotion: boolean): string {
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
      if ((r -= weights[i]) < 0) return shapes[i]
    }
    return shapes[0]
  }

  const count = 14
  const images: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  const repeats: string[] = []

  for (let i = 0; i < count; i++) {
    images.push(pick())
    const size = Math.round(40 + Math.random() * 140) // 40–180px
    sizes.push(`${size}px ${Math.round(size * (0.9 + Math.random() * 0.3))}px`)
    const x = Math.round(Math.random() * 100)
    const y = Math.round(Math.random() * 100)
    positions.push(`${x}% ${y}%`)
    repeats.push('no-repeat')
  }

  // Add soft glow gradients at the end
  const gradients = [
    'radial-gradient(3px 3px at 10% 20%, rgba(255, 107, 53, 0.4), transparent)',
    'radial-gradient(2px 2px at 80% 60%, rgba(139, 21, 56, 0.3), transparent)',
    'radial-gradient(1px 1px at 30% 70%, rgba(255, 215, 0, 0.3), transparent)'
  ]

  images.push(...gradients)
  sizes.push('300px 300px', '200px 200px', '200px 200px')
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
