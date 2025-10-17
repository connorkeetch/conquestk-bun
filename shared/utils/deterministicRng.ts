const UINT32_MAX = 0x100000000

export type Sfc32State = {
  a: number
  b: number
  c: number
  d: number
}

export type DeterministicRngState = Sfc32State

const RNG_PREFIX = 'sfc32:'

const DEFAULT_SEED = 'conquestk'

export const RNG_ALGORITHM = 'sfc32' as const

/**
 * Hash a string into four 32-bit unsigned integers using cyrb128.
 * Mirrors the implementation we previously inlined inside the GameEngine.
 */
export function cyrb128(seed: string): Sfc32State {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i)
    h1 = (h2 ^ Math.imul(h1 ^ k, 597399067)) >>> 0
    h2 = (h3 ^ Math.imul(h2 ^ k, 2869860233)) >>> 0
    h3 = (h4 ^ Math.imul(h3 ^ k, 951274213)) >>> 0
    h4 = (h1 ^ Math.imul(h4 ^ k, 2716044179)) >>> 0
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067) >>> 0
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233) >>> 0
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213) >>> 0
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179) >>> 0
  return {
    a: h1 >>> 0,
    b: h2 >>> 0,
    c: h3 >>> 0,
    d: h4 >>> 0,
  }
}

const normalizeSeed = (seed?: string): string => {
  if (!seed || seed.trim().length === 0) {
    return `${RNG_PREFIX}${DEFAULT_SEED}`
  }
  const trimmed = seed.trim()
  if (trimmed.startsWith(RNG_PREFIX)) {
    return trimmed
  }
  return `${RNG_PREFIX}${trimmed}`
}

export const deriveStateFromSeed = (seed?: string): { seed: string; state: Sfc32State } => {
  const normalizedSeed = normalizeSeed(seed)
  const state = cyrb128(normalizedSeed)
  return { seed: normalizedSeed, state }
}

/**
 * Deterministic RNG based on SFC32, safe to serialize via getState().
 */
export class DeterministicRng {
  private state: Sfc32State

  readonly seed: string

  constructor(seed: string, initialState?: Sfc32State) {
    const { seed: normalizedSeed, state } = deriveStateFromSeed(seed)
    this.seed = normalizedSeed
    this.state = initialState ? { ...initialState } : { ...state }
  }

  static fromState(seed: string, state: Sfc32State): DeterministicRng {
    return new DeterministicRng(seed, state)
  }

  clone(): DeterministicRng {
    return DeterministicRng.fromState(this.seed, this.getState())
  }

  /**
   * Returns a float in [0, 1).
   */
  next(): number {
    const t =
      (((this.state.a + this.state.b) | 0) + this.state.d) | 0 // Ensure 32-bit wrapping addition
    this.state.d = (this.state.d + 1) | 0
    this.state.a = this.state.b ^ (this.state.b >>> 9)
    this.state.b = (this.state.c + (this.state.c << 3)) | 0
    this.state.c = (this.state.c << 21) | (this.state.c >>> 11)
    this.state.c = (this.state.c + t) | 0
    return (t >>> 0) / UINT32_MAX
  }

  /**
   * Returns an integer in [0, maxExclusive).
   */
  nextInt(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`nextInt maxExclusive must be > 0 (received ${maxExclusive})`)
    }
    return Math.floor(this.next() * maxExclusive)
  }

  /**
   * Returns an integer in [minInclusive, maxInclusive].
   */
  nextIntInclusive(minInclusive: number, maxInclusive: number): number {
    if (!Number.isFinite(minInclusive) || !Number.isFinite(maxInclusive)) {
      throw new RangeError('nextIntInclusive bounds must be finite numbers')
    }
    const min = Math.ceil(minInclusive)
    const max = Math.floor(maxInclusive)
    if (max < min) {
      throw new RangeError('nextIntInclusive requires max >= min')
    }
    const span = max - min + 1
    return min + this.nextInt(span)
  }

  /**
   * Returns a float in [minInclusive, maxExclusive).
   */
  nextRange(minInclusive: number, maxExclusive: number): number {
    if (!Number.isFinite(minInclusive) || !Number.isFinite(maxExclusive)) {
      throw new RangeError('nextRange bounds must be finite numbers')
    }
    if (maxExclusive <= minInclusive) {
      throw new RangeError('nextRange requires maxExclusive > minInclusive')
    }
    return minInclusive + this.next() * (maxExclusive - minInclusive)
  }

  /**
   * Pick a random element from the provided array.
   */
  sample<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('sample requires a non-empty array')
    }
    return items[this.nextInt(items.length)]
  }

  /**
   * In-place Fisher–Yates shuffle using the deterministic RNG.
   */
  shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1)
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }

  /**
   * Returns a copy of the internal SFC32 state for serialization.
   */
  getState(): Sfc32State {
    return { ...this.state }
  }
}
