import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import authService from '../services/authService'
import pushNotificationService from '../services/pushNotificationService'
import { THEMES, getStoredTheme, applyTheme, storeTheme } from '../config/themes.config'
import {
  clearCache,
  resetSettings,
  setTheme,
  setPreferredColor,
  setShowOnlineStatus,
  setDirectMessages,
  setNotificationPref,
  setColorTheme,
  type DMPermission,
  type NotificationPrefs,
  type ColorTheme,
  type StyleTheme,
} from '../store/settingsSlice'
import {
  PLAYER_COLORS,
  PREMIUM_PLAYER_COLORS,
  STANDARD_COLORS,
  PREMIUM_COLORS,
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  COLOR_CLASSES,
  isPremiumColor,
  type PlayerColor,
} from '../constants/colors'
import preferencesService from '../services/preferencesService'

// Color Dropdown Component
function ColorDropdown({ value, onChange }: { value: PlayerColor; onChange: (color: PlayerColor) => void }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
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
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-3 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-all min-w-[240px]"
      >
        {/* Color Hexagon */}
        <div className="relative">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polygon
              points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
              style={{
                fill: (COLOR_HEX_VALUES[value] && COLOR_HEX_VALUES[value].includes('gradient'))
                  ? 'url(#gradient)' 
                  : COLOR_HEX_VALUES[value],
                stroke: isPremiumColor(value) ? '#FBBF24' : '#ffffff50',
                strokeWidth: '1.5',
              }}
            />
            {(COLOR_HEX_VALUES[value] && COLOR_HEX_VALUES[value].includes('gradient')) && (
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: value === 'rainbow' ? '#ff0000' : '#ff00ff' }} />
                  <stop offset="50%" style={{ stopColor: value === 'rainbow' ? '#00ff00' : '#00ffff' }} />
                  <stop offset="100%" style={{ stopColor: value === 'rainbow' ? '#0000ff' : '#ffff00' }} />
                </linearGradient>
              </defs>
            )}
          </svg>
          {value === 'pulse' && (
            <div className="absolute inset-0 animate-pulse">
              <svg width="24" height="24" viewBox="0 0 24 24">
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
        <span className="flex-1 text-left text-white">
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
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute mt-2 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {/* Standard Colors Section */}
          <div className="p-2">
            <div className="text-xs text-muted uppercase tracking-wider px-2 py-1">Standard Colors</div>
            {STANDARD_COLORS.map((color) => {
              const isSelected = value === color
              return (
                <button
                  key={color}
                  onClick={() => {
                    onChange(color)
                    setIsDropdownOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all hover:bg-slate-700 ${
                    isSelected ? 'bg-slate-700' : ''
                  }`}
                >
                  {/* Color Hexagon */}
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <polygon
                      points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                      style={{
                        fill: (COLOR_HEX_VALUES[color] && COLOR_HEX_VALUES[color].includes('gradient'))
                          ? 'url(#gradient-' + color + ')' 
                          : COLOR_HEX_VALUES[color],
                        stroke: isSelected ? '#ffffff' : '#ffffff30',
                        strokeWidth: '1.5',
                      }}
                    />
                    {(COLOR_HEX_VALUES[color] && COLOR_HEX_VALUES[color].includes('gradient')) && (
                      <defs>
                        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" style={{ stopColor: color === 'rainbow' ? '#ff0000' : '#ff00ff' }} />
                          <stop offset="50%" style={{ stopColor: color === 'rainbow' ? '#00ff00' : '#00ffff' }} />
                          <stop offset="100%" style={{ stopColor: color === 'rainbow' ? '#0000ff' : '#ffff00' }} />
                        </linearGradient>
                      </defs>
                    )}
                  </svg>
                  
                  {/* Color Name */}
                  <span className="flex-1 text-left text-gray-200">
                    {COLOR_DISPLAY_NAMES[color]}
                  </span>
                  
                  {/* Selected Check */}
                  {isSelected && (
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          
          {/* Divider */}
          <div className="border-t border-slate-700 my-1" />
          
          {/* Premium Colors Section */}
          <div className="p-2">
            <div className="text-xs text-yellow-400 uppercase tracking-wider px-2 py-1 flex items-center gap-1">
              <span>Premium Colors</span>
              <span>⭐</span>
            </div>
            {PREMIUM_COLORS.map((color) => {
              const isSelected = value === color
              return (
                <button
                  key={color}
                  onClick={() => {
                    onChange(color)
                    setIsDropdownOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all hover:bg-slate-700 ${
                    isSelected ? 'bg-slate-700' : ''
                  }`}
                >
                  {/* Color Hexagon */}
                  <div className="relative">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <polygon
                        points="12,2 20.4,7 20.4,17 12,22 3.6,17 3.6,7"
                        style={{
                          fill: (COLOR_HEX_VALUES[color] && COLOR_HEX_VALUES[color].includes('gradient'))
                            ? 'url(#gradient-' + color + ')' 
                            : COLOR_HEX_VALUES[color],
                          stroke: '#FBBF24',
                          strokeWidth: '1.5',
                          filter: color === 'neon' ? 'drop-shadow(0 0 3px #39FF14)' : undefined,
                        }}
                      />
                      {(COLOR_HEX_VALUES[color] && COLOR_HEX_VALUES[color].includes('gradient')) && (
                        <defs>
                          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style={{ stopColor: '#ff00ff' }} />
                            <stop offset="50%" style={{ stopColor: '#00ffff' }} />
                            <stop offset="100%" style={{ stopColor: '#ffff00' }} />
                          </linearGradient>
                        </defs>
                      )}
                    </svg>
                    {color === 'pulse' && (
                      <div className="absolute inset-0 animate-pulse">
                        <svg width="20" height="20" viewBox="0 0 24 24">
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
                  <span className="flex-1 text-left text-gray-200">
                    {COLOR_DISPLAY_NAMES[color]}
                  </span>
                  
                  
                  {/* Selected Check */}
                  {isSelected && (
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
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
  defaultValue?: any
  options?: { value: string; label: string }[]
  buttonText?: string
  buttonVariant?: 'primary' | 'secondary' | 'danger'
  onChange?: (value: any) => void
  onClick?: () => void
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const { user } = useAppSelector((state) => state.auth)
  const settings = useAppSelector((state) => state.settings)
  const dispatch = useAppDispatch()

  // Get current color theme from centralized config
  const [currentColorTheme, setCurrentColorTheme] = useState<ColorTheme>(() => getStoredTheme() as ColorTheme)
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
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [audioPrefs, setAudioPrefs] = useState(audioService.getPreferences())
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false)

  useEffect(() => {
    // Initialize push notification service and check status
    const initNotifications = async () => {
      await pushNotificationService.initialize()
      setNotificationStatus(pushNotificationService.getPermissionStatus())
      setIsSubscribed(pushNotificationService.isEnabled())
    }
    initNotifications()
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
      const apiUrl = import.meta.env.VITE_API_URL || 
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
      console.error('Error checking username:', error)
      setUsernameAvailable(null)
    } finally {
      setCheckingUsername(false)
    }
  }

  // Update profile (username/email)
  const updateProfile = async (username?: string, email?: string) => {
    setProfileUpdateLoading(true)
    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_URL || 
        (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')
      
      const updateData: any = {}
      if (username) updateData.username = username
      if (email) updateData.email = email
      
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
        // You might want to update the Redux state here too
        return true
      } else {
        setSaveStatus(data.error || 'Failed to update profile')
        setTimeout(() => setSaveStatus(null), 5000)
        return false
      }
    } catch (error) {
      console.error('Profile update error:', error)
      setSaveStatus('Failed to update profile')
      setTimeout(() => setSaveStatus(null), 5000)
      return false
    } finally {
      setProfileUpdateLoading(false)
    }
  }

  // Helper function to persist important settings to server
  const persistSetting = async (settingKey: string, value: any) => {
    try {
      // For theme specifically, use the preferences API
      if (settingKey === 'theme') {
        const success = await preferencesService.updateTheme(value)
        if (success) {
          console.log('✅ Theme persisted to database:', value)
        }
        return
      }
      
      // For other settings, continue using the existing method
      const settingsToSave: any = {}
      
      // Map Redux setting keys to server setting keys
      switch (settingKey) {
        case 'preferredColor':
          settingsToSave.preferredColor = value
          break
        case 'showOnlineStatus':
          settingsToSave.showOnlineStatus = value
          break
        case 'directMessages':
          settingsToSave.directMessages = value
          break
        case 'notifications':
          settingsToSave.notifications = value
          break
        default:
          // Don't persist other settings (like audio settings)
          return
      }

      await authService.updateSettings(settingsToSave)
      console.log('✅ Setting persisted to server:', settingKey, value)
    } catch (error) {
      console.error('Failed to persist setting:', settingKey, error)
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
    const baseContainerClass = `p-4 rounded-lg border transition-all ${
      setting.isWorking
        ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
        : 'bg-slate-800/20 border-slate-700/50 opacity-60'
    }`

    const labelClass = `text-base font-medium ${
      setting.isWorking ? 'text-gray-200' : 'text-muted'
    }`

    const descriptionClass = `text-sm mt-1 ${setting.isWorking ? 'text-muted' : 'text-muted'}`

    const renderComingSoonBadge = () => {
      if (!setting.isWorking) {
        return (
          <div className="absolute -top-2 -right-2 px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold z-10">
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
                checked={setting.defaultValue}
                disabled={!setting.isWorking}
                onChange={(e) => {
                  if (setting.isWorking && setting.onChange) {
                    setting.onChange(e.target.checked)
                  }
                }}
                className={!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}
              />
              <span className={`slider ${!setting.isWorking ? 'opacity-50' : ''}`}></span>
            </label>
          )

        case 'select':
          return (
            <select
              className={`px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm ${
                !setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!setting.isWorking}
              value={setting.defaultValue}
              onChange={(e) => {
                if (setting.isWorking && setting.onChange) {
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
                value={setting.defaultValue}
                disabled={!setting.isWorking}
                onChange={(e) => {
                  if (setting.isWorking && setting.onChange) {
                    setting.onChange(Number(e.target.value))
                  }
                }}
                className={`w-full ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <div className="text-xs text-muted text-center mt-1">{setting.defaultValue}%</div>
            </div>
          )

        case 'button': {
          const buttonClass = setting.buttonVariant === 'danger'
            ? `px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
            : setting.buttonVariant === 'primary' 
            ? `px-4 py-2 bg-primary hover:bg-primary text-white font-medium rounded-lg transition-colors text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
            : `btn-secondary text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`

          return (
            <button
              className={buttonClass}
              disabled={!setting.isWorking}
              onClick={() => {
                if (setting.isWorking && setting.onClick) {
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
                    {fieldValues[setting.id] || setting.defaultValue || 'Not set'}
                  </span>
                  {setting.isWorking && (
                    <button
                      onClick={() => {
                        setEditingField(setting.id)
                        setFieldValues((prev) => ({
                          ...prev,
                          [setting.id]: setting.defaultValue || '',
                        }))
                        // Reset username availability when starting to edit
                        if (isUsername) {
                          setUsernameAvailable(null)
                        }
                      }}
                      className="px-3 py-1 bg-primary hover:bg-primary text-white text-sm rounded transition-colors"
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
                        className={`px-3 py-2 bg-slate-700 border rounded-lg text-white text-sm w-48 ${
                          isUsername && usernameAvailable === false 
                            ? 'border-red-500' 
                            : isUsername && usernameAvailable === true 
                            ? 'border-green-500' 
                            : 'border-slate-600'
                        }`}
                        value={fieldValues[setting.id] || ''}
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
                            <span className="text-green-400">✓</span>
                          ) : usernameAvailable === false ? (
                            <span className="text-red-400">✗</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    
                    {/* Username availability message */}
                    {isUsername && usernameAvailable === false && (
                      <p className="text-red-400 text-xs">
                        {fieldValues[setting.id]?.length < 3 
                          ? 'Username must be at least 3 characters'
                          : 'Username is already taken'
                        }
                      </p>
                    )}
                  </div>
                  
                  <button
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
                      const updateData: any = {}
                      if (isUsername) updateData.username = value
                      if (isEmail) updateData.email = value
                      
                      const success = await updateProfile(
                        isUsername ? value : undefined,
                        isEmail ? value : undefined
                      )
                      
                      if (success) {
                        setEditingField(null)
                        // Reset availability check
                        if (isUsername) {
                          setUsernameAvailable(null)
                        }
                      }
                    }}
                    disabled={profileUpdateLoading || (isUsername && (checkingUsername || usernameAvailable === false))}
                    className="px-3 py-1 bg-success hover:brightness-110 disabled:bg-surface-2 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                  >
                    {profileUpdateLoading ? 'Saving...' : 'Save'}
                  </button>
                  <button
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
                    className="btn-secondary px-3 py-1 text-sm"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )
        }

        case 'custom':
          if (setting.id === 'preferred-color') {
            const currentColor = setting.defaultValue as PlayerColor
            return (
              <ColorDropdown
                value={currentColor}
                onChange={(color) => setting.onChange && setting.onChange(color)}
              />
            )
          }
          return null
          
        case 'color-theme-selector':
          const selectedTheme = THEMES.find(t => t.id === setting.defaultValue) || THEMES[0]
          return (
            <div className="relative" ref={themeDropdownRef}>
              {/* Dropdown Button */}
              <button
                onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                disabled={!setting.isWorking}
                className="flex items-center gap-3 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-all min-w-[240px] disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  {/* Color Circle */}
                  <div 
                    className="w-6 h-6 rounded-full border-2"
                    style={{ 
                      backgroundColor: selectedTheme.displayColor,
                      borderColor: selectedTheme.id === 'light' ? '#e5e7eb' : selectedTheme.displayColor
                    }}
                  />
                  {/* Theme Name */}
                  <span className="flex-1 text-left text-white">
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
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Menu */}
              {isThemeDropdownOpen && (
                <div className="absolute mt-2 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => {
                        if (setting.isWorking && setting.onChange) {
                          setting.onChange(theme.id as ColorTheme)
                        }
                        setIsThemeDropdownOpen(false)
                      }}
                      disabled={!setting.isWorking}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all hover:bg-slate-700"
                    >
                      {/* Color Circle */}
                      <div 
                        className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                        style={{ 
                          backgroundColor: theme.displayColor,
                          borderColor: theme.id === 'light' ? '#e5e7eb' : theme.displayColor
                        }}
                      />
                      {/* Theme Info */}
                      <div className="flex items-center flex-grow">
                        <span className="text-sm font-medium text-white">
                          {theme.name}
                        </span>
                      </div>
                      
                      {/* Selected Check */}
                      {setting.defaultValue === theme.id && (
                        <svg className="w-5 h-5 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
          
        default:
          return null
      }
    }

    return (
      <div key={setting.id} className={`relative ${baseContainerClass}`}>
        {renderComingSoonBadge()}
        <div className="flex justify-between items-center">
          <div className="flex-1 pr-4">
            <label className={labelClass}>{setting.label}</label>
            <p className={descriptionClass}>{setting.description}</p>
          </div>
          <div className="flex-shrink-0">{renderControl()}</div>
        </div>
      </div>
    )
  }

  // Settings data definitions
  const getSettingsForTab = (tab: SettingsTab): SettingItem[] => {
    switch (tab) {
      case 'account':
        return [
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
                  <span className="text-primary-soft font-semibold">✓ Verified</span>
                ) : (
                  <span className="text-red-400 font-semibold">⚠ Not Verified</span>
                )}
              </span>
            ),
            type: 'input',
            isWorking: true,
            defaultValue: user?.email || '',
          },
          {
            id: 'avatar',
            label: 'Upload Avatar',
            description: 'Change your profile picture',
            type: 'button',
            isWorking: false,
            buttonText: '📁 Upload New Avatar',
            buttonVariant: 'secondary',
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
              } catch (error) {
                alert('Error changing password')
              }
            },
          },
          {
            id: 'two-factor',
            label: 'Two-Factor Authentication',
            description: 'Enable 2FA for extra security',
            type: 'button',
            isWorking: false,
            buttonText: '📱 Enable 2FA',
            buttonVariant: 'secondary',
          },
          {
            id: 'delete-account',
            label: 'Delete Account',
            description: 'Permanently delete your account',
            type: 'button',
            isWorking: true,
            buttonText: '🗑️ Delete Account',
            buttonVariant: 'danger',
            onClick: async () => {
              const confirmation = prompt('Type "DELETE" to confirm you want to permanently delete your account:')
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
              } catch (error) {
                alert('Error deleting account')
              }
            },
          },
        ]

      case 'game':
        const standardOptions = STANDARD_COLORS.map((color) => ({
          value: color,
          label: COLOR_DISPLAY_NAMES[color],
        }))
        
        const premiumOptions = PREMIUM_COLORS.map((color) => ({
          value: color,
          label: COLOR_DISPLAY_NAMES[color],
        }))
        
        return [
          {
            id: 'preferred-color',
            label: 'Preferred Color',
            description: 'Your preferred player color in games',
            type: 'custom',
            isWorking: true,
            defaultValue: settings.game?.preferredColor || 'bright-red',
            onChange: async (value: PlayerColor) => {
              dispatch(setPreferredColor(value))
              await persistSetting('preferredColor', value)
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
            onChange: (value: boolean) => {
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
            onChange: (value: number) => {
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
            onChange: (value: number) => {
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
            onChange: (value: number) => {
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

      case 'display':
        return [
          {
            id: 'unified-theme',
            label: 'Theme',
            description: 'Choose your preferred theme - includes light/dark and color options',
            type: 'color-theme-selector',
            isWorking: true,
            defaultValue: currentColorTheme,
            onChange: async (value: ColorTheme) => {
              // Update local state for immediate UI feedback
              setCurrentColorTheme(value)
              // Apply theme immediately through centralized system
              applyTheme(value)
              // Store theme preference through centralized system
              storeTheme(value)
              // Dispatch Redux action
              dispatch(setColorTheme(value))
              // Persist to server
              await persistSetting('theme', value)
            },
          },
          {
            id: 'colorblind-mode',
            label: 'Colorblind Mode',
            description: 'Use colorblind-friendly territory colors',
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
        ]

      case 'notifications':
        return [
          {
            id: 'browser-notifications',
            label: 'Browser Push Notifications',
            description:
              notificationStatus === 'granted'
                ? isSubscribed
                  ? 'Push notifications are enabled'
                  : 'Click to enable push notifications'
                : notificationStatus === 'denied'
                  ? 'Notifications blocked - please enable in browser settings'
                  : 'Enable notifications for game updates',
            type: 'toggle',
            isWorking: true,
            defaultValue: isSubscribed,
            onChange: async (value: boolean) => {
              if (value) {
                const success = await pushNotificationService.subscribe()
                setIsSubscribed(success)
                setNotificationStatus(pushNotificationService.getPermissionStatus())
              } else {
                await pushNotificationService.unsubscribe()
                setIsSubscribed(false)
              }
            },
          },
          {
            id: 'test-notification',
            label: 'Test Notification',
            description: 'Send a test push notification',
            type: 'button',
            isWorking: isSubscribed,
            buttonText: '🔔 Send Test',
            onClick: async () => {
              if (isSubscribed) {
                const response = await fetch('/api/notifications/test', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                  },
                })
                const result = await response.json()
                if (result.success) {
                  alert('Test notification sent! Check your notifications.')
                } else {
                  alert(result.error || 'Failed to send test notification')
                }
              } else {
                alert('Please enable browser notifications first')
              }
            },
          },
        ]

      case 'privacy':
        return [
          {
            id: 'online-status',
            label: 'Show Online Status',
            description: "Let other players see when you're online",
            type: 'toggle',
            isWorking: true,
            defaultValue: settings.privacy?.showOnlineStatus ?? true,
            onChange: async (value: boolean) => {
              dispatch(setShowOnlineStatus(value))
              await persistSetting('showOnlineStatus', value)
            },
          },
          {
            id: 'dm-settings',
            label: 'Direct Messages',
            description: 'Who can send you direct messages',
            type: 'select',
            isWorking: true,
            defaultValue: settings.privacy?.directMessages ?? 'friends',
            onChange: async (value: DMPermission) => {
              dispatch(setDirectMessages(value))
              await persistSetting('directMessages', value)
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

      case 'advanced':
        return [
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
        description: "When it's your turn to play"
      },
      {
        key: 'turnTimerWarning', 
        label: 'Turn Timer Warning',
        description: '10 minutes before turn timeout'
      },
      {
        key: 'gameInvites',
        label: 'Game Invitations', 
        description: 'When someone invites you to play'
      },
      {
        key: 'gameEnded',
        label: 'Game Ended',
        description: 'When a game you\'re in finishes'
      }
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
                      onChange={async (e) => {
                        const newPref = {
                          type: notification.key,
                          channel: 'browser' as const,
                          enabled: e.target.checked
                        }
                        dispatch(setNotificationPref(newPref))
                        
                        // Persist notification preferences
                        const updatedNotifications = { ...settings.notifications }
                        if (!updatedNotifications[notification.key]) {
                          updatedNotifications[notification.key] = { browser: false, email: false }
                        }
                        updatedNotifications[notification.key].browser = e.target.checked
                        await persistSetting('notifications', updatedNotifications)
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
                      onChange={async (e) => {
                        const newPref = {
                          type: notification.key,
                          channel: 'email' as const,
                          enabled: e.target.checked
                        }
                        dispatch(setNotificationPref(newPref))
                        
                        // Persist notification preferences
                        const updatedNotifications = { ...settings.notifications }
                        if (!updatedNotifications[notification.key]) {
                          updatedNotifications[notification.key] = { browser: false, email: false }
                        }
                        updatedNotifications[notification.key].email = e.target.checked
                        await persistSetting('notifications', updatedNotifications)
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
            <h3 className="text-xl font-semibold text-white mb-6">Push Notification Setup</h3>
            <div className="space-y-4">
              {settingsData.map((setting) => renderSetting(setting))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-6">Notification Preferences</h3>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-600">
              {renderNotificationTable()}
            </div>
          </div>
        </div>
      )
    }

    if (activeTab === 'account') {
      return (
        <div className="space-y-8">
          {saveStatus && (
            <div className="p-3 bg-green-600/20 border border-green-500 rounded-lg text-green-400">
              ✅ {saveStatus}
            </div>
          )}
          <div>
            <h3 className="text-xl font-semibold mb-6 text-white">Account Information</h3>
            <div className="space-y-4">{settingsData.slice(0, 2).map(renderSetting)}</div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-6 text-white">Avatar</h3>
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="relative">
                  <button
                    className="btn-secondary opacity-50 cursor-not-allowed mb-3"
                    disabled
                  >
                    📁 Upload New Avatar
                  </button>
                  <div className="absolute -top-2 -right-2 px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold z-10">
                    Coming Soon
                  </div>
                </div>
                <p className="text-sm text-muted">Recommended: 256x256px, JPG or PNG</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-6 text-white">Security</h3>
            <div className="space-y-4">
              {settingsData.slice(3).map((setting) => renderSetting(setting))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-white mb-6">
          {settingsTabs.find((tab) => tab.id === activeTab)?.label} Settings
        </h3>
        <div className="space-y-4">{settingsData.map((setting) => renderSetting(setting))}</div>
      </div>
    )
  }


  return (
    <div className="container mx-auto px-6 py-8">

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-primary-soft mb-2">Settings</h1>
        <p className="text-muted text-lg mb-8">Customize your game experience</p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
              <nav className="space-y-2">
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                      activeTab === tab.id
                        ? 'bg-primary/20 text-primary-soft border border-primary/30'
                        : 'text-muted hover:bg-slate-700/50 hover:text-white'
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
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
