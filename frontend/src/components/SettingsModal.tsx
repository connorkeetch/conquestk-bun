import type React from 'react'
import { useEffect, useRef, useState } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab =
  | 'account'
  | 'game'
  | 'audio'
  | 'display'
  | 'notifications'
  | 'privacy'
  | 'advanced'

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle keyboard shortcuts and escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Handle clicking outside modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const settingsTabs = [
    { id: 'account' as SettingsTab, label: 'Account', icon: '👤' },
    { id: 'game' as SettingsTab, label: 'Game', icon: '🎮' },
    { id: 'audio' as SettingsTab, label: 'Audio', icon: '🔊' },
    { id: 'display' as SettingsTab, label: 'Display', icon: '🖥️' },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: '🔔' },
    { id: 'privacy' as SettingsTab, label: 'Privacy', icon: '🛡️' },
    { id: 'advanced' as SettingsTab, label: 'Advanced', icon: '⚙️' },
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'account':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Account Information</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Username</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-violet focus:border-transparent transition-all"
                    placeholder="Enter username"
                    defaultValue="Player123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Email</label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-violet focus:border-transparent transition-all"
                    placeholder="Enter email"
                    defaultValue="player@example.com"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Avatar</h3>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold">
                  P
                </div>
                <div>
                  <button className="px-3 py-1 bg-surface-2 hover:bg-gray-600 text-white text-sm font-medium rounded-lg mb-2 transition-colors">
                    📁 Upload New Avatar
                  </button>
                  <p className="text-xs text-muted">Recommended: 256x256px, JPG or PNG</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Security</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-surface-2 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors text-left">
                  🔑 Change Password
                </button>
                <button className="w-full px-4 py-2 bg-surface-2 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors text-left">
                  📱 Two-Factor Authentication
                </button>
                <button className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-left">
                  🗑️ Delete Account
                </button>
              </div>
            </div>
          </div>
        )

      case 'game':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Gameplay Preferences</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Auto-end Turn</label>
                    <p className="text-xs text-muted">
                      Automatically end turn when no moves available
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">
                      Show Attack Animations
                    </label>
                    <p className="text-xs text-muted">
                      Display dice rolling and battle animations
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Fast Battle Mode</label>
                    <p className="text-xs text-muted">
                      Skip individual dice animations for faster gameplay
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Turn Timer</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Default Turn Time (seconds)
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="60">60 seconds</option>
                    <option value="120" selected>
                      120 seconds
                    </option>
                    <option value="180">180 seconds</option>
                    <option value="300">300 seconds</option>
                    <option value="0">No limit</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Map Preferences</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Preferred Map Style
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="classic">Classic Risk</option>
                    <option value="custom" selected>
                      Custom Maps
                    </option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )

      case 'audio':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Volume Controls</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Master Volume
                  </label>
                  <input type="range" className="w-full" min="0" max="100" defaultValue="75" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Sound Effects
                  </label>
                  <input type="range" className="w-full" min="0" max="100" defaultValue="60" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Background Music
                  </label>
                  <input type="range" className="w-full" min="0" max="100" defaultValue="40" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Voice Chat</label>
                  <input type="range" className="w-full" min="0" max="100" defaultValue="80" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Audio Preferences</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Mute When Minimized</label>
                    <p className="text-xs text-muted">
                      Automatically mute when game window is not active
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">
                      Battle Sound Effects
                    </label>
                    <p className="text-xs text-muted">Play sounds during dice battles</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
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
                <div className="border border-border rounded-lg p-3 cursor-pointer hover:border-violet transition-colors bg-surface-1">
                  <div className="w-full h-8 bg-gradient-to-r from-gray-800 to-gray-900 rounded mb-2"></div>
                  <p className="text-sm text-center">Dark (Current)</p>
                </div>
                <div className="border border-border rounded-lg p-3 cursor-pointer hover:border-violet transition-colors">
                  <div className="w-full h-8 bg-gradient-to-r from-gray-100 to-gray-200 rounded mb-2"></div>
                  <p className="text-sm text-center">Light</p>
                </div>
                <div className="border border-border rounded-lg p-3 cursor-pointer hover:border-violet transition-colors">
                  <div className="w-full h-8 bg-gradient-to-r from-blue-800 to-purple-800 rounded mb-2"></div>
                  <p className="text-sm text-center">Gaming</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Display Options</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Fullscreen Mode</label>
                    <p className="text-xs text-muted">Use fullscreen for immersive gaming</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">High Contrast Mode</label>
                    <p className="text-xs text-muted">Increase contrast for better visibility</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Reduce Motion</label>
                    <p className="text-xs text-muted">Minimize animations and transitions</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Map Display</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Territory Label Size
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="small">Small</option>
                    <option value="medium" selected>
                      Medium
                    </option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">
                      Show Territory Names
                    </label>
                    <p className="text-xs text-muted">Display territory names on map</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Game Notifications</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Turn Notifications</label>
                    <p className="text-xs text-muted">Get notified when it's your turn</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Game Invitations</label>
                    <p className="text-xs text-muted">Receive notifications for game invites</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Game Ended</label>
                    <p className="text-xs text-muted">Notification when games you're in end</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Social Notifications</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Friend Requests</label>
                    <p className="text-xs text-muted">Notifications for new friend requests</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Messages</label>
                    <p className="text-xs text-muted">Private message notifications</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Email Notifications</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Weekly Summary</label>
                    <p className="text-xs text-muted">Receive weekly gameplay statistics</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Tournament Updates</label>
                    <p className="text-xs text-muted">Get notified about tournaments</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Profile Visibility</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Profile Visibility
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="public" selected>
                      Public - Anyone can view
                    </option>
                    <option value="friends">Friends Only</option>
                    <option value="private">Private - Hidden</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">
                      Show Game Statistics
                    </label>
                    <p className="text-xs text-muted">
                      Allow others to see your win/loss record
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Show Online Status</label>
                    <p className="text-xs text-muted">Let friends see when you're online</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Communication</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Who can message you
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="everyone">Everyone</option>
                    <option value="friends" selected>
                      Friends Only
                    </option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Who can invite you to games
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="everyone" selected>
                      Everyone
                    </option>
                    <option value="friends">Friends Only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Data & Analytics</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Gameplay Analytics</label>
                    <p className="text-xs text-muted">Help improve the game with usage data</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Performance Metrics</label>
                    <p className="text-xs text-muted">
                      Share performance data to help optimize the game
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'advanced':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Performance</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Graphics Quality
                  </label>
                  <select className="w-full px-4 py-3 bg-surface-2/50 border border-border rounded-lg text-white focus:ring-2 focus:ring-violet focus:border-transparent transition-all">
                    <option value="low">Low</option>
                    <option value="medium" selected>
                      Medium
                    </option>
                    <option value="high">High</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">
                      Hardware Acceleration
                    </label>
                    <p className="text-xs text-muted">
                      Use GPU for rendering (requires restart)
                    </p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Enable V-Sync</label>
                    <p className="text-xs text-muted">Synchronize frame rate with display</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Developer Options</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Debug Mode</label>
                    <p className="text-xs text-muted">Show additional debug information</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-sm font-medium text-muted">Console Logging</label>
                    <p className="text-xs text-muted">Enable detailed console logs</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Data Management</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-surface-2 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors text-left">
                  📊 Export Game Data
                </button>
                <button className="w-full px-4 py-2 bg-surface-2 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors text-left">
                  💾 Backup Settings
                </button>
                <button className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-left">
                  🗑️ Clear Cache
                </button>
                <button className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-left">
                  ⚠️ Reset All Settings
                </button>
              </div>
            </div>
          </div>
        )

      default:
        return <div>Settings content not found</div>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
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
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-violet text-white'
                        : 'text-muted hover:bg-surface-1 hover:text-white'
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
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface-2 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-violet hover:bg-violet text-white font-medium rounded-lg transition-colors"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
