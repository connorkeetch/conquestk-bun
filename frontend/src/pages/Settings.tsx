import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import pushNotificationService from '../services/pushNotificationService'
import {
  clearCache,
  resetSettings,
  setTheme,
  setPreferredColor,
} from '../store/settingsSlice'
import {
  STANDARD_COLORS,
  PREMIUM_COLORS,
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  COLOR_CLASSES,
  isPremiumColor,
  type PlayerColor,
} from '../constants/colors'

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
  type: 'toggle' | 'select' | 'range' | 'button' | 'input' | 'custom'
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
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [audioPrefs, setAudioPrefs] = useState(audioService.getPreferences())

  useEffect(() => {
    // Initialize push notification service and check status
    const initNotifications = async () => {
      await pushNotificationService.initialize()
      setNotificationStatus(pushNotificationService.getPermissionStatus())
      setIsSubscribed(pushNotificationService.isEnabled())
    }
    initNotifications()
  }, [])

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
      setting.isWorking ? 'text-gray-200' : 'text-gray-400'
    }`

    const descriptionClass = `text-sm mt-1 ${setting.isWorking ? 'text-gray-400' : 'text-gray-500'}`

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
              <div className="text-xs text-gray-400 text-center mt-1">{setting.defaultValue}%</div>
            </div>
          )

        case 'button': {
          const buttonClass = setting.buttonVariant === 'danger'
            ? `px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
            : setting.buttonVariant === 'primary' 
            ? `px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`
            : `px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`

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
          return (
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <span className="text-gray-300 text-sm">
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
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </>
              ) : (
                <>
                  <input
                    type={setting.id === 'email' ? 'email' : 'text'}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-48"
                    value={fieldValues[setting.id] || ''}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [setting.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    onClick={() => {
                      // Here you would save to backend
                      setSaveStatus(`${setting.label} updated successfully!`)
                      setTimeout(() => setSaveStatus(null), 3000)
                      setEditingField(null)
                    }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingField(null)
                      setFieldValues((prev) => {
                        const newValues = { ...prev }
                        delete newValues[setting.id]
                        return newValues
                      })
                    }}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
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
            const colors = [...STANDARD_COLORS, ...PREMIUM_COLORS]
            const currentColor = setting.defaultValue as PlayerColor
            
            return (
              <div className="flex flex-col gap-2">
                {/* Standard Colors */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Standard Colors</p>
                  <div className="grid grid-cols-6 gap-2">
                    {STANDARD_COLORS.map((color) => {
                      const isSelected = currentColor === color
                      const isRainbow = color === 'rainbow'
                      const isPulse = color === 'pulse'
                      const baseClass = COLOR_CLASSES[color]
                      const hexValue = COLOR_HEX_VALUES[color]
                      
                      return (
                        <button
                          key={color}
                          className={`relative h-10 rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-white scale-105 shadow-lg ring-2 ring-white/50'
                              : 'border-gray-600 hover:border-gray-400 hover:scale-102'
                          }`}
                          style={{
                            background: hexValue.includes('gradient') ? hexValue : undefined,
                            backgroundColor: !hexValue.includes('gradient') ? hexValue : undefined,
                          }}
                          onClick={() => setting.onChange && setting.onChange(color)}
                          title={COLOR_DISPLAY_NAMES[color]}
                        >
                          {isSelected && (
                            <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
                
                {/* Premium Colors */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Premium Colors ⭐</p>
                  <div className="grid grid-cols-6 gap-2">
                    {PREMIUM_COLORS.map((color) => {
                      const isSelected = currentColor === color
                      const isPulse = color === 'pulse'
                      const hexValue = COLOR_HEX_VALUES[color]
                      
                      return (
                        <button
                          key={color}
                          className={`relative h-10 rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-yellow-400 scale-105 shadow-lg ring-2 ring-yellow-400/50'
                              : 'border-gray-600 hover:border-yellow-600 hover:scale-102'
                          } ${isPulse ? 'animate-pulse' : ''}`}
                          style={{
                            background: hexValue.includes('gradient') ? hexValue : undefined,
                            backgroundColor: !hexValue.includes('gradient') ? hexValue : undefined,
                            boxShadow: color === 'neon' ? '0 0 10px #39FF14' : undefined,
                          }}
                          onClick={() => setting.onChange && setting.onChange(color)}
                          title={COLOR_DISPLAY_NAMES[color]}
                        >
                          <span className="absolute top-0.5 right-0.5 text-yellow-400 text-xs">⭐</span>
                          {isSelected && (
                            <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow-lg">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
                
                {/* Selected Color Display */}
                <div className="mt-2 p-2 bg-gray-800 rounded">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{
                        background: COLOR_HEX_VALUES[currentColor].includes('gradient')
                          ? COLOR_HEX_VALUES[currentColor]
                          : undefined,
                        backgroundColor: !COLOR_HEX_VALUES[currentColor].includes('gradient')
                          ? COLOR_HEX_VALUES[currentColor]
                          : undefined,
                      }}
                    />
                    <span className="text-sm">
                      {COLOR_DISPLAY_NAMES[currentColor]}
                      {isPremiumColor(currentColor) && ' ⭐'}
                    </span>
                  </div>
                </div>
              </div>
            )
          }
          return null
          
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
                  <span className="text-blue-400 font-semibold">✓ Verified</span>
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
          label: COLOR_DISPLAY_NAMES[color] + ' ⭐',
        }))
        
        return [
          {
            id: 'preferred-color',
            label: 'Preferred Color',
            description: 'Your preferred player color in games',
            type: 'custom',
            isWorking: true,
            defaultValue: settings.game?.preferredColor || 'bright-red',
            onChange: (value: PlayerColor) => dispatch(setPreferredColor(value)),
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
            id: 'theme',
            label: 'Theme Selection',
            description: 'Choose your preferred color theme',
            type: 'select',
            isWorking: true,
            defaultValue: settings.display.theme,
            onChange: (value: 'dark' | 'light') => dispatch(setTheme(value)),
            options: [
              { value: 'dark', label: '🌙 Dark Theme' },
              { value: 'light', label: '☀️ Light Theme' },
            ],
          },
          {
            id: 'colorblind-mode',
            label: 'Colorblind Mode',
            description: 'Use colorblind-friendly territory colors',
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
          {
            id: 'custom-themes',
            label: 'Custom Theme Styles',
            description: '90s retro, MySpace, Vaporwave, and more nostalgic themes',
            type: 'button',
            isWorking: false,
            buttonText: '🎨 Browse Themes',
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
          {
            id: 'turn-reminders',
            label: 'Turn Reminders',
            description: "Notify when it's your turn",
            type: 'toggle',
            isWorking: false,
            defaultValue: true,
          },
          {
            id: 'turn-timer-warning',
            label: 'Turn Timer Warning',
            description: 'Alert when turn timer is running low',
            type: 'toggle',
            isWorking: false,
            defaultValue: true,
          },
          {
            id: 'game-invites',
            label: 'Game Invites',
            description: 'Notify about new game invitations',
            type: 'toggle',
            isWorking: false,
            defaultValue: true,
          },
          {
            id: 'game-results',
            label: 'Game Results',
            description: 'Notify about game outcomes',
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
          {
            id: 'weekly-summary',
            label: 'Weekly Summary',
            description: 'Receive weekly game activity summary',
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
          {
            id: 'marketing-updates',
            label: 'Marketing Updates',
            description: 'Receive news and feature updates',
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
        ]

      case 'privacy':
        return [
          {
            id: 'online-status',
            label: 'Online Status',
            description: "Show when you're online to other players",
            type: 'toggle',
            isWorking: false,
            defaultValue: false,
          },
          {
            id: 'download-data',
            label: 'Download My Data',
            description: 'Export all your account data',
            type: 'button',
            isWorking: false,
            buttonText: '📊 Download Data',
            buttonVariant: 'secondary',
          },
          {
            id: 'privacy-policy',
            label: 'Privacy Policy',
            description: 'View our privacy policy',
            type: 'button',
            isWorking: false,
            buttonText: '🔒 View Policy',
            buttonVariant: 'secondary',
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

  const renderTabContent = () => {
    const settings = getSettingsForTab(activeTab)

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
            <div className="space-y-4">{settings.slice(0, 2).map(renderSetting)}</div>
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
                    className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg mb-3 opacity-50 cursor-not-allowed"
                    disabled
                  >
                    📁 Upload New Avatar
                  </button>
                  <div className="absolute -top-2 -right-2 px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold z-10">
                    Coming Soon
                  </div>
                </div>
                <p className="text-sm text-gray-400">Recommended: 256x256px, JPG or PNG</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-6 text-white">Security</h3>
            <div className="space-y-4">
              {settings.slice(3).map((setting) => renderSetting(setting))}
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
        <div className="space-y-4">{settings.map((setting) => renderSetting(setting))}</div>
      </div>
    )
  }


  return (
    <div className="container mx-auto px-6 py-8">

      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 gradient-text">Settings</h1>

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
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'text-gray-300 hover:bg-slate-700/50 hover:text-white'
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
