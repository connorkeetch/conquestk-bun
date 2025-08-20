import React, { useState } from 'react';
import { useAppSelector } from '../hooks/redux';

type SettingsTab = 'account' | 'game' | 'audio' | 'display' | 'notifications' | 'privacy' | 'advanced';

interface SettingItem {
  id: string;
  label: string;
  description: string;
  type: 'toggle' | 'select' | 'range' | 'button' | 'input';
  isWorking: boolean;
  defaultValue?: any;
  options?: { value: string; label: string }[];
  buttonText?: string;
  buttonVariant?: 'primary' | 'secondary' | 'danger';
}

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

  // Unified settings renderer
  const renderSetting = (setting: SettingItem) => {
    const baseContainerClass = `p-4 rounded-lg border transition-all ${
      setting.isWorking 
        ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500' 
        : 'bg-slate-800/20 border-slate-700/50 opacity-60'
    }`;

    const labelClass = `text-base font-medium ${
      setting.isWorking ? 'text-gray-200' : 'text-gray-400'
    }`;

    const descriptionClass = `text-sm mt-1 ${
      setting.isWorking ? 'text-gray-400' : 'text-gray-500'
    }`;

    const renderComingSoonBadge = () => {
      if (!setting.isWorking) {
        return (
          <div className="absolute -top-2 -right-2 px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold z-10">
            Coming Soon
          </div>
        );
      }
      return null;
    };

    const renderControl = () => {
      switch (setting.type) {
        case 'toggle':
          return (
            <label className="toggle">
              <input 
                type="checkbox" 
                defaultChecked={setting.defaultValue}
                disabled={!setting.isWorking}
                className={!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}
              />
              <span className={`slider ${!setting.isWorking ? 'opacity-50' : ''}`}></span>
            </label>
          );
        
        case 'select':
          return (
            <select 
              className={`px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm ${
                !setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!setting.isWorking}
            >
              {setting.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        
        case 'range':
          return (
            <div className="w-32">
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue={setting.defaultValue}
                disabled={!setting.isWorking}
                className={`w-full ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <div className="text-xs text-gray-400 text-center mt-1">
                {setting.defaultValue}%
              </div>
            </div>
          );

        case 'button':
          const buttonClass = `btn ${
            setting.buttonVariant === 'danger' ? 'btn-danger' : 'btn-secondary'
          } text-sm ${!setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''}`;
          
          return (
            <button 
              className={buttonClass}
              disabled={!setting.isWorking}
            >
              {setting.buttonText}
            </button>
          );

        case 'input':
          return (
            <input 
              type="text"
              className={`px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-48 ${
                !setting.isWorking ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              defaultValue={setting.defaultValue}
              disabled={!setting.isWorking}
            />
          );

        default:
          return null;
      }
    };

    return (
      <div key={setting.id} className={`relative ${baseContainerClass}`}>
        {renderComingSoonBadge()}
        <div className="flex justify-between items-center">
          <div className="flex-1 pr-4">
            <label className={labelClass}>{setting.label}</label>
            <p className={descriptionClass}>{setting.description}</p>
          </div>
          <div className="flex-shrink-0">
            {renderControl()}
          </div>
        </div>
      </div>
    );
  };

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
            isWorking: true, // Only working setting
            defaultValue: user?.username || ''
          },
          {
            id: 'email',
            label: 'Email Address',
            description: 'Your account email',
            type: 'input',
            isWorking: true, // Only working setting
            defaultValue: user?.email || ''
          },
          {
            id: 'avatar',
            label: 'Upload Avatar',
            description: 'Change your profile picture',
            type: 'button',
            isWorking: false,
            buttonText: '📁 Upload New Avatar'
          },
          {
            id: 'change-password',
            label: 'Change Password',
            description: 'Update your account password',
            type: 'button',
            isWorking: false,
            buttonText: '🔑 Change Password'
          },
          {
            id: 'two-factor',
            label: 'Two-Factor Authentication',
            description: 'Enable 2FA for extra security',
            type: 'button',
            isWorking: false,
            buttonText: '📱 Enable 2FA'
          },
          {
            id: 'delete-account',
            label: 'Delete Account',
            description: 'Permanently delete your account',
            type: 'button',
            isWorking: false,
            buttonText: '🗑️ Delete Account',
            buttonVariant: 'danger'
          }
        ];

      case 'game':
        return [
          {
            id: 'auto-end-turn',
            label: 'Auto-end Turn',
            description: 'Automatically end turn when no moves available',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'show-animations',
            label: 'Show Attack Animations',
            description: 'Display dice rolling and battle animations',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'confirm-attacks',
            label: 'Confirm Attacks',
            description: 'Show confirmation dialog before attacking',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'turn-timer',
            label: 'Default Turn Duration',
            description: 'Set default time limit for turns',
            type: 'select',
            isWorking: false,
            options: [
              { value: '60', label: '1 minute' },
              { value: '120', label: '2 minutes' },
              { value: '300', label: '5 minutes' },
              { value: '600', label: '10 minutes' },
              { value: '0', label: 'No limit' }
            ]
          }
        ];

      case 'audio':
        return [
          {
            id: 'master-volume',
            label: 'Master Volume',
            description: 'Overall audio volume level',
            type: 'range',
            isWorking: false,
            defaultValue: 75
          },
          {
            id: 'sfx-volume',
            label: 'Sound Effects',
            description: 'Volume for game sound effects',
            type: 'range',
            isWorking: false,
            defaultValue: 80
          },
          {
            id: 'music-volume',
            label: 'Background Music',
            description: 'Volume for background music',
            type: 'range',
            isWorking: false,
            defaultValue: 50
          },
          {
            id: 'dice-sounds',
            label: 'Dice Roll Sounds',
            description: 'Play sound effects during battles',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'turn-notifications',
            label: 'Turn Notifications',
            description: 'Play sound when it\'s your turn',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          }
        ];

      case 'display':
        return [
          {
            id: 'theme',
            label: 'Theme Selection',
            description: 'Choose your preferred color theme',
            type: 'button',
            isWorking: false,
            buttonText: '🎨 Change Theme'
          },
          {
            id: 'show-territory-names',
            label: 'Show Territory Names',
            description: 'Display territory names on the map',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'army-count-badges',
            label: 'Army Count Badges',
            description: 'Show army numbers on territories',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          }
        ];

      case 'notifications':
        return [
          {
            id: 'turn-reminders',
            label: 'Turn Reminders',
            description: 'Notify when it\'s your turn',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'game-invites',
            label: 'Game Invites',
            description: 'Notify about new game invitations',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'game-results',
            label: 'Game Results',
            description: 'Notify about game outcomes',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'weekly-summary',
            label: 'Weekly Summary',
            description: 'Receive weekly game activity summary',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'marketing-updates',
            label: 'Marketing Updates',
            description: 'Receive news and feature updates',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          }
        ];

      case 'privacy':
        return [
          {
            id: 'public-profile',
            label: 'Public Profile',
            description: 'Make your profile visible to other players',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'show-statistics',
            label: 'Show Statistics',
            description: 'Display your game stats on profile',
            type: 'toggle',
            isWorking: false,
            defaultValue: true
          },
          {
            id: 'online-status',
            label: 'Online Status',
            description: 'Show when you\'re online',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'download-data',
            label: 'Download My Data',
            description: 'Export your account data',
            type: 'button',
            isWorking: false,
            buttonText: '📊 Download Data'
          },
          {
            id: 'privacy-policy',
            label: 'Privacy Policy',
            description: 'View our privacy policy',
            type: 'button',
            isWorking: false,
            buttonText: '🔒 Privacy Policy'
          }
        ];

      case 'advanced':
        return [
          {
            id: 'debug-mode',
            label: 'Debug Mode',
            description: 'Show additional debug information',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'beta-features',
            label: 'Beta Features',
            description: 'Enable experimental features',
            type: 'toggle',
            isWorking: false,
            defaultValue: false
          },
          {
            id: 'clear-cache',
            label: 'Clear Cache',
            description: 'Clear stored game data',
            type: 'button',
            isWorking: false,
            buttonText: '🗂️ Clear Cache'
          },
          {
            id: 'export-settings',
            label: 'Export Settings',
            description: 'Save your settings to file',
            type: 'button',
            isWorking: false,
            buttonText: '💾 Export Settings'
          },
          {
            id: 'import-settings',
            label: 'Import Settings',
            description: 'Load settings from file',
            type: 'button',
            isWorking: false,
            buttonText: '📁 Import Settings'
          },
          {
            id: 'reset-settings',
            label: 'Reset All Settings',
            description: 'Reset all settings to default',
            type: 'button',
            isWorking: false,
            buttonText: '🔄 Reset All',
            buttonVariant: 'danger'
          }
        ];

      default:
        return [];
    }
  };

  const renderTabContent = () => {
    const settings = getSettingsForTab(activeTab);
    
    if (activeTab === 'account') {
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-6 text-white">Account Information</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-3xl font-bold text-white">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="relative">
                  <button className="btn btn-secondary mb-3 opacity-50 cursor-not-allowed" disabled>
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
              {settings.slice(3).map(setting => renderSetting(setting))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-white mb-6">
          {settingsTabs.find(tab => tab.id === activeTab)?.label} Settings
        </h3>
        <div className="space-y-4">
          {settings.map(setting => renderSetting(setting))}
        </div>
      </div>
    );
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