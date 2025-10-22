import { computeRollOdds } from './combatOdds.js'

// Optional precomputed lookup table; can be injected at runtime by frontend
let precomputed: number[][] | null = null
/**
 * Injects a precomputed lookup table for battle outcomes. This is used by the
 * frontend to avoid expensive calculations.
 *
 * @param {number[][]} data - The precomputed outcome data.
 */
export function setPrecomputedOutcomes(data: number[][]) {
  precomputed = data
}

type Key = `${number}|${number}`

export interface ConquestOdds {
  winProbability: number
  expected?: {
    attacker: number
    defender: number
  }
  conditional?: {
    attackerIfWin: number
    defenderIfLoss: number
  }
}

const memoWin = new Map<Key, number>()
const memoEA = new Map<Key, number>()
const memoED = new Map<Key, number>()
const memoWA = new Map<Key, number>()
const memoDL = new Map<Key, number>()

const transCache = new Map<string, Array<{ aLoss: number; dLoss: number; p: number }>>()

function getTransitions(attDice: 1 | 2 | 3, defDice: 1 | 2) {
  const key = `${attDice}v${defDice}`
  const cached = transCache.get(key)
  if (cached) return cached
  const odds = computeRollOdds(attDice, defDice)
  const t = [
    { aLoss: 1, dLoss: 0, p: odds.probabilities.attackerLoses1 },
    { aLoss: 2, dLoss: 0, p: odds.probabilities.attackerLoses2 },
    { aLoss: 0, dLoss: 1, p: odds.probabilities.defenderLoses1 },
    { aLoss: 0, dLoss: 2, p: odds.probabilities.defenderLoses2 },
    { aLoss: 1, dLoss: 1, p: odds.probabilities.trade11 },
  ].filter((x) => x.p > 0)
  transCache.set(key, t)
  return t
}

function winProb(a: number, d: number): number {
  if (d <= 0) return 1
  if (a < 2) return 0

  const key: Key = `${a}|${d}`
  const cached = memoWin.get(key)
  if (cached !== undefined) return cached

  const attDice = Math.min(3, a - 1) as 1 | 2 | 3
  const defDice = Math.min(2, d) as 1 | 2
  const transitions = getTransitions(attDice, defDice)

  let p = 0
  for (const t of transitions) {
    const na = a - t.aLoss
    const nd = d - t.dLoss
    p += t.p * winProb(na, nd)
  }

  memoWin.set(key, p)
  return p
}

function expectedAttackers(a: number, d: number): number {
  if (d <= 0) return a
  if (a < 2) return a
  const key: Key = `${a}|${d}`
  const cached = memoEA.get(key)
  if (cached !== undefined) return cached
  const attDice = Math.min(3, a - 1) as 1 | 2 | 3
  const defDice = Math.min(2, d) as 1 | 2
  let e = 0
  for (const t of getTransitions(attDice, defDice)) {
    e += t.p * expectedAttackers(a - t.aLoss, d - t.dLoss)
  }
  memoEA.set(key, e)
  return e
}

function expectedDefenders(a: number, d: number): number {
  if (d <= 0) return 0
  if (a < 2) return d
  const key: Key = `${a}|${d}`
  const cached = memoED.get(key)
  if (cached !== undefined) return cached
  const attDice = Math.min(3, a - 1) as 1 | 2 | 3
  const defDice = Math.min(2, d) as 1 | 2
  let e = 0
  for (const t of getTransitions(attDice, defDice)) {
    e += t.p * expectedDefenders(a - t.aLoss, d - t.dLoss)
  }
  memoED.set(key, e)
  return e
}

function expectedAttackersGivenWin(a: number, d: number): number {
  const P = computeConquestProbability(a, d)
  if (P <= 0) return 0
  if (d <= 0) return a
  if (a < 2) return 0
  const key: Key = `${a}|${d}`
  const cached = memoWA.get(key)
  if (cached !== undefined) return cached
  const attDice = Math.min(3, a - 1) as 1 | 2 | 3
  const defDice = Math.min(2, d) as 1 | 2
  let num = 0
  for (const t of getTransitions(attDice, defDice)) {
    const na = a - t.aLoss
    const nd = d - t.dLoss
    const Pn = computeConquestProbability(na, nd)
    num += t.p * Pn * expectedAttackersGivenWin(na, nd)
  }
  const val = num / P
  memoWA.set(key, val)
  return val
}

function expectedDefendersGivenLoss(a: number, d: number): number {
  const P = computeConquestProbability(a, d)
  const Q = 1 - P
  if (Q <= 0) return 0
  if (d <= 0) return 0
  if (a < 2) return d
  const key: Key = `${a}|${d}`
  const cached = memoDL.get(key)
  if (cached !== undefined) return cached
  const attDice = Math.min(3, a - 1) as 1 | 2 | 3
  const defDice = Math.min(2, d) as 1 | 2
  let num = 0
  for (const t of getTransitions(attDice, defDice)) {
    const na = a - t.aLoss
    const nd = d - t.dLoss
    const Qn = 1 - computeConquestProbability(na, nd)
    num += t.p * Qn * expectedDefendersGivenLoss(na, nd)
  }
  const val = num / Q
  memoDL.set(key, val)
  return val
}

/**
 * Computes the probability of an attacker winning a battle.
 *
 * @param {number} attArmies - The number of attacking armies.
 * @param {number} defArmies - The number of defending armies.
 * @returns {number} The probability of the attacker winning.
 */
export function computeConquestProbability(attArmies: number, defArmies: number): number {
  const a = Math.max(0, Math.floor(attArmies))
  const d = Math.max(0, Math.floor(defArmies))
  // Prefer precomputed lookup if available and within bounds
  if (precomputed && precomputed[a] && precomputed[a][d] != null) {
    return precomputed[a][d] as number
  }
  return winProb(a, d)
}

/**
 * Computes the odds of a conquest, including the win probability and expected
 * army counts.
 *
 * @param {number} attArmies - The number of attacking armies.
 * @param {number} defArmies - The number of defending armies.
 * @returns {ConquestOdds} An object containing the conquest odds.
 */
export function computeConquestOdds(attArmies: number, defArmies: number): ConquestOdds {
  const a = Math.max(0, Math.floor(attArmies))
  const d = Math.max(0, Math.floor(defArmies))
  const winProbability = computeConquestProbability(a, d)
  const expA = expectedAttackers(a, d)
  const expD = expectedDefenders(a, d)
  const condA = winProbability > 0 ? expectedAttackersGivenWin(a, d) : 0
  const condD = winProbability < 1 ? expectedDefendersGivenLoss(a, d) : 0
  return {
    winProbability,
    expected: { attacker: expA, defender: expD },
    conditional: { attackerIfWin: condA, defenderIfLoss: condD },
  }
}
