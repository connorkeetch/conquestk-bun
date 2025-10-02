declare module 'howler' {
  type HowlEvent = 'end' | 'load' | 'play' | 'pause' | 'stop' | string

  interface HowlOptions {
    src: string[]
    preload?: boolean
    loop?: boolean
    autoplay?: boolean
    volume?: number
    mute?: boolean
    rate?: number
    html5?: boolean
    onload?: () => void
    onend?: () => void
    onloaderror?: (id: number, error: unknown) => void
    onplayerror?: (id: number, error: unknown) => void
  }

  class Howl {
    constructor(options: HowlOptions)
    play(id?: number): number
    pause(id?: number): void
    stop(id?: number): void
    unload(): void
    volume(volume?: number): number
    volume(id: number, volume: number): number
    mute(muted?: boolean): void
    mute(id: number, muted: boolean): void
    rate(rate?: number): number
    rate(id: number, rate: number): number
    seek(seek?: number): number
    seek(id: number, seek: number): number
    on(event: HowlEvent, callback: (...args: unknown[]) => void, id?: number): void
    once(event: HowlEvent, callback: (...args: unknown[]) => void, id?: number): void
    fade(from: number, to: number, duration: number, id?: number): void
  }

  const Howler: {
    volume(volume?: number): number
    mute(muted?: boolean): void
    noAudio?: boolean
    usingWebAudio?: boolean
    once?: (
      event: HowlEvent | 'unlock',
      callback: (...args: unknown[]) => void,
      id?: number,
    ) => void
  }

  export { Howl, Howler }
}
