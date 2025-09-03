# User Preferences & Settings Documentation

## Overview
This document covers the user preferences system, settings management, and customization options available in the Risk game application.

## Settings Page Structure

### Account Section
- **Username**: Editable with unique validation
- **Email**: Editable with verification status
- **Password**: Change password with confirmation
- **Delete Account**: Permanent deletion with double confirmation

### Game Preferences
- **Preferred Color**: Default color for game creation
- **Color Selection**: All 12 game colors with premium indicators
- **Auto-assignment**: Color auto-selected in new games

### Display Settings
- **Theme**: Dark/Light mode toggle
- **Sound**: Master volume and sound effects
- **Animations**: Enable/disable UI animations
- **Language**: Interface language selection

## Color System Implementation

### Available Colors
```typescript
const PLAYER_COLORS = [
  { name: 'Red', value: '#DC2626', premium: false },
  { name: 'Blue', value: '#2563EB', premium: false },
  { name: 'Green', value: '#16A34A', premium: false },
  { name: 'Yellow', value: '#EAB308', premium: false },
  { name: 'Purple', value: '#9333EA', premium: false },
  { name: 'Orange', value: '#EA580C', premium: false },
  { name: 'Pink', value: '#EC4899', premium: true },
  { name: 'Cyan', value: '#06B6D4', premium: true },
  { name: 'Lime', value: '#84CC16', premium: true },
  { name: 'Indigo', value: '#4F46E5', premium: true },
  { name: 'Teal', value: '#14B8A6', premium: true },
  { name: 'Black', value: '#000000', premium: true }
]
```

### Color Selection UI
```typescript
// Settings page color grid
<div className="grid grid-cols-6 gap-2">
  {PLAYER_COLORS.map((color) => (
    <button
      key={color.value}
      onClick={() => handleColorSelect(color.value)}
      className={`
        w-12 h-12 rounded-lg border-2 
        ${selected ? 'ring-2 ring-white' : ''}
        ${color.premium ? 'border-yellow-500' : 'border-gray-600'}
      `}
      style={{ backgroundColor: color.value }}
    >
      {color.premium && <span className="text-xs">PRO</span>}
    </button>
  ))}
</div>
```

### Integration with Game Creation
```typescript
// CreateGamePage uses preferred color
const { user } = useAppSelector(state => state.auth)
const defaultColor = user?.settings?.preferredColor || '#DC2626'

// Ensure uniqueness per game
const getAvailableColors = (takenColors: string[]) => {
  return PLAYER_COLORS.filter(c => !takenColors.includes(c.value))
}
```

## Local Storage Management

### Settings Persistence
```typescript
interface UserSettings {
  display: {
    theme: 'dark' | 'light'
    animations: boolean
    soundEnabled: boolean
    volume: number
  }
  game: {
    preferredColor: string
    autoReady: boolean
    showTutorialHints: boolean
  }
  notifications: {
    gameInvites: boolean
    turnReminders: boolean
    friendRequests: boolean
  }
}

// Save to localStorage
const saveSettings = (settings: UserSettings) => {
  localStorage.setItem('userSettings', JSON.stringify(settings))
  // Apply theme immediately
  document.documentElement.setAttribute('data-theme', settings.display.theme)
}

// Load on app start
const loadSettings = (): UserSettings => {
  const saved = localStorage.getItem('userSettings')
  return saved ? JSON.parse(saved) : DEFAULT_SETTINGS
}
```

## Email Verification Status

### Visual Indicators
```typescript
// Settings page email section
<div className="flex items-center gap-2">
  <span>{user.email}</span>
  {user.emailVerified ? (
    <span className="text-blue-500">✓ Verified</span>
  ) : (
    <span className="text-red-500">⚠ Not Verified</span>
  )}
</div>
```

### Verification Integration
- Unverified users see warning in Settings
- Click to navigate to verification page
- Real-time update after verification
- Color-coded for quick recognition

## Account Management

### Password Change Flow
1. User clicks "Change Password" button
2. Modal appears with form fields:
   - Current Password (validated)
   - New Password (min 6 chars)
   - Confirm New Password (must match)
3. Backend validates current password
4. New password hashed and saved
5. Success notification shown

### Account Deletion Flow
1. User clicks "Delete Account" button
2. First confirmation modal:
   - "Are you sure? This cannot be undone."
   - Shows consequences (data loss)
3. Second confirmation:
   - Type username to confirm
   - Final DELETE button
4. Backend soft-deletes user
5. Logout and redirect to home

## Theme System

### Implementation
```typescript
// Theme toggle in Settings
const toggleTheme = () => {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', newTheme)
  updateSettings({ display: { theme: newTheme } })
}

// CSS variables for theming
:root[data-theme="dark"] {
  --bg-primary: #0a0a0a;
  --text-primary: #ffffff;
  --accent: #9333EA;
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #0a0a0a;
  --accent: #7C3AED;
}
```

### Theme-Aware Components
- Buttons adapt text color
- Backgrounds use theme variables
- Icons switch based on theme
- Smooth transitions between themes

## Sound Settings

### Volume Controls
```typescript
interface SoundSettings {
  masterVolume: number // 0-100
  effectsVolume: number // 0-100
  musicVolume: number // 0-100
  soundEnabled: boolean
}

// Apply volume settings
const applyVolume = (settings: SoundSettings) => {
  audioManager.setMasterVolume(settings.masterVolume / 100)
  audioManager.setEffectsVolume(settings.effectsVolume / 100)
  audioManager.setMusicVolume(settings.musicVolume / 100)
}
```

## Data Synchronization

### Backend Sync
```typescript
// Settings saved to database
PUT /api/users/settings
{
  preferredColor: "#2563EB",
  theme: "dark",
  soundEnabled: true,
  // ... other preferences
}

// Loaded with user profile
GET /api/auth/me
Response includes: {
  user: {
    id, username, email,
    settings: { /* all preferences */ }
  }
}
```

### Conflict Resolution
1. Local settings take precedence for display
2. Backend sync on significant changes
3. Merge strategy for conflicts
4. Version tracking for settings

## Privacy & Data

### What's Stored Locally
- Theme preference
- Sound settings
- Temporary UI state
- Session tokens

### What's Synced to Server
- Preferred game color
- Account settings
- Game statistics
- Achievement progress

### Data Retention
- Settings kept indefinitely
- Deleted accounts remove settings
- Export option for data portability
- GDPR compliance for EU users

## Recent Updates (January 2025)

1. **Email Verification Status**
   - Added visual indicator in Settings
   - Blue checkmark for verified
   - Red warning for unverified
   - Direct link to verification page

2. **Game Color Integration**
   - Exact game colors in Settings
   - Premium color indicators
   - Preferred color auto-selection
   - Per-game color uniqueness

3. **UI Improvements**
   - Theme-aware button styling
   - Better edit mode for fields
   - Improved visual hierarchy
   - Consistent color scheme

4. **Account Management**
   - Password change functionality
   - Account deletion with confirmation
   - Better error messaging
   - Loading states for async operations

## Future Enhancements

- [ ] Backup/restore settings
- [ ] Settings profiles (tournament/casual)
- [ ] Keyboard shortcut customization
- [ ] Accessibility options
- [ ] Color blind modes
- [ ] Custom color palettes (premium)
- [ ] Settings sync across devices
- [ ] Beta feature toggles