#!/usr/bin/env node
/*
  Generates a precomputed conquest probability lookup table using the same rules as the app:
  - Attacker always rolls max dice up to 3, leaving one unit behind (min 1 on territory)
  - Defender always rolls max dice up to 2
  - Defender wins ties
  Output: shared/data/combatOutcomes.json with shape number[MAX_A+1][MAX_D+1]
*/
// CJS entrypoint (migrated for root ESM)
const fs = require('node:fs')
const path = require('node:path')

const MAX_A = parseInt(process.env.MAX_ATTACKERS || '100', 10)
const MAX_D = parseInt(process.env.MAX_DEFENDERS || '100', 10)

function* diceCombos(n) {
  const dice = Array(n).fill(1)
  while (true) {
    yield [...dice]
    let i = n - 1
    while (i >= 0 && dice[i] === 6) i--
    if (i < 0) return
    dice[i]++
    for (let j = i + 1; j < n; j++) dice[j] = 1
  }
}

function compareHighest(att, def) {
  const a = [...att].sort((x, y) => y - x)
  const d = [...def].sort((x, y) => y - x)
  const pairs = Math.min(a.length, d.length)
  let attackerLosses = 0
  let defenderLosses = 0
  for (let i = 0; i < pairs; i++) {
    if (a[i] > d[i]) defenderLosses++
    else attackerLosses++
  }
  return { attackerLosses, defenderLosses }
}

const rollOddsCache = new Map()
function computeRollOdds(attDice, defDice) {
  const key = `${attDice}v${defDice}`
  const cached = rollOddsCache.get(key)
  if (cached) return cached
  const outcomes = {}
  let total = 0
  for (const a of diceCombos(attDice)) {
    for (const d of diceCombos(defDice)) {
      const r = compareHighest(a, d)
      const k = `${r.attackerLosses}-${r.defenderLosses}`
      outcomes[k] = (outcomes[k] || 0) + 1
      total++
    }
  }
  const p = (k) => (outcomes[k] || 0) / total
  const result = {
    samples: total,
    probabilities: {
      attackerLoses1: p('1-0'),
      attackerLoses2: p('2-0'),
      defenderLoses1: p('0-1'),
      defenderLoses2: p('0-2'),
      trade11: p('1-1'),
    },
  }
  rollOddsCache.set(key, result)
  return result
}

const transCache = new Map()
function getTransitions(attDice, defDice) {
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

const memo = new Map()
function winProb(a, d) {
  if (d <= 0) return 1
  if (a < 2) return 0
  const key = `${a}|${d}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  const attDice = Math.min(3, a - 1)
  const defDice = Math.min(2, d)
  let p = 0
  for (const t of getTransitions(attDice, defDice)) {
    p += t.p * winProb(a - t.aLoss, d - t.dLoss)
  }
  memo.set(key, p)
  return p
}

function main() {
  const table = Array.from({ length: MAX_A + 1 }, () => Array(MAX_D + 1).fill(0))
  for (let a = 0; a <= MAX_A; a++) {
    for (let d = 0; d <= MAX_D; d++) {
      table[a][d] = Number(winProb(a, d).toFixed(6))
    }
    // noop progress hook removed to satisfy linting
  }
  const outDir = path.join(__dirname, '..', 'shared', 'data')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'combatOutcomes.json')
  fs.writeFileSync(outFile, JSON.stringify(table))
}

if (require.main === module) {
  main()
}
