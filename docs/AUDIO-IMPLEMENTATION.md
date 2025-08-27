# 🎵 Audio System Implementation

## Current Implementation Status

### ✅ Completed Features

1. **Core Audio Service** (`frontend/src/services/audioService.ts`)
   - Howler.js integration for cross-browser audio support
   - Volume control system (master, effects, music)
   - Preference persistence with localStorage
   - Tab visibility handling (pauses when tab not focused)
   - Mute toggle functionality
   - Singleton pattern for global access

2. **Settings Integration**
   - Audio tab in Settings page with working controls:
     - Master enable/disable toggle
     - Master volume slider (0-100)
     - Effects volume slider (0-100)
     - Music volume slider (0-100)
     - Test buttons for effects and music
   - All settings persist across sessions

3. **Game Event Integration**
   - **Battle sounds**:
     - `dice.mp3` - Plays when attack occurs
     - `victory.mp3` - Plays when player wins a battle
     - `defeat.mp3` - Plays when player loses a battle
     - `capture.mp3` - Plays when territory is conquered
   - **Game flow sounds**:
     - `gamestart.mp3` - Plays when game begins
     - `yourturn.mp3` - Plays when it becomes your turn
   - **Background music**:
     - Starts when game begins
     - Rotates through 5 tracks every 5 minutes
     - Fades between tracks

4. **UI Controls**
   - Mute button in GameRoom header
   - Visual feedback (🔊/🔇 icons)
   - Quick toggle without opening settings

5. **Placeholder Audio Files**
   - Created silent WAV placeholders for all effects
   - Located in `frontend/public/sounds/effects/` and `/music/`
   - Ready to be replaced with actual audio files

## 🚧 Future Work Required

### 1. **Actual Audio Files**
Replace placeholder files with real audio:
- **Sound Effects** (royalty-free or custom):
  - `dice.mp3` - Actual dice rolling sound
  - `victory.mp3` - Triumphant fanfare
  - `defeat.mp3` - Somber defeat sound
  - `capture.mp3` - Flag planting or territory claim sound
  - `eliminated.mp3` - Dramatic elimination sound
  - `gamestart.mp3` - War horn or battle call
  - `yourturn.mp3` - Notification bell or chime
  - `message.mp3` - Subtle pop for chat messages
  - `error.mp3` - Error buzzer for invalid moves

- **Background Music** (5 epic orchestral tracks):
  - Use Suno AI or royalty-free sources
  - Varying intensity levels
  - Loop-friendly compositions
  - Consider dynamic intensity based on game state

### 2. **Audio Sprite Implementation**
For better performance:
```javascript
// Combine short sounds into one file
const audioSprite = new Howl({
  src: ['sounds/sprite.mp3'],
  sprite: {
    dice: [0, 1000],
    victory: [1000, 2000],
    defeat: [3000, 1500],
    // etc...
  }
});
```

### 3. **Additional Sound Events**
- Chat message received (`message.mp3`)
- Invalid move attempted (`error.mp3`)
- Player eliminated (`eliminated.mp3`)
- Game won (special victory fanfare)
- Game lost (defeat music)

### 4. **Dynamic Music System**
- Increase tempo/intensity during large battles
- Special tracks for final showdowns
- Victory/defeat specific music
- Ambient music for waiting/lobby

### 5. **Mobile Optimizations**
- Detect silent mode on iOS/Android
- Handle autoplay restrictions
- Optimize file sizes for mobile data
- Test on various devices

### 6. **Advanced Features**
- Per-player sound preferences
- Custom sound pack support
- Positional audio for battles (left/right based on map position)
- Sound effect variations to avoid repetition
- Volume ducking (lower music during effects)

## 📁 File Structure
```
frontend/
├── src/
│   └── services/
│       └── audioService.ts      # Core audio service
├── public/
│   └── sounds/
│       ├── effects/
│       │   ├── dice.mp3        # Dice roll sound
│       │   ├── victory.mp3     # Battle victory
│       │   ├── defeat.mp3      # Battle defeat
│       │   ├── capture.mp3     # Territory captured
│       │   ├── eliminated.mp3  # Player eliminated
│       │   ├── gamestart.mp3   # Game start
│       │   ├── yourturn.mp3    # Turn notification
│       │   ├── message.mp3     # Chat message (future)
│       │   └── error.mp3       # Invalid move (future)
│       └── music/
│           ├── track1.mp3      # Background music 1
│           ├── track2.mp3      # Background music 2
│           ├── track3.mp3      # Background music 3
│           ├── track4.mp3      # Background music 4
│           └── track5.mp3      # Background music 5
```

## 🎮 Usage

### For Players
1. Open Settings → Audio tab
2. Enable sounds with master toggle
3. Adjust volume sliders to preference
4. Test sounds with test buttons
5. Use mute button in game for quick toggle

### For Developers

#### Adding New Sound Effects
```typescript
// 1. Add to SOUND_EFFECTS in audioService.ts
private readonly SOUND_EFFECTS = {
  // ... existing sounds
  newSound: '/sounds/effects/newSound.mp3',
};

// 2. Play the sound in your component
import audioService from '../services/audioService';
audioService.playEffect('newSound');
```

#### Integrating with Game Events
```typescript
// Example: Play sound on specific socket event
socket.on('someEvent', (data) => {
  audioService.playEffect('effectName');
  // ... handle event
});
```

## 🐛 Known Issues
1. Placeholder files are silent - need real audio
2. Mobile silent mode detection needs testing
3. Some browsers may block autoplay until user interaction

## 📊 Performance Considerations
- All sounds preload on app start
- Tab visibility API prevents unnecessary playback
- Volume changes apply immediately without reload
- Music tracks lazy-load to reduce initial bundle

## 🔧 Testing
1. Test volume controls in Settings
2. Verify mute button works in game
3. Check that sounds play for correct events
4. Ensure preferences persist after refresh
5. Test tab switching pauses/resumes music
6. Verify no console errors for missing files

## 🎯 Success Metrics
- [ ] All game events have appropriate sounds
- [ ] Volume controls work smoothly
- [ ] No performance degradation
- [ ] Works on mobile devices
- [ ] Settings persist across sessions
- [ ] Players can easily mute/unmute

## 📚 Resources
- [Howler.js Documentation](https://howlerjs.com/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Freesound.org](https://freesound.org/) - Free sound effects
- [OpenGameArt](https://opengameart.org/art-search-advanced?field_art_type_tid[]=13) - Game audio
- [Suno AI](https://suno.ai/) - AI music generation