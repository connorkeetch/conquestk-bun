import { normalizeThemeId } from '@conquestk/shared/types/themes'
import type React from 'react'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { applyTheme, storeTheme, THEMES } from '../config/themes.config'
import type { PlayerColor } from '../constants/colors'
import {
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  isPremiumColor,
  PREMIUM_COLORS,
  STANDARD_COLORS,
} from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import {
  setColorblindMode,
  setColorTheme,
  setPerformanceMode,
  setPreferredColor,
} from '../store/settingsSlice'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'audio' | 'display' | 'game' | 'keyboard'

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((state) => state.settings)
  const { user } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio')
  const modalRef = useRef<HTMLDivElement>(null)

  // Generate unique IDs for form elements
  const masterVolumeId = useId()
  const sfxVolumeId = useId()
  const musicVolumeId = useId()
  const muteAllId = useId()
  const colorblindModeId = useId()
  const performanceModeId = useId()

  // Audio state (managed by audioService)
  const [audioPrefs, setAudioPrefs] = useState(() => audioService.getPreferences())
  const [isMuted, setIsMuted] = useState(() => audioService.isMutedState())

  // Handle keyboard shortcuts and escape key
  const onEscape = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onEscape])

  // Handle clicking outside modal
  const onOutsideClick = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onOutsideClick()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onOutsideClick])

  if (!isOpen) return null

  const settingsTabs = [
    { id: 'audio' as SettingsTab, label: 'Audio', icon: '🔊' },
    { id: 'display' as SettingsTab, label: 'Display', icon: '🖥️' },
    { id: 'game' as SettingsTab, label: 'Game', icon: '🎮' },
    { id: 'keyboard' as SettingsTab, label: 'Keyboard', icon: '⌨️' },
  ]

  // Audio handlers
  const handleMasterVolumeChange = (value: number) => {
    audioService.setVolume('master', value)
    setAudioPrefs(audioService.getPreferences())
  }

  const handleSFXVolumeChange = (value: number) => {
    audioService.setVolume('effects', value)
    setAudioPrefs(audioService.getPreferences())
  }

  const handleMusicVolumeChange = (value: number) => {
    audioService.setVolume('music', value)
    setAudioPrefs(audioService.getPreferences())
  }

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
  }

  // Display handlers
  const handleThemeChange = (themeId: string) => {
    const normalized = normalizeThemeId(themeId)
    applyTheme(normalized)
    storeTheme(normalized)
    dispatch(setColorTheme(normalized))
  }

  const handleColorblindToggle = (enabled: boolean) => {
    dispatch(setColorblindMode(enabled))
  }

  const handlePerformanceToggle = (enabled: boolean) => {
    dispatch(setPerformanceMode(enabled))
  }

  // Game handlers
  const handlePreferredColorChange = (color: PlayerColor) => {
    dispatch(setPreferredColor(color))
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'audio':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Volume Controls</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor={masterVolumeId} className="text-sm font-medium text-muted">
                      Master Volume
                    </label>
                    <span className="text-sm text-muted">{audioPrefs.masterVolume}%</span>
                  </div>
                  <input
                    id={masterVolumeId}
                    type="range"
                    className="w-full"
                    min="0"
                    max="100"
                    value={audioPrefs.masterVolume}
                    onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor={sfxVolumeId} className="text-sm font-medium text-muted">
                      Sound Effects
                    </label>
                    <span className="text-sm text-muted">{audioPrefs.effectsVolume}%</span>
                  </div>
                  <input
                    id={sfxVolumeId}
                    type="range"
                    className="w-full"
                    min="0"
                    max="100"
                    value={audioPrefs.effectsVolume}
                    onChange={(e) => handleSFXVolumeChange(Number(e.target.value))}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor={musicVolumeId} className="text-sm font-medium text-muted">
                      Background Music
                    </label>
                    <span className="text-sm text-muted">{audioPrefs.musicVolume}%</span>
                  </div>
                  <input
                    id={musicVolumeId}
                    type="range"
                    className="w-full"
                    min="0"
                    max="100"
                    value={audioPrefs.musicVolume}
                    onChange={(e) => handleMusicVolumeChange(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Audio Preferences</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label htmlFor={muteAllId} className="text-sm font-medium text-muted">
                      Mute All Audio
                    </label>
                    <p className="text-xs text-muted">Quickly silence all game sounds</p>
                  </div>
                  <label className="toggle">
                    <input
                      id={muteAllId}
                      type="checkbox"
                      checked={isMuted}
                      onChange={handleToggleMute}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'display':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Theme</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleThemeChange(theme.id)}
                    className={`border rounded-lg p-3 cursor-pointer hover:border-primary transition-colors ${
                      settings.display.theme === theme.id
                        ? 'border-primary bg-surface-2'
                        : 'border-border'
                    }`}
                  >
                    <div
                      className="w-full h-8 rounded mb-2"
                      style={{
                        background: theme.displayColor,
                      }}
                    />
                    <p className="text-sm text-center">{theme.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Display Options</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label htmlFor={colorblindModeId} className="text-sm font-medium text-muted">
                      Colorblind Mode
                    </label>
                    <p className="text-xs text-muted">Use patterns in addition to colors</p>
                  </div>
                  <label className="toggle">
                    <input
                      id={colorblindModeId}
                      type="checkbox"
                      checked={settings.display.colorblindMode || false}
                      onChange={(e) => handleColorblindToggle(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label htmlFor={performanceModeId} className="text-sm font-medium text-muted">
                      Performance Mode
                    </label>
                    <p className="text-xs text-muted">Reduce animations for better performance</p>
                  </div>
                  <label className="toggle">
                    <input
                      id={performanceModeId}
                      type="checkbox"
                      checked={settings.performance.mode || false}
                      onChange={(e) => handlePerformanceToggle(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'game':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Standard Colors</h3>
              <p className="text-sm text-muted mb-4">
                Choose your default player color for new games
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {STANDARD_COLORS.map((color) => {
                  const hexValue = COLOR_HEX_VALUES[color]
                  const displayName = COLOR_DISPLAY_NAMES[color]
                  const isSelected = settings.game.preferredColor === color

                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handlePreferredColorChange(color)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-primary bg-surface-2 shadow-lg'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div
                        className="w-12 h-12 rounded-full border-2 border-white/20"
                        style={{ background: hexValue }}
                      />
                      <span className="text-xs text-center">{displayName}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                Premium Colors <span className="text-amber-400">⭐</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {PREMIUM_COLORS.map((color) => {
                  const hexValue = COLOR_HEX_VALUES[color]
                  const displayName = COLOR_DISPLAY_NAMES[color]
                  const isSelected = settings.game.preferredColor === color
                  const premium = isPremiumColor(color)
                  const isPremiumUser = Boolean(
                    user?.isVip ||
                      (user?.premiumTier && user.premiumTier !== 'free') ||
                      user?.isPremium,
                  )
                  const disabled = !isPremiumUser

                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        if (!disabled) handlePreferredColorChange(color)
                      }}
                      disabled={disabled}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all relative ${
                        isSelected
                          ? 'border-amber-400 bg-surface-2 shadow-lg shadow-amber-400/20'
                          : disabled
                            ? 'border-border opacity-60 cursor-not-allowed'
                            : 'border-border hover:border-amber-400/50'
                      } ${premium ? 'relative' : ''}`}
                      title={disabled ? `${displayName} (Premium Required)` : displayName}
                    >
                      <div
                        className="w-12 h-12 rounded-full border-2"
                        style={{
                          background: hexValue,
                          borderColor: premium ? '#FBBF24' : 'rgba(255, 255, 255, 0.2)',
                        }}
                      />
                      <span className="text-xs text-center">{displayName}</span>
                      {premium && (
                        <span className="absolute top-1 right-1 text-amber-400 text-xs">⭐</span>
                      )}
                      {disabled && (
                        <span className="absolute inset-0 grid place-items-center text-amber-300 text-xs">
                          🔒
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )

      case 'keyboard':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <span className="text-sm">Open Chat</span>
                  <kbd className="px-3 py-1 bg-surface-1 border border-border rounded text-sm">
                    C
                  </kbd>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <span className="text-sm">Open Settings</span>
                  <kbd className="px-3 py-1 bg-surface-1 border border-border rounded text-sm">
                    S
                  </kbd>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <span className="text-sm">Toggle Mute</span>
                  <kbd className="px-3 py-1 bg-surface-1 border border-border rounded text-sm">
                    M
                  </kbd>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <span className="text-sm">End Turn</span>
                  <kbd className="px-3 py-1 bg-surface-1 border border-border rounded text-sm">
                    E
                  </kbd>
                </div>
                <div className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <span className="text-sm">Close Modal</span>
                  <kbd className="px-3 py-1 bg-surface-1 border border-border rounded text-sm">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return <div>Settings content not found</div>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-surface-1 rounded-xl border border-border w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚙️</div>
            <div>
              <h2 className="text-2xl font-bold">Settings</h2>
              <p className="text-muted text-sm">Customize your game experience</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted hidden md:block">
              Press <kbd className="px-2 py-1 bg-surface-2 rounded text-xs">Esc</kbd> to close
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-surface-2 rounded-lg transition-colors text-muted hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-surface-1 border-r border-border flex-shrink-0 overflow-y-auto">
            <div className="p-4">
              <nav className="space-y-1">
                {settingsTabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary text-white'
                        : 'text-muted hover:bg-surface-2 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-8">{renderTabContent()}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-surface-1">
          <div className="text-sm text-muted">Changes are saved automatically</div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-primary hover:brightness-110 text-white font-medium rounded-lg transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
