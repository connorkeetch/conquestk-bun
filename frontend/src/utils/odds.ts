export type RollOutcome = { attackerLosses: 0 | 1 | 2; defenderLosses: 0 | 1 | 2 }

function* diceCombos(n: number): Generator<number[]> {
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

function compareHighest(att: number[], def: number[]): RollOutcome {
  const a = [...att].sort((x, y) => y - x)
  const d = [...def].sort((x, y) => y - x)
  const pairs = Math.min(a.length, d.length)
  let attackerLosses = 0 as 0 | 1 | 2
  let defenderLosses = 0 as 0 | 1 | 2
  for (let i = 0; i < pairs; i++) {
    if (a[i] > d[i]) defenderLosses = (defenderLosses + 1) as 0 | 1 | 2
    else attackerLosses = (attackerLosses + 1) as 0 | 1 | 2
  }
  return { attackerLosses, defenderLosses }
}

export function computeRollOdds(attDice: 1 | 2 | 3, defDice: 1 | 2) {
  const outcomes: Record<string, number> = {}
  let total = 0
  for (const a of diceCombos(attDice)) {
    for (const d of diceCombos(defDice)) {
      const r = compareHighest(a, d)
      const key = `${r.attackerLosses}-${r.defenderLosses}`
      outcomes[key] = (outcomes[key] ?? 0) + 1
      total += 1
    }
  }

  const p = (k: string) => (outcomes[k] ?? 0) / total
  const pAL1 = p('1-0')
  const pAL2 = p('2-0')
  const pDL1 = p('0-1')
  const pDL2 = p('0-2')
  const pTrade = p('1-1')

  const expectedAttackerLoss = 1 * pAL1 + 2 * pAL2 + 1 * pTrade
  const expectedDefenderLoss = 1 * pDL1 + 2 * pDL2 + 1 * pTrade

  // Approximate advantage as defender losses - attacker losses per roll
  const advantage = expectedDefenderLoss - expectedAttackerLoss

  return {
    samples: total,
    probabilities: {
      attackerLoses1: pAL1,
      attackerLoses2: pAL2,
      defenderLoses1: pDL1,
      defenderLoses2: pDL2,
      trade11: pTrade,
    },
    expected: {
      attackerLoss: expectedAttackerLoss,
      defenderLoss: expectedDefenderLoss,
      advantage,
    },
  }
}
