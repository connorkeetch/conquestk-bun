export type RollOdds = {
  samples: number
  probabilities: {
    attackerLoses1: number
    attackerLoses2: number
    defenderLoses1: number
    defenderLoses2: number
    trade11: number
  }
  expected: {
    attackerLoss: number
    defenderLoss: number
    advantage: number
  }
}

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

function compareHighest(att: number[], def: number[]) {
  const a = [...att].sort((x, y) => y - x)
  const d = [...def].sort((x, y) => y - x)
  const pairs = Math.min(a.length, d.length)
  let attackerLosses = 0
  let defenderLosses = 0
  for (let i = 0; i < pairs; i++) {
    const av = a[i] ?? 0
    const dv = d[i] ?? 0
    if (av > dv) defenderLosses++
    else attackerLosses++
  }
  return { attackerLosses, defenderLosses }
}

export function computeRollOdds(attDice: 1 | 2 | 3, defDice: 1 | 2): RollOdds {
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
      advantage: expectedDefenderLoss - expectedAttackerLoss,
    },
  }
}
