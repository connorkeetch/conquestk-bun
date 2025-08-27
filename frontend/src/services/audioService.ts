import { Howl, Howler } from 'howler';

interface AudioPreferences {
  enabled: boolean;
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
}

interface SoundEffect {
  name: string;
  howl: Howl | null;
  category: 'effect' | 'music';
}

class AudioService {
  private static instance: AudioService;
  private sounds: Map<string, SoundEffect> = new Map();
  private currentMusic: Howl | null = null;
  private musicTrackIndex: number = 0;
  private musicTimer: NodeJS.Timeout | null = null;
  private preferences: AudioPreferences = {
    enabled: true,
    masterVolume: 50,
    effectsVolume: 70,
    musicVolume: 30,
  };
  private isTabFocused: boolean = true;
  private isMuted: boolean = false;
  private previousVolumes: AudioPreferences | null = null;

  // Sound effect definitions
  private readonly SOUND_EFFECTS = {
    dice: '/sounds/effects/dice.mp3',
    victory: '/sounds/effects/victory.mp3',
    defeat: '/sounds/effects/defeat.mp3',
    capture: '/sounds/effects/capture.mp3',
    eliminated: '/sounds/effects/eliminated.mp3',
    gamestart: '/sounds/effects/gamestart.mp3',
    yourturn: '/sounds/effects/yourturn.mp3',
    message: '/sounds/effects/message.mp3',
    error: '/sounds/effects/error.mp3',
  };

  // Background music tracks
  private readonly MUSIC_TRACKS = [
    '/sounds/music/track1.mp3',
    '/sounds/music/track2.mp3',
    '/sounds/music/track3.mp3',
    '/sounds/music/track4.mp3',
    '/sounds/music/track5.mp3',
  ];

  private constructor() {
    this.loadPreferences();
    this.setupVisibilityListener();
    this.preloadSounds();
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  private loadPreferences(): void {
    const stored = localStorage.getItem('audioPreferences');
    if (stored) {
      try {
        this.preferences = JSON.parse(stored);
        this.applyVolumes();
      } catch (error) {
        console.error('Failed to load audio preferences:', error);
      }
    }
  }

  private savePreferences(): void {
    localStorage.setItem('audioPreferences', JSON.stringify(this.preferences));
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      this.isTabFocused = !document.hidden;
      if (!this.isTabFocused && this.currentMusic) {
        this.currentMusic.pause();
      } else if (this.isTabFocused && this.currentMusic) {
        this.currentMusic.play();
      }
    });
  }

  private preloadSounds(): void {
    // Preload sound effects
    Object.entries(this.SOUND_EFFECTS).forEach(([name, path]) => {
      const howl = new Howl({
        src: [path],
        preload: true,
        volume: this.getEffectiveVolume('effect'),
        onloaderror: (id, error) => {
          console.warn(`Failed to load sound effect ${name}:`, error);
          // Store null to prevent repeated loading attempts
          this.sounds.set(name, { name, howl: null, category: 'effect' });
        },
        onload: () => {
          console.log(`Loaded sound effect: ${name}`);
        },
      });
      this.sounds.set(name, { name, howl, category: 'effect' });
    });
  }

  private getEffectiveVolume(category: 'effect' | 'music'): number {
    if (!this.preferences.enabled || this.isMuted) return 0;
    
    const categoryVolume = category === 'effect' 
      ? this.preferences.effectsVolume 
      : this.preferences.musicVolume;
    
    return (this.preferences.masterVolume / 100) * (categoryVolume / 100);
  }

  private applyVolumes(): void {
    Howler.volume(this.preferences.masterVolume / 100);
    
    // Update all loaded sounds
    this.sounds.forEach((sound) => {
      if (sound.howl) {
        sound.howl.volume(this.getEffectiveVolume(sound.category));
      }
    });

    // Update current music if playing
    if (this.currentMusic) {
      this.currentMusic.volume(this.getEffectiveVolume('music'));
    }
  }

  // Public methods
  public playEffect(effectName: string): void {
    if (!this.preferences.enabled || this.isMuted || !this.isTabFocused) return;

    const sound = this.sounds.get(effectName);
    if (sound?.howl) {
      sound.howl.volume(this.getEffectiveVolume('effect'));
      sound.howl.play();
    } else {
      console.warn(`Sound effect '${effectName}' not found or failed to load`);
    }
  }

  public playMusic(trackIndex?: number): void {
    if (!this.preferences.enabled || this.isMuted) return;

    // Stop current music if playing
    this.stopMusic(true);

    // Select track
    if (trackIndex !== undefined) {
      this.musicTrackIndex = trackIndex % this.MUSIC_TRACKS.length;
    }

    const trackPath = this.MUSIC_TRACKS[this.musicTrackIndex];
    
    this.currentMusic = new Howl({
      src: [trackPath],
      volume: this.getEffectiveVolume('music'),
      loop: false,
      onend: () => {
        // Play next track after current one ends
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length;
        this.playMusic(this.musicTrackIndex);
      },
      onloaderror: (id, error) => {
        console.error(`Failed to load music track ${trackPath}:`, error);
        // Try next track
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length;
        if (this.musicTrackIndex !== trackIndex) {
          this.playMusic(this.musicTrackIndex);
        }
      },
    });

    if (this.isTabFocused) {
      this.currentMusic.play();
    }

    // Set up rotation timer (5 minutes)
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
    }
    this.musicTimer = setTimeout(() => {
      this.fadeMusic(() => {
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length;
        this.playMusic(this.musicTrackIndex);
      });
    }, 5 * 60 * 1000);
  }

  public stopMusic(immediate: boolean = false): void {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }

    if (!this.currentMusic) return;

    if (immediate) {
      this.currentMusic.stop();
      this.currentMusic = null;
    } else {
      this.fadeMusic(() => {
        if (this.currentMusic) {
          this.currentMusic.stop();
          this.currentMusic = null;
        }
      });
    }
  }

  private fadeMusic(callback?: () => void): void {
    if (!this.currentMusic) {
      callback?.();
      return;
    }

    const fadeTime = 1000; // 1 second fade
    this.currentMusic.fade(this.getEffectiveVolume('music'), 0, fadeTime);
    
    setTimeout(() => {
      callback?.();
    }, fadeTime);
  }

  public setEnabled(enabled: boolean): void {
    this.preferences.enabled = enabled;
    this.applyVolumes();
    this.savePreferences();
    
    if (!enabled) {
      this.stopMusic(true);
    }
  }

  public setVolume(type: 'master' | 'effects' | 'music', value: number): void {
    value = Math.max(0, Math.min(100, value));
    
    switch (type) {
      case 'master':
        this.preferences.masterVolume = value;
        break;
      case 'effects':
        this.preferences.effectsVolume = value;
        break;
      case 'music':
        this.preferences.musicVolume = value;
        break;
    }
    
    this.applyVolumes();
    this.savePreferences();
  }

  public toggleMute(): void {
    if (this.isMuted) {
      // Unmute: restore previous volumes
      if (this.previousVolumes) {
        this.preferences = { ...this.previousVolumes };
        this.previousVolumes = null;
      }
      this.isMuted = false;
    } else {
      // Mute: save current volumes and set to 0
      this.previousVolumes = { ...this.preferences };
      this.isMuted = true;
    }
    
    this.applyVolumes();
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  public getPreferences(): AudioPreferences {
    return { ...this.preferences };
  }

  public isEnabled(): boolean {
    return this.preferences.enabled && !this.isMuted;
  }

  // Test methods for settings page
  public testEffect(): void {
    this.playEffect('dice');
  }

  public testMusic(): void {
    this.playMusic(0);
    setTimeout(() => {
      this.stopMusic();
    }, 3000);
  }

  // Battle intensity system
  public playBattleMusic(): void {
    // For now, just play a random track
    // In future, could have specific battle tracks
    const battleTrack = Math.floor(Math.random() * this.MUSIC_TRACKS.length);
    this.playMusic(battleTrack);
  }

  public playVictoryFanfare(): void {
    this.stopMusic(true);
    this.playEffect('victory');
    // Resume normal music after fanfare
    setTimeout(() => {
      this.playMusic();
    }, 3000);
  }

  public playDefeatMusic(): void {
    this.stopMusic(true);
    this.playEffect('eliminated');
  }

  // Check if running on mobile and respect silent mode
  public checkMobileSilentMode(): boolean {
    // This is a simplified check - in production, you'd want more robust detection
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Create a test sound at 0 volume to check if audio is allowed
      const testSound = new Howl({
        src: ['data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBid1v9Qlms'],
        volume: 0,
        autoplay: true,
      });
      
      // If the sound fails to play, device might be in silent mode
      testSound.on('playerror', () => {
        console.log('Device may be in silent mode');
        return true;
      });
      
      // Clean up test sound
      testSound.unload();
    }
    
    return false;
  }
}

export default AudioService.getInstance();