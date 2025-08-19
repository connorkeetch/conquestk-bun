import React, { useState } from 'react';
import { useAppSelector } from '../hooks/redux';

type SettingsTab = 'account' | 'game' | 'audio' | 'display' | 'notifications' | 'privacy' | 'advanced';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const { user } = useAppSelector((state) => state.auth);

  const settingsTabs = [
    { id: 'account' as SettingsTab, label: 'Account', icon: '👤' },
    { id: 'game' as SettingsTab, label: 'Game', icon: '🎮' },
    { id: 'audio' as SettingsTab, label: 'Audio', icon: '🔊' },
    { id: 'display' as SettingsTab, label: 'Display', icon: '🖥️' },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: '🔔' },
    { id: 'privacy' as SettingsTab, label: 'Privacy', icon: '🛡️' },
    { id: 'advanced' as SettingsTab, label: 'Advanced', icon: '⚙️' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'account':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Account Information</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Username</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                    placeholder="Enter username" 
                    defaultValue={user?.username || ""}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Email</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                    placeholder="Enter email" 
                    defaultValue={user?.email || ""}
                  />
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Avatar</h3>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <button className="btn btn-secondary mb-3">📁 Upload New Avatar</button>
                  <p className="text-sm text-gray-400">Recommended: 256x256px, JPG or PNG</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Security</h3>
              <div className="space-y-4">
                <button className="btn btn-secondary w-full sm:w-auto">
                  🔑 Change Password
                </button>
                <button className="btn btn-secondary w-full sm:w-auto">
                  📱 Two-Factor Authentication
                </button>
                <button className="btn btn-danger w-full sm:w-auto">
                  🗑️ Delete Account
                </button>
              </div>
            </div>
          </div>
        );

      case 'game':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Gameplay Preferences</h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Auto-end Turn</label>
                    <p className="text-sm text-gray-400 mt-1">Automatically end turn when no moves available</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Show Attack Animations</label>
                    <p className="text-sm text-gray-400 mt-1">Display dice rolling and battle animations</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Confirm Attacks</label>
                    <p className="text-sm text-gray-400 mt-1">Show confirmation dialog before attacking</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Turn Timer</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Default Turn Duration</label>
                  <select className="w-full sm:w-auto px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                    <option value="60">1 minute</option>
                    <option value="120" selected>2 minutes</option>
                    <option value="300">5 minutes</option>
                    <option value="600">10 minutes</option>
                    <option value="0">No limit</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Volume Controls</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Master Volume</label>
                  <input type="range" min="0" max="100" defaultValue="75" className="w-full" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Sound Effects</label>
                  <input type="range" min="0" max="100" defaultValue="80" className="w-full" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Background Music</label>
                  <input type="range" min="0" max="100" defaultValue="50" className="w-full" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Audio Preferences</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Dice Roll Sounds</label>
                    <p className="text-sm text-gray-400 mt-1">Play sound effects during battles</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Turn Notifications</label>
                    <p className="text-sm text-gray-400 mt-1">Play sound when it's your turn</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 'display':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Theme</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/30 rounded-lg border-2 border-blue-500 cursor-pointer">
                  <div className="w-full h-16 bg-gradient-to-r from-slate-900 to-slate-800 rounded mb-3"></div>
                  <p className="text-center font-medium text-blue-400">Dark (Current)</p>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-lg border-2 border-transparent hover:border-slate-600 cursor-pointer">
                  <div className="w-full h-16 bg-gradient-to-r from-blue-900 to-purple-900 rounded mb-3"></div>
                  <p className="text-center font-medium">Midnight Blue</p>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-lg border-2 border-transparent hover:border-slate-600 cursor-pointer">
                  <div className="w-full h-16 bg-gradient-to-r from-red-900 to-red-800 rounded mb-3"></div>
                  <p className="text-center font-medium">Crimson</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Map Display</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Show Territory Names</label>
                    <p className="text-sm text-gray-400 mt-1">Display territory names on the map</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Army Count Badges</label>
                    <p className="text-sm text-gray-400 mt-1">Show army numbers on territories</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Game Notifications</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Turn Reminders</label>
                    <p className="text-sm text-gray-400 mt-1">Notify when it's your turn</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Game Invites</label>
                    <p className="text-sm text-gray-400 mt-1">Notify about new game invitations</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Game Results</label>
                    <p className="text-sm text-gray-400 mt-1">Notify about game outcomes</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Email Notifications</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Weekly Summary</label>
                    <p className="text-sm text-gray-400 mt-1">Receive weekly game activity summary</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Marketing Updates</label>
                    <p className="text-sm text-gray-400 mt-1">Receive news and feature updates</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Profile Visibility</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Public Profile</label>
                    <p className="text-sm text-gray-400 mt-1">Make your profile visible to other players</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Show Statistics</label>
                    <p className="text-sm text-gray-400 mt-1">Display your game stats on profile</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Online Status</label>
                    <p className="text-sm text-gray-400 mt-1">Show when you're online</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Data & Privacy</h3>
              <div className="space-y-4">
                <button className="btn btn-secondary w-full sm:w-auto">
                  📊 Download My Data
                </button>
                <button className="btn btn-secondary w-full sm:w-auto">
                  🔒 Privacy Policy
                </button>
                <button className="btn btn-secondary w-full sm:w-auto">
                  📜 Terms of Service
                </button>
              </div>
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Developer Options</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Debug Mode</label>
                    <p className="text-sm text-gray-400 mt-1">Show additional debug information</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg">
                  <div>
                    <label className="text-base font-medium text-gray-200">Beta Features</label>
                    <p className="text-sm text-gray-400 mt-1">Enable experimental features</p>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-6 text-white">Data Management</h3>
              <div className="space-y-4">
                <button className="btn btn-secondary w-full sm:w-auto">
                  🗂️ Clear Cache
                </button>
                <button className="btn btn-secondary w-full sm:w-auto">
                  💾 Export Settings
                </button>
                <button className="btn btn-secondary w-full sm:w-auto">
                  📁 Import Settings
                </button>
                <button className="btn btn-danger w-full sm:w-auto">
                  🔄 Reset All Settings
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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
  );
}