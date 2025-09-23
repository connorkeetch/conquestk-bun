import { Howl, Howler } from 'howler'
import { logger } from '@/utils/logger'

const SOUND_EFFECTS = {
  // Dice rolling sounds (rotate through multiple - reduced from 7 to 3)
  dice: [
    '/audio-files/11L-Dice_roll_sound_effe-1756344593515.mp3',
    '/audio-files/11L-Dice_roll_sound_effe-1756344594793.mp3',
    '/audio-files/11L-dice_rolling_on_tabl-1756342799425.mp3',
  ],
  // Turn notification sounds (rotate through multiple - reduced from 13 to 4)
  yourturn: [
    '/audio-files/11L-Bell_chime_for_turn_-1756343144511.mp3',
    '/audio-files/11L-Bell_chime_for_turn_-1756343146159.mp3',
    '/audio-files/11L-Turn_notification_so-1756344526253.mp3',
    '/audio-files/11L-turn_notification_so-1756344686879.mp3',
  ],
  // Attack/Battle sounds (reduced duplicates)
  attack: [
    '/audio-files/11L-Cannon_fire_in_the_d-1756343009915.mp3',
    '/audio-files/11L-Cannon_fire_in_the_d-1756343012115.mp3',
  ],
  battle: [
    '/audio-files/11L-swords_clash-1756342861091.mp3',
    '/audio-files/11L-swords_clash-1756342863185.mp3',
  ],
  // Victory/Achievement sounds
  victory: [
    '/audio-files/11L-Crowd_cheering_victo-1756343298068.mp3',
    '/audio-files/11L-Triumphant_orchestra-1756343250021.mp3',
  ],
  fanfare: [
    '/audio-files/11L-Trumpet_fanfare_shor-1756343177067.mp3',
    '/audio-files/11L-Trumpet_fanfare_shor-1756343182421.mp3',
  ],
  // Game state sounds
  gamestart: '/audio-files/11L-Bright_brass_bell_si-1756344484349.mp3',
  capture: '/audio-files/11L-Stamp_hitting_paper_-1756343095784.mp3',
  // Piece movement sounds (reduced from 3 to 2)
  placetroop: [
    '/audio-files/11L-Wooden_game_piece_be-1756343068801.mp3',
    '/audio-files/11L-Wooden_game_piece_be-1756343070672.mp3',
  ],
  // UI sounds (reduced chat messages from 4 to 2)
  message: [
    '/audio-files/11L-Chat_message_notific-1756344550342.mp3',
    '/audio-files/11L-Chat_message_notific-1756344552127.mp3',
  ],
  error: '/audio-files/11L-Errorinvalid_move_so-1756344569392.mp3',
  swoosh: '/audio-files/11L-Swoosh_sound_for_swi-1756344719043.mp3',
  // Timer sounds
  timer: '/audio-files/11L-Clock_ticking_countd-1756343124965.mp3',
  timerslow: '/audio-files/11L-Slow_cinematic_clock-1756344723753.mp3',
  // These are aliases for backwards compatibility
  defeat: '/audio-files/11L-Errorinvalid_move_so-1756344569392.mp3',
  eliminated: '/audio-files/11L-Errorinvalid_move_so-1756344569392.mp3',
} as const

type SoundEffectDefinitions = typeof SOUND_EFFECTS
type SoundEffectKey = keyof SoundEffectDefinitions

const EFFECT_ALIASES = {
  turn: 'yourturn',
} as const satisfies Record<string, SoundEffectKey>

type EffectAlias = keyof typeof EFFECT_ALIASES
type EffectName = SoundEffectKey | EffectAlias

interface AudioPreferences {
  enabled: boolean
  masterVolume: number
  effectsVolume: number
  musicVolume: number
}

interface SoundEffect {
  name: string
  howl: Howl | null
  category: 'effect' | 'music'
}

class AudioService {
  private static instance: AudioService
  private sounds: Map<string, SoundEffect> = new Map()
  private currentMusic: Howl | null = null
  private musicTrackIndex: number = 0
  private musicTimer: NodeJS.Timeout | null = null
  private preferences: AudioPreferences = {
    enabled: true,
    masterVolume: 50,
    effectsVolume: 70,
    musicVolume: 30,
  }
  private isTabFocused: boolean = true
  private isMuted: boolean = false
  private previousVolumes: AudioPreferences | null = null
  private readonly audioEnabled: boolean

  // Track which audio files are being used
  private audioUsageTracker: Map<SoundEffectKey, { lastUsed: Date; count: number }> = new Map()

  // Background music tracks
  private readonly MUSIC_TRACKS = [
    '/audio-files/Conquer the World.mp3',
    // High-quality WAV versions available (v1: 63MB, v2: 42MB, v3: 44MB):
    // '/audio-files/Conquer the World v1.wav',  // Original version
    // '/audio-files/Conquer the World v2.wav',  // Alternative mix
    // '/audio-files/Conquer the World v3.wav',  // Another variation
  ]

  // Sound rotation indices for arrays
  private soundIndices: Map<SoundEffectKey, number> = new Map()

  private constructor() {
    this.audioEnabled = this.shouldEnableAudio()
    this.loadPreferences()
    if (this.audioEnabled) {
      this.setupVisibilityListener()
      this.preloadSounds()
    } else {
      logger.debug('Audio disabled for current environment; skipping preload')
    }
  }

  private shouldEnableAudio(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false
    }

    try {
      const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE
      if (mode === 'test') {
        return false
      }
    } catch (_error) {
      // Ignore access errors; fall back to other checks
    }

    const howlerAny = Howler as unknown as { noAudio?: boolean }
    if (typeof howlerAny?.noAudio === 'boolean' && howlerAny.noAudio) {
      return false
    }

    return true
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService()
    }
    return AudioService.instance
  }

  private loadPreferences(): void {
    const stored = localStorage.getItem('audioPreferences')
    if (stored) {
      try {
        this.preferences = JSON.parse(stored)
        this.applyVolumes()
      } catch (error) {
        logger.error('Failed to load audio preferences', error)
      }
    }
  }

  private savePreferences(): void {
    localStorage.setItem('audioPreferences', JSON.stringify(this.preferences))
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      this.isTabFocused = !document.hidden
      if (!this.isTabFocused && this.currentMusic) {
        this.currentMusic.pause()
      } else if (this.isTabFocused && this.currentMusic) {
        this.currentMusic.play()
      }
    })
  }

  private preloadSounds(): void {
    // Preload sound effects
    Object.entries(SOUND_EFFECTS).forEach(([name, pathOrPaths]) => {
      const effectName = name as SoundEffectKey
      const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]

      // For arrays of sounds, preload all of them
      if (Array.isArray(pathOrPaths)) {
        paths.forEach((path, index) => {
          const soundKey = `${effectName}_${index}`
          const howl = new Howl({
            src: [path],
            preload: true,
            volume: this.getEffectiveVolume('effect'),
            onloaderror: (_id, error) => {
              logger.warn(`Failed to load sound effect ${soundKey}`, error)
              this.sounds.set(soundKey, { name: soundKey, howl: null, category: 'effect' })
            },
            onload: () => {
              logger.debug(`Loaded sound effect ${soundKey}`)
            },
          })
          this.sounds.set(soundKey, { name: soundKey, howl, category: 'effect' })
        })
        // Initialize rotation index
        this.soundIndices.set(effectName, 0)
      } else {
        // Single sound
        const howl = new Howl({
          src: [paths[0]],
          preload: true,
          volume: this.getEffectiveVolume('effect'),
          onloaderror: (_id, error) => {
            logger.warn(`Failed to load sound effect ${effectName}`, error)
            this.sounds.set(effectName, { name: effectName, howl: null, category: 'effect' })
          },
          onload: () => {
            logger.debug(`Loaded sound effect ${effectName}`)
          },
        })
        this.sounds.set(effectName, { name: effectName, howl, category: 'effect' })
      }
    })
  }

  private getEffectiveVolume(category: 'effect' | 'music'): number {
    if (!this.preferences.enabled || this.isMuted) return 0

    const categoryVolume =
      category === 'effect' ? this.preferences.effectsVolume : this.preferences.musicVolume

    return (this.preferences.masterVolume / 100) * (categoryVolume / 100)
  }

  private applyVolumes(): void {
    if (!this.audioEnabled) {
      return
    }

    Howler.volume(this.preferences.masterVolume / 100)

    // Update all loaded sounds
    this.sounds.forEach((sound) => {
      if (sound.howl) {
        sound.howl.volume(this.getEffectiveVolume(sound.category))
      }
    })

    // Update current music if playing
    if (this.currentMusic) {
      this.currentMusic.volume(this.getEffectiveVolume('music'))
    }
  }

  // Public methods
  public playEffect(effectName: EffectName): void {
    const resolvedEffectName = this.resolveEffectName(effectName)

    if (!resolvedEffectName) {
      logger.warn(`Sound effect '${effectName}' not found`)
      return
    }

    const effectConfig = SOUND_EFFECTS[resolvedEffectName]

    if (!effectConfig) {
      logger.warn(
        `Sound effect '${effectName}' not found or failed to load (resolved as '${resolvedEffectName}')`,
      )
      return
    }

    // Track usage
    this.trackAudioUsage(resolvedEffectName)

    if (!this.audioEnabled || !this.preferences.enabled || this.isMuted || !this.isTabFocused) {
      return
    }

    if (Array.isArray(effectConfig)) {
      // Get current index and rotate
      const currentIndex = this.soundIndices.get(resolvedEffectName) || 0
      const soundKey = `${resolvedEffectName}_${currentIndex}`
      const sound = this.sounds.get(soundKey)

      if (sound?.howl) {
        sound.howl.volume(this.getEffectiveVolume('effect'))
        sound.howl.play()
      } else {
        logger.warn(`Sound effect '${soundKey}' not found or failed to load`)
      }

      // Update index for next time (rotate through available sounds)
      this.soundIndices.set(resolvedEffectName, (currentIndex + 1) % effectConfig.length)
    } else {
      // Single sound effect
      const sound = this.sounds.get(resolvedEffectName)
      if (sound?.howl) {
        sound.howl.volume(this.getEffectiveVolume('effect'))
        sound.howl.play()
      } else {
        logger.warn(`Sound effect '${resolvedEffectName}' not found or failed to load`)
      }
    }
  }

  private resolveEffectName(effectName: EffectName): SoundEffectKey | null {
    const normalizedEffectName = effectName.toLowerCase()

    if (normalizedEffectName in EFFECT_ALIASES) {
      return EFFECT_ALIASES[normalizedEffectName as EffectAlias]
    }

    if (normalizedEffectName in SOUND_EFFECTS) {
      return normalizedEffectName as SoundEffectKey
    }

    return null
  }

  // Track audio usage for debugging/analytics
  private trackAudioUsage(audioName: SoundEffectKey): void {
    const existing = this.audioUsageTracker.get(audioName)
    if (existing) {
      existing.lastUsed = new Date()
      existing.count++
    } else {
      this.audioUsageTracker.set(audioName, {
        lastUsed: new Date(),
        count: 1,
      })
    }
  }

  // Get audio usage statistics
  public getAudioUsageStats(): Map<SoundEffectKey, { lastUsed: Date; count: number }> {
    return new Map(this.audioUsageTracker)
  }

  // Get list of unused audio files (for debugging)
  public getUnusedAudioFiles(): SoundEffectKey[] {
    const allSoundNames = new Set<SoundEffectKey>()

    // Add all defined sound effect names
    Object.keys(SOUND_EFFECTS).forEach((name) => {
      allSoundNames.add(name as SoundEffectKey)
    })

    // Find which ones haven't been used
    const unused: SoundEffectKey[] = []
    allSoundNames.forEach((name) => {
      if (!this.audioUsageTracker.has(name)) {
        unused.push(name)
      }
    })

    return unused
  }

  public playMusic(trackIndex?: number): void {
    if (!this.audioEnabled || !this.preferences.enabled || this.isMuted) return

    // Stop current music if playing
    this.stopMusic(true)

    // Select track
    if (trackIndex !== undefined) {
      this.musicTrackIndex = trackIndex % this.MUSIC_TRACKS.length
    }

    const trackPath = this.MUSIC_TRACKS[this.musicTrackIndex]

    this.currentMusic = new Howl({
      src: [trackPath],
      volume: this.getEffectiveVolume('music'),
      loop: false,
      onend: () => {
        // Play next track after current one ends
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length
        this.playMusic(this.musicTrackIndex)
      },
      onloaderror: (_id, error) => {
        logger.error(`Failed to load music track ${trackPath}`, error)
        // Try next track
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length
        if (this.musicTrackIndex !== trackIndex) {
          this.playMusic(this.musicTrackIndex)
        }
      },
    })

    if (this.isTabFocused) {
      this.currentMusic.play()
    }

    // Set up rotation timer (5 minutes)
    if (this.musicTimer) {
      clearTimeout(this.musicTimer)
    }
    this.musicTimer = setTimeout(
      () => {
        this.fadeMusic(() => {
          this.musicTrackIndex = (this.musicTrackIndex + 1) % this.MUSIC_TRACKS.length
          this.playMusic(this.musicTrackIndex)
        })
      },
      5 * 60 * 1000,
    )
  }

  public stopMusic(immediate: boolean = false): void {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer)
      this.musicTimer = null
    }

    if (!this.currentMusic) return

    if (immediate) {
      this.currentMusic.stop()
      this.currentMusic = null
    } else {
      this.fadeMusic(() => {
        if (this.currentMusic) {
          this.currentMusic.stop()
          this.currentMusic = null
        }
      })
    }
  }

  private fadeMusic(callback?: () => void): void {
    if (!this.currentMusic) {
      callback?.()
      return
    }

    const fadeTime = 1000 // 1 second fade
    this.currentMusic.fade(this.getEffectiveVolume('music'), 0, fadeTime)

    setTimeout(() => {
      callback?.()
    }, fadeTime)
  }

  public setEnabled(enabled: boolean): void {
    this.preferences.enabled = enabled
    this.applyVolumes()
    this.savePreferences()

    if (!enabled) {
      this.stopMusic(true)
    }
  }

  public setVolume(type: 'master' | 'effects' | 'music', value: number): void {
    const clamped = Math.max(0, Math.min(100, value))

    switch (type) {
      case 'master':
        this.preferences.masterVolume = clamped
        break
      case 'effects':
        this.preferences.effectsVolume = clamped
        break
      case 'music':
        this.preferences.musicVolume = clamped
        break
    }

    this.applyVolumes()
    this.savePreferences()
  }

  public toggleMute(): void {
    if (this.isMuted) {
      // Unmute: restore previous volumes
      if (this.previousVolumes) {
        this.preferences = { ...this.previousVolumes }
        this.previousVolumes = null
      }
      this.isMuted = false
    } else {
      // Mute: save current volumes and set to 0
      this.previousVolumes = { ...this.preferences }
      this.isMuted = true
    }

    this.applyVolumes()
  }

  public isMutedState(): boolean {
    return this.isMuted
  }

  public getPreferences(): AudioPreferences {
    return { ...this.preferences }
  }

  public isEnabled(): boolean {
    return this.preferences.enabled && !this.isMuted
  }

  // Test methods for settings page
  public testEffect(): void {
    this.playEffect('dice')
  }

  public testMusic(): void {
    if (!this.audioEnabled) {
      return
    }
    this.playMusic(0)
    setTimeout(() => {
      this.stopMusic()
    }, 3000)
  }

  // Battle intensity system
  public playBattleMusic(): void {
    if (!this.audioEnabled) {
      return
    }
    // For now, just play a random track
    // In future, could have specific battle tracks
    const battleTrack = Math.floor(Math.random() * this.MUSIC_TRACKS.length)
    this.playMusic(battleTrack)
  }

  public playVictoryFanfare(): void {
    if (!this.audioEnabled) {
      this.playEffect('victory')
      return
    }
    this.stopMusic(true)
    this.playEffect('victory')
    // Resume normal music after fanfare
    setTimeout(() => {
      this.playMusic()
    }, 3000)
  }

  public playDefeatMusic(): void {
    if (!this.audioEnabled) {
      this.playEffect('eliminated')
      return
    }
    this.stopMusic(true)
    this.playEffect('eliminated')
  }

  // Check if running on mobile and respect silent mode
  public checkMobileSilentMode(): boolean {
    if (!this.audioEnabled) {
      return false
    }
    // This is a simplified check - in production, you'd want more robust detection
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

    if (isMobile) {
      // Create a test sound at 0 volume to check if audio is allowed
      const testSound = new Howl({
        src: [
          'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBid1v9Qlms',
        ],
        volume: 0,
        autoplay: true,
      })

      // If the sound fails to play, device might be in silent mode
      testSound.on('playerror', () => {
        logger.info('Device may be in silent mode')
        return true
      })

      // Clean up test sound
      testSound.unload()
    }

    return false
  }
}

export default AudioService.getInstance()
