import { normalizeThemeId, type ThemeId } from '@conquestk/shared/types/themes'
import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { extractFirstHexColor, isGradientValue, pickTextOnColor } from '@/utils/color'
import { logger } from '@/utils/logger'
import { API_URL } from '../config'
import {
  applyTheme,
  getBackgroundMotionPreference,
  getStoredTheme,
  PREMIUM_THEMES,
  STANDARD_THEMES,
  setBackgroundMotionPreference,
  storeTheme,
  THEMES,
} from '../config/themes.config'
import {
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  isPremiumColor,
  type PlayerColor,
  PREMIUM_COLORS,
  STANDARD_COLORS,
} from '../constants/colors'
import { DEFAULT_TAGLINE, PROFILE_TAGLINES } from '../constants/profileTaglines'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import authService from '../services/authService'
import preferencesService from '../services/preferencesService'
import { profileService } from '../services/profileService'
import pushNotificationService from '../services/pushNotificationService'
import {
  clearCache,
  type DMPermission,
  type NotificationPrefs,
  resetSettings,
  setColorblindMode,
  setColorTheme,
  setDirectMessages,
  setNotificationPref,
  setPerformanceMode,
  setPreferredColor,
  setShowOnlineStatus,
} from '../store/settingsSlice'

// PWA install helpers
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const pwaIsStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  // iOS Safari
  (navigator as unknown as { standalone?: boolean }).standalone === true

const pwaIsIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !/android/i.test(navigator.userAgent)

const pwaIsSafari = () =>
  /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

function PWAInstallControl({
  label,
  description,
  isWorking,
}: {
  label: string | React.ReactNode
  description: string | React.ReactNode
  isWorking: boolean
}) {
  const [installed, setInstalled] = useState<boolean>(() => pwaIsStandalone())
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (installed) return

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)

    window.addEventListener('beforeinstallprompt', onBIP as EventListener)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP as EventListener)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed])

  const iosSafari = pwaIsIOS() && pwaIsSafari()

  const isDisabled = !isWorking
  const baseContainerClass = `panel relative transition-all ${
    !isDisabled
      ? 'hover:border-[color:var(--hover-border)] hover:shadow-[var(--shadow-1)]'
      : 'opacity-60'
  }`
  const labelClass = `text-base font-medium ${
    !isDisabled ? 'text-[color:var(--heading)]' : 'text-muted'
  }`
  const descriptionClass = 'text-sm mt-1 text-muted'

  return (
    <div className={baseContainerClass}>
      {!isWorking ? (
        <div className="badge absolute -top-2 -right-2 text-[color:var(--color-warning)] border-[color:var(--color-warning)] bg-[color:var(--hover-bg)] text-xs font-semibold z-10">
          Coming Soon
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={labelClass}>{label}</div>
            <div className={descriptionClass}>{description}</div>
          </div>
          {installed ? (
            <div className="text-[color:var(--color-success)] font-medium">Installed ✓</div>
          ) : deferredPrompt ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await deferredPrompt.prompt()
                  await deferredPrompt.userChoice
                } finally {
                  setDeferredPrompt(null)
                }
              }}
            >
              Install
            </button>
          ) : null}
        </div>

        {!installed && !deferredPrompt && (
          <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--surface-2)] p-3 text-sm text-muted">
            {iosSafari ? (
              <div>
                <div className="font-medium text-[color:var(--text)] mb-1">
                  How to install on iOS
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open this site in Safari</li>
                  <li>Tap the Share button</li>
                  <li>Select "Add to Home Screen"</li>
                </ol>
              </div>
            ) : (
              <div>
                <div className="font-medium text-[color:var(--text)] mb-1">How to install</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>Chrome/Android: open menu (⋮) → Install app</li>
                  <li>Chrome/Edge desktop: click the Install icon in the address bar or menu</li>
                  <li>Firefox Android: open menu → Add to Home screen</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Color Dropdown Component
function ColorDropdown({
  value,
  onChange,
}: {
  value: PlayerColor
  onChange: (color: PlayerColor) => void
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const gradientId = useId()

  // Derive stroke color for selected swatch to ensure contrast
  const selectedValueStr = COLOR_HEX_VALUES[value] ?? '#000000'
  const selectedHasGradient = isGradientValue(selectedValueStr)
  const selectedBaseHex = selectedHasGradient
    ? extractFirstHexColor(selectedValueStr) || '#000000'
    : selectedValueStr
  const selectedStrokeColor = isPremiumColor(value) ? '#FBBF24' : pickTextOnColor(selectedBaseHex)
  // Extract gradient stops from a CSS linear-gradient string; evenly spaced offsets
  const parseGradientStops = (cssGradient: string): string[] => {
    const matches = cssGradient.match(/#([0-9a-fA-F]{6})/g)
    return matches ? matches.map((m) => m.toString()) : []
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="btn w-full min-w-[240px] items-center justify-start gap-3 hover:bg-[color:var(--hover-bg)]"
      >
        {/* Color Hexagon */}
        <div className="relative">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            role="img"
            aria-labelledby={titleId}
            aria-hidden="true"
            focusable="false"
          >
            <title id={titleId}>Selected color swatch</title>
            <polygon
              points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
              style={{
                fill: selectedHasGradient ? `url(#${gradientId})` : selectedValueStr,
                stroke: selectedStrokeColor,
                strokeWidth: '1.5',
              }}
            />
            {selectedHasGradient && (
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  {(() => {
                    const stops = parseGradientStops(selectedValueStr)
                    const count = Math.max(1, stops.length)
                    return stops.length > 0
                      ? stops.map((c, idx) => (
                          <stop
                            key={c}
                            offset={`${(idx / (count - 1 || 1)) * 100}%`}
                            style={{ stopColor: c }}
                          />
                        ))
                      : [
                          <stop key="a" offset="0%" style={{ stopColor: '#ffffff' }} />,
                          <stop key="b" offset="100%" style={{ stopColor: '#cccccc' }} />,
                        ]
                  })()}
                </linearGradient>
              </defs>
            )}
          </svg>
          {value === 'pulse' && (
            <div className="absolute inset-0 animate-pulse" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <polygon
                  points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                  fill="none"
                  stroke="#ff00ff"
                  strokeWidth="1"
                  opacity="0.5"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Color Name */}
        <span className="flex-1 text-left text-[color:var(--text)]">
          {COLOR_DISPLAY_NAMES[value]}
        </span>

        {/* Dropdown Arrow */}
        <svg
          className={`w-4 h-4 text-muted transition-transform ${
            isDropdownOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          role="img"
          aria-hidden="true"
          focusable="false"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute mt-2 w-full panel panel-overlay z-50 max-h-96 overflow-y-auto p-0">
          {/* Standard Colors Section */}
          <div className="p-2">
            <div className="text-xs text-muted uppercase tracking-wider px-2 py-1">
              Standard Colors
            </div>
            {STANDARD_COLORS.map((color) => {
              const isSelected = value === color
              const swatchStr = COLOR_HEX_VALUES[color] ?? '#000000'
              const hasGradient = isGradientValue(swatchStr)
              const baseHex = hasGradient ? extractFirstHexColor(swatchStr) || '#000000' : swatchStr
              const strokeColor = isSelected ? pickTextOnColor(baseHex) : '#ffffff30'
              return (
                <button
                  type="button"
                  key={color}
                  onClick={() => {
                    onChange(color)
                    setIsDropdownOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-[var(--radius-sm)] border transition-colors hover:bg-[color:var(--hover-bg)] ${
                    isSelected
                      ? 'bg-[color:var(--hover-bg)] border-[color:var(--hover-border)]'
                      : 'border-transparent'
                  }`}
                >
                  {/* Color Hexagon */}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <polygon
                      points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                      style={{
                        fill: hasGradient ? `url(#gradient-${color})` : swatchStr,
                        stroke: strokeColor,
                        strokeWidth: '1.5',
                      }}
                    />
                    {hasGradient && (
                      <defs>
                        <linearGradient
                          id={`gradient-${color}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          {(() => {
                            const stops = parseGradientStops(swatchStr)
                            const count = Math.max(1, stops.length)
                            return stops.length > 0
                              ? stops.map((c, idx) => (
                                  <stop
                                    key={c}
                                    offset={`${(idx / (count - 1 || 1)) * 100}%`}
                                    style={{ stopColor: c }}
                                  />
                                ))
                              : [
                                  <stop key="a" offset="0%" style={{ stopColor: '#ffffff' }} />,
                                  <stop key="b" offset="100%" style={{ stopColor: '#cccccc' }} />,
                                ]
                          })()}
                        </linearGradient>
                      </defs>
                    )}
                  </svg>

                  {/* Color Name */}
                  <span className="flex-1 text-left text-[color:var(--text)]">
                    {COLOR_DISPLAY_NAMES[color]}
                  </span>

                  {/* Selected Check */}
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-[color:var(--color-success)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-[color:var(--panel-border)] my-1" />

          {/* Premium Colors Section */}
          <div className="p-2">
            <div className="text-xs uppercase tracking-wider px-2 py-1 flex items-center gap-1 text-[color:var(--color-secondary)]">
              <span>Premium Colors</span>
              <span>⭐</span>
            </div>
            {PREMIUM_COLORS.map((color) => {
              const isSelected = value === color
              const swatchStr = COLOR_HEX_VALUES[color] ?? '#000000'
              const hasGradient = isGradientValue(swatchStr)
              return (
                <button
                  type="button"
                  key={color}
                  onClick={() => {
                    onChange(color)
                    setIsDropdownOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-[var(--radius-sm)] border transition-colors hover:bg-[color:var(--hover-bg)] ${
                    isSelected
                      ? 'bg-[color:var(--hover-bg)] border-[color:var(--hover-border)]'
                      : 'border-transparent'
                  }`}
                >
                  {/* Color Hexagon */}
                  <div className="relative">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <polygon
                        points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                        style={{
                          fill: hasGradient ? `url(#gradient-${color})` : swatchStr,
                          stroke: '#FBBF24',
                          strokeWidth: '1.5',
                          filter:
                            color === 'NeonGreen' ? 'drop-shadow(0 0 3px #39FF14)' : undefined,
                        }}
                      />
                      {hasGradient && (
                        <defs>
                          <linearGradient
                            id={`gradient-${color}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                          >
                            {(() => {
                              const stops = parseGradientStops(swatchStr)
                              const count = Math.max(1, stops.length)
                              return stops.length > 0
                                ? stops.map((c, idx) => (
                                    <stop
                                      key={c}
                                      offset={`${(idx / (count - 1 || 1)) * 100}%`}
                                      style={{ stopColor: c }}
                                    />
                                  ))
                                : [
                                    <stop key="a" offset="0%" style={{ stopColor: '#ffffff' }} />,
                                    <stop key="b" offset="100%" style={{ stopColor: '#cccccc' }} />,
                                  ]
                            })()}
                          </linearGradient>
                        </defs>
                      )}
                    </svg>
                    {color === 'pulse' && (
                      <div className="absolute inset-0 animate-pulse" aria-hidden="true">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <polygon
                            points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                            fill="none"
                            stroke="#ff00ff"
                            strokeWidth="1"
                            opacity="0.5"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Color Name */}
                  <span className="flex-1 text-left text-[color:var(--text)]">
                    {COLOR_DISPLAY_NAMES[color]}
                  </span>

                  {/* Selected Check */}
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-[color:var(--color-success)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const isDMPermissionValue = (value: unknown): value is DMPermission =>
  value === 'everyone' || value === 'friends' || value === 'nobody'

const isNotificationPrefs = (value: unknown): value is NotificationPrefs => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prefs = value as Partial<NotificationPrefs>
  return (
    typeof prefs.turnNotifications === 'object' &&
    prefs.turnNotifications !== null &&
    typeof prefs.gameInvites === 'object' &&
    prefs.gameInvites !== null &&
    typeof prefs.directMessages === 'object' &&
    prefs.directMessages !== null
  )
}

type SettingsTab =
  | 'account'
  | 'game'
  | 'audio'
  | 'display'
  | 'notifications'
  | 'privacy'
  | 'advanced'

interface SettingItem {
  id: string
  label: string
  description: string | React.ReactNode
  type: 'toggle' | 'select' | 'range' | 'button' | 'input' | 'custom' | 'color-theme-selector'
  isWorking: boolean
  defaultValue?: unknown
  options?: { value: string; label: string }[]
  buttonText?: string
  buttonVariant?: 'primary' | 'secondary' | 'danger'
  onChange?: (value: unknown) => void
  onClick?: () => void
  disabled?: boolean
  disabledReason?: string
  statusMessage?: string | React.ReactNode
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const { user } = useAppSelector((state) => state.auth)
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()

  // Get current color theme from centralized config
  const [currentColorTheme, setCurrentColorTheme] = useState<ThemeId>(() => getStoredTheme())
  const [backgroundMotionEnabled, setBackgroundMotionEnabled] = useState<boolean>(() =>
    getBackgroundMotionPreference(),
  )
  // State for theme dropdown (moved here to avoid re-declaration)
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false)
  const themeDropdownRef = useRef<HTMLDivElement>(null)

  // Apply stored color theme on component mount and when it changes
  useEffect(() => {
    applyTheme(currentColorTheme)
  }, [currentColorTheme])

  // Click outside handler for theme dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false)
      }
    }

    if (isThemeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isThemeDropdownOpen])
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [pushBackendEnabled, setPushBackendEnabled] = useState(true)
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null)
  const [pushOperationInFlight, setPushOperationInFlight] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [audioPrefs, setAudioPrefs] = useState(audioService.getPreferences())
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false)
  const [currentTagline, setCurrentTagline] = useState<string>(DEFAULT_TAGLINE)
  const [currentBio, setCurrentBio] = useState<string>('')

  // Load current tagline and bio for the logged-in user
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const load = async () => {
      try {
        if (!user?.id) return
        const summary = await profileService.getMyProfile({ signal: controller.signal })
        if (!active) return
        if (typeof summary.tagline === 'string' && summary.tagline.trim().length > 0) {
          setCurrentTagline(summary.tagline)
        } else {
          setCurrentTagline(DEFAULT_TAGLINE)
        }
        if (typeof summary.bio === 'string') {
          setCurrentBio(summary.bio)
        } else {
          setCurrentBio('')
        }
      } catch (_e) {
        // leave default
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [user?.id])

  useEffect(() => {
    const initNotifications = async () => {
      setPushStatusMessage(null)
      const supported = await pushNotificationService.initialize()
      const permission = pushNotificationService.getPermissionStatus()
      const hasSubscription = pushNotificationService.isEnabled()

      setNotificationStatus(permission)
      setIsSubscribed(hasSubscription)

      const backendEnabled = pushNotificationService.isBackendEnabled()
      setPushBackendEnabled(backendEnabled)
      const initError = pushNotificationService.getLastError()

      if (!backendEnabled) {
        if (hasSubscription) {
          setPushStatusMessage(
            initError || 'Push notifications are currently disabled by the server.',
          )
        } else if (initError) {
          setPushStatusMessage(initError)
        }
      } else if (!supported && initError) {
        setPushStatusMessage(initError)
      } else {
        setPushStatusMessage(null)
      }
    }
    void initNotifications()
  }, [])

  // Check username availability
  const checkUsernameAvailability = async (username: string) => {
    if (username === user?.username) {
      setUsernameAvailable(true)
      return
    }

    if (username.length < 3) {
      setUsernameAvailable(false)
      return
    }

    setCheckingUsername(true)
    try {
      const token = localStorage.getItem('token')
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')
      const response = await fetch(`${apiUrl}/users/check-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      })

      const data = await response.json()
      setUsernameAvailable(data.available)
    } catch (error) {
      logger.error('Error checking username', error)
      setUsernameAvailable(null)
    } finally {
      setCheckingUsername(false)
    }
  }

  // Update profile (username/email)
  const updateProfile = async (username?: string, email?: string, tagline?: string) => {
    setProfileUpdateLoading(true)
    try {
      const token = localStorage.getItem('token')
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')

      const updateData: Record<string, unknown> = {}
      if (username) updateData.username = username
      if (email) updateData.email = email
      if (tagline) updateData.tagline = tagline

      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      })

      const data = await response.json()

      if (response.ok) {
        setSaveStatus('Profile updated successfully!')
        setTimeout(() => setSaveStatus(null), 3000)
        if (tagline) setCurrentTagline(tagline)
        // You might want to update the Redux state here too
        return true
      }
      setSaveStatus(data.error || 'Failed to update profile')
      setTimeout(() => setSaveStatus(null), 5000)
      return false
    } catch (error) {
      logger.error('Profile update error', error)
      setSaveStatus('Failed to update profile')
      setTimeout(() => setSaveStatus(null), 5000)
      return false
    } finally {
      setProfileUpdateLoading(false)
    }
  }

  // Helper function to persist important settings to server
  const persistSetting = async (settingKey: string, value: unknown) => {
    try {
      // For theme specifically, use the preferences API
      if (settingKey === 'theme') {
        if (typeof value !== 'string') {
          return
        }

        const normalizedTheme = normalizeThemeId(value)
        const persistedTheme = await preferencesService.updateTheme(normalizedTheme)
        if (persistedTheme) {
          logger.info('Theme persisted to database', persistedTheme)
        }
        return
      }

      // For other settings, continue using the existing method
      const settingsToSave: Record<string, unknown> = {}

      // Map Redux setting keys to server setting keys
      switch (settingKey) {
        case 'preferredColor':
          if (typeof value === 'string') {
            settingsToSave.preferredColor = value
          } else {
            return
          }
          break
        case 'showOnlineStatus':
          if (typeof value === 'boolean') {
            settingsToSave.showOnlineStatus = value
          } else {
            return
          }
          break
        case 'directMessages':
          if (isDMPermissionValue(value)) {
            settingsToSave.directMessages = value
          } else {
            return
          }
          break
        case 'notifications':
          if (isNotificationPrefs(value)) {
            settingsToSave.notifications = value
          } else {
            return
          }
          break
        default:
          // Don't persist other settings (like audio settings)
          return
      }

      await authService.updateSettings(settingsToSave)
      logger.info('Setting persisted to server', settingKey, value)
    } catch (error) {
      logger.error('Failed to persist setting', settingKey, error)
      // Don't show error to user - Redux change still worked locally
    }
  }

  const settingsTabs = [
    { id: 'account' as SettingsTab, label: 'Account', icon: '👤' },
    { id: 'game' as SettingsTab, label: 'Game', icon: '🎮' },
    { id: 'audio' as SettingsTab, label: 'Audio', icon: '🔊' },
    { id: 'display' as SettingsTab, label: 'Display', icon: '🖥️' },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: '🔔' },
    { id: 'privacy' as SettingsTab, label: 'Privacy', icon: '🛡️' },
    { id: 'advanced' as SettingsTab, label: 'Advanced', icon: '⚙️' },
  ]

  // Unified settings renderer
  const renderSetting = (setting: SettingItem) => {
    const isDisabled = !setting.isWorking || setting.disabled === true

    const baseContainerClass = `panel relative transition-all ${
      !isDisabled
        ? 'hover:border-[color:var(--hover-border)] hover:shadow-[var(--shadow-1)]'
        : 'opacity-60'
    }`

    const labelClass = `text-base font-medium ${!isDisabled ? 'text-[color:var(--heading)]' : 'text-muted'}`

    const descriptionClass = 'text-sm mt-1 text-muted'

    const renderComingSoonBadge = () => {
      if (!setting.isWorking) {
        return (
          <div className="badge absolute -top-2 -right-2 text-[color:var(--color-warning)] border-[color:var(--color-warning)] bg-[color:var(--hover-bg)] text-xs font-semibold z-10">
            Coming Soon
          </div>
        )
      }
      return null
    }

    const renderControl = () => {
      switch (setting.type) {
        case 'toggle':
          return (
            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(setting.defaultValue)}
                disabled={isDisabled}
                onChange={(e) => {
                  if (!isDisabled && setting.onChange) {
                    setting.onChange(e.target.checked)
                  }
                }}
                className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              />
              <span className={`slider ${!setting.isWorking ? 'opacity-50' : ''}`}></span>
            </label>
          )

        case 'select':
          return (
            <select
              className={`form-select ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isDisabled}
              value={typeof setting.defaultValue === 'string' ? setting.defaultValue : ''}
              onChange={(e) => {
                if (!isDisabled && setting.onChange) {
                  setting.onChange(e.target.value)
                }
              }}
            >
              {setting.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )

        case 'range':
          return (
            <div className="w-32">
              <input
                type="range"
                min="0"
                max="100"
                value={typeof setting.defaultValue === 'number' ? setting.defaultValue : 0}
                disabled={isDisabled}
                onChange={(e) => {
                  if (!isDisabled && setting.onChange) {
                    setting.onChange(Number(e.target.value))
                  }
                }}
                className={`w-full ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <div className="text-xs text-muted text-center mt-1">
                {typeof setting.defaultValue === 'number' ? setting.defaultValue : 0}%
              </div>
            </div>
          )

        case 'button': {
          const buttonClass =
            setting.buttonVariant === 'danger'
              ? `btn btn-danger ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
              : setting.buttonVariant === 'primary'
                ? `btn btn-primary ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
                : `btn btn-secondary ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`

          return (
            <button
              type="button"
              className={buttonClass}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled && setting.onClick) {
                  setting.onClick()
                }
              }}
            >
              {setting.buttonText}
            </button>
          )
        }

        case 'input': {
          const isEditing = editingField === setting.id
          const isUsername = setting.id === 'username'
          const isEmail = setting.id === 'email'

          return (
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <span className="text-muted text-sm">
                    {fieldValues[setting.id] ||
                      (typeof setting.defaultValue === 'string' ? setting.defaultValue : '') ||
                      'Not set'}
                  </span>
                  {!isDisabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingField(setting.id)
                        setFieldValues((prev) => ({
                          ...prev,
                          [setting.id]:
                            typeof setting.defaultValue === 'string' ? setting.defaultValue : '',
                        }))
                        // Reset username availability when starting to edit
                        if (isUsername) {
                          setUsernameAvailable(null)
                        }
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      Edit
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type={isEmail ? 'email' : 'text'}
                        className={`form-input w-48 ${
                          isUsername && usernameAvailable === false
                            ? 'border-[color:var(--color-danger)]'
                            : isUsername && usernameAvailable === true
                              ? 'border-[color:var(--color-success)]'
                              : ''
                        }`}
                        value={fieldValues[setting.id] || ''}
                        maxLength={isUsername ? 20 : undefined}
                        onChange={(e) => {
                          const newValue = e.target.value
                          setFieldValues((prev) => ({
                            ...prev,
                            [setting.id]: newValue,
                          }))

                          // Check username availability with debounce
                          if (isUsername) {
                            const timeoutId = setTimeout(() => {
                              checkUsernameAvailability(newValue)
                            }, 500)
                            return () => clearTimeout(timeoutId)
                          }
                        }}
                      />

                      {/* Username availability indicator */}
                      {isUsername && (
                        <div className="flex items-center">
                          {checkingUsername ? (
                            <span className="text-muted">⏳</span>
                          ) : usernameAvailable === true ? (
                            <span className="text-[color:var(--color-success)]">✓</span>
                          ) : usernameAvailable === false ? (
                            <span className="text-[color:var(--color-danger)]">✗</span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Username availability message */}
                    {isUsername && usernameAvailable === false && (
                      <p className="text-[color:var(--color-danger)] text-xs">
                        {fieldValues[setting.id]?.length < 3
                          ? 'Username must be at least 3 characters'
                          : 'Username is already taken'}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const value = fieldValues[setting.id]
                      if (!value) return

                      // Validate username
                      if (isUsername && (value.length < 3 || usernameAvailable === false)) {
                        return
                      }

                      // Validate email
                      if (isEmail && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                        setSaveStatus('Invalid email format')
                        setTimeout(() => setSaveStatus(null), 3000)
                        return
                      }

                      // Update profile
                      const updateData: Record<string, unknown> = {}
                      if (isUsername) updateData.username = value
                      if (isEmail) updateData.email = value

                      const success = await updateProfile(
                        isUsername ? value : undefined,
                        isEmail ? value : undefined,
                      )

                      if (success) {
                        setEditingField(null)
                        // Reset availability check
                        if (isUsername) {
                          setUsernameAvailable(null)
                        }
                      }
                    }}
                    disabled={
                      profileUpdateLoading ||
                      (isUsername && (checkingUsername || usernameAvailable === false))
                    }
                    className={`btn btn-success btn-sm ${
                      profileUpdateLoading ||
                      (isUsername && (checkingUsername || usernameAvailable === false))
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {profileUpdateLoading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingField(null)
                      setFieldValues((prev) => {
                        const newValues = { ...prev }
                        delete newValues[setting.id]
                        return newValues
                      })
                      // Reset username availability
                      if (isUsername) {
                        setUsernameAvailable(null)
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )
        }

        case 'custom':
          if (setting.id === 'bio') {
            const BIO_MAX = 160
            const isEditing = editingField === 'bio'
            const value = isEditing
              ? (fieldValues.bio ?? (setting.defaultValue as string) ?? '')
              : ((setting.defaultValue as string) ?? '')
            const remaining = BIO_MAX - (value?.length ?? 0)
            return (
              <div className={baseContainerClass}>
                {renderComingSoonBadge()}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={labelClass}>{setting.label}</div>
                      <div className={descriptionClass}>{setting.description}</div>
                    </div>
                    {!isEditing && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingField('bio')
                          setFieldValues((prev) => ({ ...prev, bio: value }))
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        className="form-textarea w-full resize-y min-h-[96px]"
                        maxLength={BIO_MAX}
                        value={value}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, bio: e.target.value }))
                        }
                        placeholder="Share a short intro, e.g. favorite maps or playstyle."
                      />
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={
                            remaining < 0 ? 'text-[color:var(--color-danger)]' : 'text-muted'
                          }
                        >
                          {Math.max(0, remaining)} / {BIO_MAX}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingField(null)
                              setFieldValues((prev) => {
                                const next = { ...prev }
                                delete next.bio
                                return next
                              })
                            }}
                            disabled={profileUpdateLoading}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              const next = (value ?? '').trim()
                              // Allow clearing bio
                              if (next.length > BIO_MAX) return
                              try {
                                setProfileUpdateLoading(true)
                                await profileService.updateMyProfile({ bio: next })
                                setCurrentBio(next)
                                setEditingField(null)
                                setSaveStatus('Bio updated!')
                                setTimeout(() => setSaveStatus(null), 3000)
                              } catch (e) {
                                const message =
                                  e instanceof Error ? e.message : 'Failed to update bio'
                                setSaveStatus(message)
                                setTimeout(() => setSaveStatus(null), 5000)
                              } finally {
                                setProfileUpdateLoading(false)
                              }
                            }}
                            disabled={profileUpdateLoading || value.length > BIO_MAX}
                          >
                            {profileUpdateLoading ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 rounded-lg bg-[color:var(--surface-2)]/60 border border-white/10 text-sm text-muted whitespace-pre-line">
                      {value?.trim().length ? value : 'No bio set'}
                    </div>
                  )}
                </div>
              </div>
            )
          }
          if (setting.id === 'preferred-color') {
            const currentColor = setting.defaultValue as PlayerColor
            return (
              <ColorDropdown value={currentColor} onChange={(color) => setting.onChange?.(color)} />
            )
          }
          if (setting.id === 'install-app') {
            return (
              <PWAInstallControl
                label={setting.label}
                description={setting.description}
                isWorking={setting.isWorking}
              />
            )
          }
          return null

        case 'color-theme-selector': {
          const selectedTheme = THEMES.find((t) => t.id === setting.defaultValue) || THEMES[0]
          return (
            <div className="relative" ref={themeDropdownRef}>
              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                disabled={isDisabled}
                className={`btn w-full min-w-[240px] items-center justify-start gap-3 ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[color:var(--hover-bg)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Color Circle */}
                  <div
                    className="w-6 h-6 rounded-full border-2"
                    style={{
                      backgroundColor: selectedTheme.displayColor,
                      borderColor:
                        selectedTheme.id === 'light' ? '#e5e7eb' : selectedTheme.displayColor,
                    }}
                  />
                  {/* Theme Name */}
                  <span className="flex-1 text-left text-[color:var(--text)]">
                    {selectedTheme.name}
                  </span>
                </div>

                {/* Dropdown Arrow */}
                <svg
                  className={`w-5 h-5 text-muted transition-transform ${
                    isThemeDropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isThemeDropdownOpen && (
                <div className="absolute mt-2 w-full panel panel-overlay z-50 max-h-96 overflow-y-auto p-0">
                  <div className="p-2">
                    <div className="text-xs text-muted uppercase tracking-wider px-2 py-1">
                      Standard Themes
                    </div>
                    {STANDARD_THEMES.map((theme) => (
                      <button
                        type="button"
                        key={theme.id}
                        onClick={() => {
                          if (!isDisabled && setting.onChange) {
                            setting.onChange(theme.id)
                          }
                          setIsThemeDropdownOpen(false)
                        }}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-[var(--radius-sm)] border transition-colors hover:bg-[color:var(--hover-bg)] ${
                          setting.defaultValue === theme.id
                            ? 'bg-[color:var(--hover-bg)] border-[color:var(--hover-border)]'
                            : 'border-transparent'
                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {/* Color Circle */}
                        <div
                          className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                          style={{
                            backgroundColor: theme.displayColor,
                            borderColor: theme.id === 'light' ? '#e5e7eb' : theme.displayColor,
                          }}
                        />
                        {/* Theme Info */}
                        <div className="flex items-center flex-grow">
                          <span className="text-sm font-medium text-[color:var(--text)]">
                            {theme.name}
                          </span>
                        </div>

                        {/* Selected Check */}
                        {setting.defaultValue === theme.id && (
                          <svg
                            className="w-5 h-5 text-[color:var(--color-primary)] flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                  {PREMIUM_THEMES.length > 0 && (
                    <>
                      <div className="border-t border-[color:var(--panel-border)] my-1" />
                      <div className="p-2">
                        <div className="text-xs uppercase tracking-wider px-2 py-1 flex items-center gap-1 text-[color:var(--color-secondary)]">
                          <span>Premium Themes</span>
                          <span>⭐</span>
                        </div>
                        {PREMIUM_THEMES.map((theme) => (
                          <button
                            type="button"
                            key={theme.id}
                            onClick={() => {
                              if (!isDisabled && setting.onChange) {
                                setting.onChange(theme.id)
                              }
                              setIsThemeDropdownOpen(false)
                            }}
                            disabled={isDisabled}
                            className={`w-full flex items-center gap-3 px-2 py-2 rounded-[var(--radius-sm)] border transition-colors hover:bg-[color:var(--hover-bg)] ${
                              setting.defaultValue === theme.id
                                ? 'bg-[color:var(--hover-bg)] border-[color:var(--hover-border)]'
                                : 'border-transparent'
                            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {/* Color Circle */}
                            <div
                              className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                              style={{
                                backgroundColor: theme.displayColor,
                                borderColor: theme.displayColor,
                              }}
                            />
                            {/* Theme Info */}
                            <div className="flex items-center flex-grow">
                              <span className="text-sm font-medium text-[color:var(--text)]">
                                {theme.name}
                              </span>
                            </div>

                            {/* Selected Check */}
                            {setting.defaultValue === theme.id && (
                              <svg
                                className="w-5 h-5 text-[color:var(--color-primary)] flex-shrink-0"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        }

        default:
          return null
      }
    }

    return (
      <div key={setting.id} className="relative">
        {renderComingSoonBadge()}
        <div className={baseContainerClass}>
          <div className="flex justify-between items-center gap-4">
            <div className="flex-1">
              <h4 className={labelClass}>{setting.label}</h4>
              <p className={descriptionClass}>{setting.description}</p>
              {setting.disabled && setting.disabledReason && (
                <p className="text-sm text-[color:var(--color-warning)] mt-2">
                  {setting.disabledReason}
                </p>
              )}
              {setting.statusMessage && (
                <p className="text-sm text-[color:var(--color-danger)] mt-2">
                  {setting.statusMessage}
                </p>
              )}
            </div>
            <div className="shrink-0">{renderControl()}</div>
          </div>
        </div>
      </div>
    )
  }

  // Settings data definitions
  const getSettingsForTab = (tab: SettingsTab): SettingItem[] => {
    switch (tab) {
      case 'account': {
        const items: SettingItem[] = [
          {
            id: 'username',
            label: 'Username',
            description: 'Your display name in games',
            type: 'input',
            isWorking: true,
            defaultValue: user?.username || 'Player123',
          },
          {
            id: 'email',
            label: 'Email Address',
            description: (
              <span>
                Your account email for notifications and recovery •{' '}
                {user?.emailVerified ? (
                  <span className="text-[color:var(--color-primary-soft)] font-semibold">
                    ✓ Verified
                  </span>
                ) : (
                  <span className="text-[color:var(--color-danger)] font-semibold">
                    ⚠ Not Verified
                  </span>
                )}
              </span>
            ),
            type: 'input',
            isWorking: true,
            defaultValue: user?.email || '',
          },
          {
            id: 'bio',
            label: 'Bio',
            description: 'Short intro shown on your profile (max 160 characters, no links)',
            type: 'custom',
            isWorking: true,
            defaultValue: currentBio,
          },
          {
            id: 'profile-tagline',
            label: 'Profile Tagline',
            description: 'Short title shown under your username',
            type: 'select',
            isWorking: true,
            defaultValue: currentTagline,
            options: PROFILE_TAGLINES.map((t) => ({ value: t, label: t })),
            onChange: async (value) => {
              if (typeof value !== 'string') return
              // Optimistically update local state
              setCurrentTagline(value)
              const ok = await updateProfile(undefined, undefined, value)
              if (!ok) {
                // revert on failure
                setCurrentTagline((prev) => prev)
              }
            },
          },
          {
            id: 'change-password',
            label: 'Change Password',
            description: 'Update your account password',
            type: 'button',
            isWorking: true,
            buttonText: '🔑 Change Password',
            buttonVariant: 'secondary',
            onClick: async () => {
              const currentPassword = prompt('Enter your current password:')
              if (!currentPassword) return

              const newPassword = prompt('Enter your new password:')
              if (!newPassword) return

              const confirmPassword = prompt('Confirm your new password:')
              if (newPassword !== confirmPassword) {
                alert('Passwords do not match!')
                return
              }

              try {
                const response = await fetch('/api/auth/change-password', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                  },
                  body: JSON.stringify({ currentPassword, newPassword }),
                })

                const data = await response.json()
                if (response.ok) {
                  alert('Password changed successfully!')
                } else {
                  alert(data.message || 'Failed to change password')
                }
              } catch (_error) {
                alert('Error changing password')
              }
            },
          },
        ]

        items.push({
          id: 'two-factor',
          label: 'Two-Factor Authentication',
          description: 'Enable 2FA for extra security',
          type: 'button',
          isWorking: false,
          buttonText: '📱 Enable 2FA',
          buttonVariant: 'secondary',
        })

        items.push({
          id: 'delete-account',
          label: 'Delete Account',
          description: 'Permanently delete your account',
          type: 'button',
          isWorking: true,
          buttonText: '🗑️ Delete Account',
          buttonVariant: 'danger',
          onClick: async () => {
            const confirmation = prompt(
              'Type "DELETE" to confirm you want to permanently delete your account:',
            )
            if (confirmation !== 'DELETE') {
              alert('Account deletion cancelled')
              return
            }

            const finalConfirm = confirm('Are you absolutely sure? This action cannot be undone!')
            if (!finalConfirm) return

            try {
              const response = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
              })

              if (response.ok) {
                alert('Account deleted successfully')
                localStorage.removeItem('token')
                window.location.href = '/'
              } else {
                const data = await response.json()
                alert(data.message || 'Failed to delete account')
              }
            } catch (_error) {
              alert('Error deleting account')
            }
          },
        })

        return items
      }

      case 'game':
        // Color options are created inline in the UI below

        return [
          {
            id: 'preferred-color',
            label: 'Preferred Color',
            description: 'Your preferred player color in games',
            type: 'custom',
            isWorking: true,
            defaultValue: settings.game?.preferredColor || '#DC2626',
            onChange: (value) => {
              if (typeof value !== 'string') {
                return
              }

              const color = value as PlayerColor
              dispatch(setPreferredColor(color))
              void persistSetting('preferredColor', color)
            },
          },
        ]

      case 'audio':
        return [
          {
            id: 'enable-sounds',
            label: 'Enable Sounds',
            description: 'Master toggle for all audio',
            type: 'toggle',
            isWorking: true,
            defaultValue: audioPrefs.enabled,
            onChange: (value) => {
              if (typeof value !== 'boolean') {
                return
              }

              audioService.setEnabled(value)
              setAudioPrefs(audioService.getPreferences())
            },
          },
          {
            id: 'master-volume',
            label: 'Master Volume',
            description: 'Overall audio volume level',
            type: 'range',
            isWorking: true,
            defaultValue: audioPrefs.masterVolume,
            onChange: (value) => {
              if (typeof value !== 'number') {
                return
              }

              audioService.setVolume('master', value)
              setAudioPrefs(audioService.getPreferences())
            },
          },
          {
            id: 'sfx-volume',
            label: 'Sound Effects',
            description: 'Volume for game sound effects',
            type: 'range',
            isWorking: true,
            defaultValue: audioPrefs.effectsVolume,
            onChange: (value) => {
              if (typeof value !== 'number') {
                return
              }

              audioService.setVolume('effects', value)
              setAudioPrefs(audioService.getPreferences())
            },
          },
          {
            id: 'music-volume',
            label: 'Background Music',
            description: 'Volume for background music',
            type: 'range',
            isWorking: true,
            defaultValue: audioPrefs.musicVolume,
            onChange: (value) => {
              if (typeof value !== 'number') {
                return
              }

              audioService.setVolume('music', value)
              setAudioPrefs(audioService.getPreferences())
            },
          },
          {
            id: 'test-effects',
            label: 'Test Sound Effects',
            description: 'Play a sample sound effect',
            type: 'button',
            isWorking: true,
            buttonText: '🔊 Test Effects',
            buttonVariant: 'secondary',
            onClick: () => audioService.testEffect(),
          },
          {
            id: 'test-music',
            label: 'Test Background Music',
            description: 'Play a sample music track',
            type: 'button',
            isWorking: true,
            buttonText: '🎵 Test Music',
            buttonVariant: 'secondary',
            onClick: () => audioService.testMusic(),
          },
        ]

      case 'display': {
        const items: SettingItem[] = [
          {
            id: 'unified-theme',
            label: 'Theme',
            description: 'Choose your preferred theme - includes light/dark and color options',
            type: 'color-theme-selector',
            isWorking: true,
            defaultValue: currentColorTheme,
            onChange: (value) => {
              if (typeof value !== 'string') {
                return
              }

              const normalizedTheme = normalizeThemeId(value)
              setCurrentColorTheme(normalizedTheme)
              applyTheme(normalizedTheme)
              storeTheme(normalizedTheme)
              dispatch(setColorTheme(normalizedTheme))
              void persistSetting('theme', normalizedTheme)
            },
          },
          {
            id: 'background-motion',
            label: 'Background Motion',
            description:
              'Animate themed backgrounds with parallax and particle effects. Disable if you prefer static backdrops or reduced motion.',
            type: 'toggle',
            isWorking: true,
            defaultValue: backgroundMotionEnabled,
            onChange: (value) => {
              if (typeof value !== 'boolean') {
                return
              }

              setBackgroundMotionEnabled(value)
              setBackgroundMotionPreference(value)
              void persistSetting('backgroundMotion', value ? 'on' : 'off')
            },
          },
        ]

        items.push({
          id: 'colorblind-mode',
          label: 'Colorblind Mode',
          description: 'Use colorblind-friendly territory colors and higher-contrast tokens',
          type: 'toggle',
          isWorking: true,
          defaultValue: Boolean(settings.display?.colorblindMode),
          onChange: (value) => {
            if (typeof value !== 'boolean') return
            dispatch(setColorblindMode(value))
          },
        })

        items.push({
          id: 'performance-mode',
          label: 'Performance Mode',
          description:
            'Reduce visual effects during gameplay for smoother frame rates on lower-end devices. Disables background animations and particle effects.',
          type: 'toggle',
          isWorking: true,
          defaultValue: Boolean(settings.performance?.mode),
          onChange: (value) => {
            if (typeof value !== 'boolean') return
            dispatch(setPerformanceMode(value))
          },
        })

        return items
      }

      case 'notifications': {
        const pushDescription =
          !pushBackendEnabled && !isSubscribed
            ? 'Push notifications are temporarily disabled while the server push service is offline.'
            : notificationStatus === 'granted'
              ? isSubscribed
                ? 'Push notifications are enabled'
                : 'Click to enable push notifications'
              : notificationStatus === 'denied'
                ? 'Notifications blocked - please enable in browser settings'
                : 'Enable notifications for game updates'

        const disabled = pushOperationInFlight || (!pushBackendEnabled && !isSubscribed)
        const disabledReason =
          !pushBackendEnabled && !isSubscribed
            ? 'Push notifications are currently disabled by the server. Please try again later.'
            : undefined

        return [
          {
            id: 'browser-notifications',
            label: 'Browser Push Notifications',
            description: pushDescription,
            type: 'toggle',
            isWorking: true,
            defaultValue: isSubscribed,
            disabled,
            ...(disabledReason ? { disabledReason } : {}),
            ...(pushStatusMessage ? { statusMessage: pushStatusMessage } : {}),
            onChange: (value) => {
              if (typeof value !== 'boolean') {
                return
              }

              void (async () => {
                setPushStatusMessage(null)
                setPushOperationInFlight(true)
                try {
                  if (value) {
                    const result = await pushNotificationService.subscribe()
                    setNotificationStatus(pushNotificationService.getPermissionStatus())
                    setPushBackendEnabled(pushNotificationService.isBackendEnabled())
                    if (result.success) {
                      setIsSubscribed(true)
                    } else {
                      setIsSubscribed(false)
                      setPushStatusMessage(result.message || 'Unable to enable push notifications')
                    }
                  } else {
                    const result = await pushNotificationService.unsubscribe()
                    setNotificationStatus(pushNotificationService.getPermissionStatus())
                    setPushBackendEnabled(pushNotificationService.isBackendEnabled())
                    if (result.success) {
                      setIsSubscribed(false)
                    } else {
                      setIsSubscribed(true)
                      setPushStatusMessage(result.message || 'Unable to disable push notifications')
                    }
                  }
                } catch (error) {
                  logger.error('Push notification toggle failed', error)
                  const message =
                    error instanceof Error ? error.message : 'Unexpected push notification error'
                  setPushStatusMessage(message)
                  setIsSubscribed(pushNotificationService.isEnabled())
                  setNotificationStatus(pushNotificationService.getPermissionStatus())
                } finally {
                  setPushOperationInFlight(false)
                }
              })()
            },
          },
          {
            id: 'test-notification',
            label: 'Test Notification',
            description: 'Send a test push notification',
            type: 'button',
            isWorking: isSubscribed && pushBackendEnabled && !pushOperationInFlight,
            buttonText: '🔔 Send Test',
            disabled: !pushBackendEnabled || pushOperationInFlight,
            ...(!pushBackendEnabled
              ? {
                  disabledReason:
                    'Push notifications are currently disabled by the server. Please try again later.',
                }
              : pushOperationInFlight
                ? { disabledReason: 'Please wait while we update your notification settings.' }
                : {}),
            onClick: async () => {
              if (!isSubscribed) {
                alert('Please enable browser notifications first')
                return
              }

              if (!pushBackendEnabled) {
                alert('Push notifications are currently disabled. Please try again later.')
                return
              }

              const token = localStorage.getItem('token')
              if (!token) {
                alert('You need to be logged in to send a test notification')
                return
              }

              try {
                const response = await fetch(`${API_URL}/notifications/test`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                })

                let result: { success?: boolean; error?: string; message?: string } | null = null
                try {
                  result = await response.json()
                } catch (_error) {
                  // Ignore JSON parsing errors for non-JSON responses
                }

                if (response.ok && result?.success) {
                  alert(result.message || 'Test notification sent! Check your notifications.')
                  return
                }

                const errorMessage =
                  result?.error ||
                  result?.message ||
                  (response.status === 503
                    ? 'The notification service is currently disabled. Please try again later.'
                    : `Failed to send test notification (${response.status})`)

                alert(errorMessage)
              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : 'Unexpected error while sending test notification'
                alert(message)
              }
            },
          },
        ]
      }

      case 'privacy':
        return [
          {
            id: 'online-status',
            label: 'Show Online Status',
            description: "Let other players see when you're online",
            type: 'toggle',
            isWorking: true,
            defaultValue: settings.privacy?.showOnlineStatus ?? true,
            onChange: (value) => {
              if (typeof value !== 'boolean') {
                return
              }

              dispatch(setShowOnlineStatus(value))
              void persistSetting('showOnlineStatus', value)
            },
          },
          {
            id: 'dm-settings',
            label: 'Direct Messages',
            description: 'Who can send you direct messages',
            type: 'select',
            isWorking: true,
            defaultValue: settings.privacy?.directMessages ?? 'friends',
            onChange: (value) => {
              if (!isDMPermissionValue(value)) {
                return
              }

              dispatch(setDirectMessages(value))
              void persistSetting('directMessages', value)
            },
            options: [
              { value: 'everyone', label: 'Everyone' },
              { value: 'friends', label: 'Friends Only' },
              { value: 'nobody', label: 'Nobody' },
            ],
          },
          {
            id: 'privacy-policy',
            label: 'Privacy Policy',
            description: 'View our privacy policy',
            type: 'button',
            isWorking: true,
            buttonText: '🔒 View Policy',
            buttonVariant: 'secondary',
            onClick: () => {
              window.open('/privacy', '_blank')
            },
          },
        ]

      case 'advanced': {
        const advancedSettings: SettingItem[] = [
          {
            id: 'install-app',
            label: 'Install Conquest K',
            description: 'Install the app for faster launch and fullscreen experience',
            type: 'custom',
            isWorking: true,
          },
          {
            id: 'reset-settings',
            label: 'Reset All Settings',
            description: 'Reset all settings to default values',
            type: 'button',
            isWorking: true,
            buttonText: '🔄 Reset All Settings',
            buttonVariant: 'danger',
            onClick: () => {
              if (confirm('Are you sure you want to reset all settings to default?')) {
                dispatch(resetSettings())
                alert('Settings reset to default!')
              }
            },
          },
        ]

        // Add admin-only cache refresh button
        if (user?.isAdmin) {
          advancedSettings.push({
            id: 'refresh-cache',
            label: 'Refresh Server Cache',
            description: 'Force refresh of server-side caches (Admin only)',
            type: 'button',
            isWorking: true,
            buttonText: '🔄 Refresh Cache',
            buttonVariant: 'primary',
            onClick: async () => {
              try {
                const response = await fetch('/api/admin/cache/refresh', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                  },
                })

                if (response.ok) {
                  alert('✅ Cache refreshed successfully!')
                  // Also clear local cache
                  dispatch(clearCache())
                } else {
                  const error = await response.json()
                  alert(`❌ Failed to refresh cache: ${error.message || 'Unknown error'}`)
                }
              } catch (error) {
                logger.error('Cache refresh error', error)
                alert('❌ Failed to refresh cache')
              }
            },
          })
        }

        return advancedSettings
      }

      default:
        return []
    }
  }

  // Custom notification table renderer
  const renderNotificationTable = () => {
    const notificationTypes: Array<{
      key: keyof NotificationPrefs
      label: string
      description: string
    }> = [
      {
        key: 'turnNotifications',
        label: 'Your Turn',
        description: "When it's your turn to play",
      },
      {
        key: 'turnTimerWarning',
        label: 'Turn Timer Warning',
        description: '10 minutes before turn timeout',
      },
      {
        key: 'gameInvites',
        label: 'Game Invitations',
        description: 'When someone invites you to play',
      },
      {
        key: 'gameEnded',
        label: 'Game Ended',
        description: "When a game you're in finishes",
      },
      {
        key: 'directMessages',
        label: 'Direct Messages',
        description: 'When another player sends you a direct message',
      },
    ]

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="text-left py-4 pr-4 text-gray-200 font-medium">Notification Type</th>
              <th className="text-center py-4 px-4 text-gray-200 font-medium">Browser</th>
              <th className="text-center py-4 pl-4 text-gray-200 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {notificationTypes.map((notification) => (
              <tr key={notification.key} className="border-b border-slate-700/50">
                <td className="py-4 pr-4">
                  <div>
                    <div className="text-gray-200 font-medium">{notification.label}</div>
                    <div className="text-sm text-muted">{notification.description}</div>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.notifications?.[notification.key]?.browser ?? false}
                      onChange={(e) => {
                        const newPref = {
                          type: notification.key,
                          channel: 'browser' as const,
                          enabled: e.target.checked,
                        }
                        dispatch(setNotificationPref(newPref))

                        const currentNotifications = settings.notifications ?? {}
                        const currentNotificationPref = currentNotifications[notification.key] ?? {
                          browser: false,
                          email: false,
                        }
                        const updatedNotifications = {
                          ...currentNotifications,
                          [notification.key]: {
                            ...currentNotificationPref,
                            browser: e.target.checked,
                          },
                        }

                        void persistSetting('notifications', updatedNotifications)
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </td>
                <td className="py-4 pl-4 text-center">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.notifications?.[notification.key]?.email ?? false}
                      onChange={(e) => {
                        const newPref = {
                          type: notification.key,
                          channel: 'email' as const,
                          enabled: e.target.checked,
                        }
                        dispatch(setNotificationPref(newPref))

                        const currentNotifications = settings.notifications ?? {}
                        const currentNotificationPref = currentNotifications[notification.key] ?? {
                          browser: false,
                          email: false,
                        }
                        const updatedNotifications = {
                          ...currentNotifications,
                          [notification.key]: {
                            ...currentNotificationPref,
                            email: e.target.checked,
                          },
                        }

                        void persistSetting('notifications', updatedNotifications)
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderTabContent = () => {
    const settingsData = getSettingsForTab(activeTab)

    if (activeTab === 'notifications') {
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--heading)] mb-6">
              Push Notification Setup
            </h3>
            <div className="space-y-4">{settingsData.map((setting) => renderSetting(setting))}</div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[color:var(--heading)] mb-6">
              Notification Preferences
            </h3>
            <div className="glass-box">{renderNotificationTable()}</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'account') {
      return (
        <div className="space-y-8">
          {saveStatus && (
            <div className="panel border-[color:var(--color-success)] bg-[color:var(--hover-bg)] text-[color:var(--color-success)]">
              ✅ {saveStatus}
            </div>
          )}
          <div>
            <h3 className="text-xl font-semibold mb-6 text-[color:var(--heading)]">
              Account Information
            </h3>
            <div className="space-y-4">{settingsData.slice(0, 2).map(renderSetting)}</div>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-6 text-[color:var(--heading)]">Security</h3>
            <div className="space-y-4">
              {settingsData.slice(2).map((setting) => renderSetting(setting))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-[color:var(--heading)] mb-6">
          {settingsTabs.find((tab) => tab.id === activeTab)?.label} Settings
        </h3>
        <div className="space-y-4">{settingsData.map((setting) => renderSetting(setting))}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[color:var(--heading)] mb-2">Settings</h1>
        <p className="text-muted text-lg mb-8">Customize your game experience</p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <div className="panel space-y-2 p-4">
              <nav className="flex flex-col gap-2">
                {settingsTabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`nav-item w-full justify-start ${
                      activeTab === tab.id ? 'nav-item-active' : 'text-[color:var(--text-muted)]'
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <div className="panel">{renderTabContent()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
