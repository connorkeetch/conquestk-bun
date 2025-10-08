import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('howler', () => {
  class MockHowl {
    public play = vi.fn()

    public volume = vi.fn()

    public pause = vi.fn()

    public stop = vi.fn()

    public unload = vi.fn()

    public on = vi.fn()

    public once = vi.fn()
  }

  const Howler = {
    volume: vi.fn(),
  }

  return {
    Howl: MockHowl,
    Howler,
  }
})

describe('AudioService effect aliases', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('treats "turn" as an alias for the "yourturn" effect', async () => {
    const { default: audioService } = await import('./audioService')

    const alias = 'turn' as Parameters<typeof audioService.playEffect>[0]
    audioService.playEffect(alias)

    const usageStats = audioService.getAudioUsageStats()
    const yourTurnUsage = usageStats.get('yourturn')

    expect(yourTurnUsage?.count).toBe(1)
    expect(Array.from(usageStats.keys())).not.toContain('turn')
  })
})

describe('AudioService first-run mute + streaming', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('defaults to muted on first run when no stored preference', async () => {
    // Ensure keys are absent
    expect(localStorage.getItem('audioMuted')).toBeNull()
    const { default: audioService } = await import('./audioService')
    expect(audioService.isMutedState()).toBe(true)
    // Should persist the mute flag
    expect(localStorage.getItem('audioMuted')).toBe('true')
  })
})
