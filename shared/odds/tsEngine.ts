// TypeScript engine: deterministic simulation using xoshiro128++ PRNG
// Matches the Rust implementation exactly for shadow comparisons.

export type StepResult = { attacker_losses: number; defender_losses: number }
export type BattleResult = {
  attacker_won: boolean
  attacker_remaining: number
  defender_remaining: number
  steps: number
}

class SplitMix64 {
  state: bigint
  constructor(seedHi: number, seedLo: number) {
    this.state = ((BigInt(seedHi >>> 0) << 32n) | BigInt(seedLo >>> 0)) & 0xffffffffffffffffn
  }
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn
  }
}

class Xoshiro128pp {
  s0: number
  s1: number
  s2: number
  s3: number
  constructor(seedHi: number, seedLo: number) {
    const sm = new SplitMix64(seedHi, seedLo)
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
  nextRangeInclusive(min: number, max: number) {
    const span = (max - min + 1) >>> 0
    return (this.nextU32() % span) + min
  }
}

function simulateStepInternal(attDice: number, defDice: number, rng: Xoshiro128pp): StepResult {
  const a: number[] = []
  const d: number[] = []
  for (let i = 0; i < attDice; i++) a.push(Number(rng.nextRangeInclusive(1, 6)))
  for (let i = 0; i < defDice; i++) d.push(Number(rng.nextRangeInclusive(1, 6)))
  a.sort((x, y) => y - x)
  d.sort((x, y) => y - x)
  const pairs = Math.min(a.length, d.length)
  let al = 0
  let dl = 0
  for (let i = 0; i < pairs; i++) {
    const av = a[i] ?? 0
    const dv = d[i] ?? 0
    if (av <= dv) al++
    else dl++
  }
  return { attacker_losses: al, defender_losses: dl }
}

export function simulateStep(
  seedHi: number,
  seedLo: number,
  attDice: number,
  defDice: number,
): StepResult {
  const rng = new Xoshiro128pp(seedHi, seedLo)
  return simulateStepInternal(attDice, defDice, rng)
}

export type Policy = { attacker?: 'greedy' | 'conservative'; defender?: 'max' | 'conservative' }

export function simulateBattle(
  seedHi: number,
  seedLo: number,
  attArmies: number,
  defArmies: number,
  policy?: Policy,
): BattleResult {
  const rng = new Xoshiro128pp(seedHi, seedLo)
  let att = attArmies >>> 0
  let def = defArmies >>> 0
  let steps = 0
  const aPol = policy?.attacker === 'conservative' ? 'conservative' : 'greedy'
  const dPol = policy?.defender === 'conservative' ? 'conservative' : 'max'
  const chooseAttDice = (a: number) =>
    a < 2 ? 0 : aPol === 'greedy' ? Math.min(3, a - 1) : Math.min(2, a - 1)
  const chooseDefDice = (d: number) => (d === 0 ? 0 : dPol === 'max' ? Math.min(2, d) : 1)
  while (att >= 2 && def > 0) {
    const ad = chooseAttDice(att)
    const dd = chooseDefDice(def)
    if (ad === 0 || dd === 0) break
    const s = simulateStepInternal(ad, dd, rng)
    att -= s.attacker_losses
    def -= s.defender_losses
    steps++
  }
  return { attacker_won: def === 0, attacker_remaining: att, defender_remaining: def, steps }
}

export function monteCarlo(
  attArmies: number,
  defArmies: number,
  trials: number,
  seedHi: number,
  seedLo: number,
) {
  const driver = new Xoshiro128pp(seedHi, seedLo)
  let wins = 0
  let losses = 0
  const attHist = new Array(attArmies + 1).fill(0)
  const defHist = new Array(defArmies + 1).fill(0)
  for (let i = 0; i < trials; i++) {
    const sh = driver.nextU32() >>> 0
    const sl = driver.nextU32() >>> 0
    const r = simulateBattle(sh, sl, attArmies, defArmies)
    if (r.attacker_won) {
      wins++
      attHist[r.attacker_remaining]++
    } else {
      losses++
      defHist[r.defender_remaining]++
    }
  }
  const pWin = wins / trials
  return {
    trials,
    wins,
    losses,
    p_win: pWin,
    p_loss: 1 - pWin,
    att_remaining_hist: attHist,
    def_remaining_hist: defHist,
  }
}
