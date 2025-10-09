import { describe, expect, it } from 'vitest'
import { getConquestRank } from './RankInsignia'

const cases: Array<{ rating: number; name: string }> = [
  { rating: 0, name: 'Chieftain' },
  { rating: 599, name: 'Chieftain' },
  { rating: 600, name: 'Warlord' },
  { rating: 799, name: 'Warlord' },
  { rating: 800, name: 'Raider King' },
  { rating: 999, name: 'Raider King' },
  { rating: 1000, name: 'Sultan' },
  { rating: 1199, name: 'Sultan' },
  { rating: 1200, name: 'Caesar' },
  { rating: 1399, name: 'Caesar' },
  { rating: 1400, name: 'Khan' },
  { rating: 1599, name: 'Khan' },
  { rating: 1600, name: 'Emperor' },
  { rating: 1799, name: 'Emperor' },
  { rating: 1800, name: 'The Great King' },
  { rating: 1999, name: 'The Great King' },
  { rating: 2000, name: 'Overlord' },
  { rating: 2199, name: 'Overlord' },
  { rating: 2200, name: 'Worldbreaker' },
  { rating: 5000, name: 'Worldbreaker' },
]

describe('getConquestRank thresholds', () => {
  it.each(cases.map((c) => [c.rating, c.name]))('rating %d -> %s', (rating, expected) => {
    const r = getConquestRank(rating as number)
    expect(r.name).toBe(expected)
  })
})
