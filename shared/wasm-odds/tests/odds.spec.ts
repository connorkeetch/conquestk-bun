import { beforeAll, describe, expect, it } from 'vitest'
import { loadWasm } from '../index.ts'

// Minimal TS xoshiro128++ and simulator matching Rust for cross-checks
class Xoshiro128pp {
  s0: number
  s1: number
  s2: number
  s3: number
  constructor(seedHi: number, seedLo: number) {
    const sm = new SplitMix64((BigInt(seedHi >>> 0) << 32n) | BigInt(seedLo >>> 0))
    const v0 = Number(sm.next() & 0xffffffffn) >>> 0
    const v1 = (Number(sm.next() & 0xffffffffn) ^ 0x9e3779b9) >>> 0
    const v2 = Number(sm.next() & 0xffffffffn) >>> 0
    const v3 = (Number(sm.next() & 0xffffffffn) ^ 0x243f6a88) >>> 0
    this.s0 = v0 || 1
    this.s1 = v1
    this.s2 = v2
    this.s3 = v3
  }
  private rotl32(x: number, k: number) {
    return ((x << k) | (x >>> (32 - k))) >>> 0
  }
  nextU32(): number {
    const result = (this.rotl32((this.s0 + this.s3) >>> 0, 7) + this.s0) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = this.rotl32(this.s3, 11)
    return result >>> 0
  }
  nextRangeInclusive(min: number, max: number): number {
    const span = (max - min + 1) >>> 0
    return (this.nextU32() % span) + min
  }
}

class SplitMix64 {
  state: bigint
  constructor(seed: bigint) {
    this.state = seed
  }
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn
  }
}

function simulateStep(attDice: number, defDice: number, rng: Xoshiro128pp) {
  const a: number[] = []
  const d: number[] = []
  for (let i = 0; i < attDice; i++) a.push(Number(rng.nextRangeInclusive(1, 6)))
  for (let i = 0; i < defDice; i++) d.push(Number(rng.nextRangeInclusive(1, 6)))
  a.sort((x, y) => y - x)
  d.sort((x, y) => y - x)
  const pairs = Math.min(a.length, d.length)
  let al = 0,
    dl = 0
  for (let i = 0; i < pairs; i++) {
    if (a[i]! <= d[i]!) al++
    else dl++
  }
  return { attacker_losses: al, defender_losses: dl }
}

function simulateBattle(att: number, def: number, seedHi: number, seedLo: number) {
  const rng = new Xoshiro128pp(seedHi, seedLo)
  let steps = 0
  while (att >= 2 && def > 0) {
    const attDice = Math.min(3, att - 1)
    const defDice = Math.min(2, def)
    const step = simulateStep(attDice, defDice, rng)
    att -= step.attacker_losses
    def -= step.defender_losses
    steps++
  }
  return { attacker_won: def === 0, attacker_remaining: att, defender_remaining: def, steps }
}

let wasm: Awaited<ReturnType<typeof loadWasm>>

beforeAll(async () => {
  // Ensure wasm is built: tests assume pkg exists. CI will run wasm:build beforehand via root scripts.
  wasm = await loadWasm()
})

describe('wasm odds ffi', () => {
  it('version returns a string', () => {
    expect(typeof wasm.version()).toBe('string')
  })

  it('single-step matches TS simulator for deterministic seeds', () => {
    for (let i = 0; i < 1000; i++) {
      const seedHi = (0xabcd0000 >>> 0) ^ i
      const seedLo = (0x12345678 >>> 0) ^ ((i * 2654435761) >>> 0)
      const attDice = 3
      const defDice = 2
      const ts = simulateStep(attDice, defDice, new Xoshiro128pp(seedHi, seedLo))
      const rs = wasm.simulate_step(seedHi, seedLo, attDice, defDice) as any
      expect(rs.attacker_losses).toBe(ts.attacker_losses)
      expect(rs.defender_losses).toBe(ts.defender_losses)
    }
  })

  it('full battle matches TS simulator across seeds', () => {
    for (let i = 0; i < 2000; i++) {
      const seedHi = (0xdeadbeef >>> 0) ^ i
      const seedLo = (0xcafebabe >>> 0) ^ ((i * 1103515245) >>> 0)
      const att = 20 + (i % 5)
      const def = 10 + (i % 7)
      const ts = simulateBattle(att, def, seedHi, seedLo)
      const rs = wasm.simulate_battle(seedHi, seedLo, att, def, {
        attacker: 'greedy',
        defender: 'max',
      }) as any
      expect(rs.attacker_won).toBe(ts.attacker_won)
      expect(rs.attacker_remaining).toBe(ts.attacker_remaining)
      expect(rs.defender_remaining).toBe(ts.defender_remaining)
    }
  })

  it('monte carlo results align exactly with TS simulator RNG sequence', () => {
    const att = 15,
      def = 12,
      trials = 5000
    const seedHi = 0xabcd0001,
      seedLo = 0x12345678

    // Drive TS MC with same RNG sequence composition as Rust: derive per-trial seeds from main RNG
    const driver = new Xoshiro128pp(seedHi, seedLo)
    let wins = 0,
      losses = 0
    for (let i = 0; i < trials; i++) {
      const sh = driver.nextU32() >>> 0
      const sl = driver.nextU32() >>> 0
      const r = simulateBattle(att, def, sh, sl)
      if (r.attacker_won) wins++
      else losses++
    }
    const rs = wasm.monte_carlo(att, def, trials, seedHi, seedLo) as any
    expect(rs.wins).toBe(wins)
    expect(rs.losses).toBe(losses)
  })

  it('exact_odds matches TS DP (computeConquestProbability) on 0..20 grid', async () => {
    const { computeConquestProbability } = await import('../../utils/battleOdds.ts')
    for (let a = 0; a <= 20; a++) {
      for (let d = 0; d <= 20; d++) {
        const exact = wasm.exact_odds(a, d) as number
        const ts = computeConquestProbability(a, d)
        expect(Math.abs(exact - ts)).toBeLessThan(1e-6)
      }
    }
  })
})
