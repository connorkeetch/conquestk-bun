// Shared rank thresholds to keep frontend and backend in sync
// Names and minimum rating cutoffs only; UI colors/insignia are layered per-app.

export type RankDef = {
  name: string
  minRating: number
}

export const RANKS: RankDef[] = [
  { name: 'Chieftain', minRating: 0 },
  { name: 'Warlord', minRating: 600 },
  { name: 'Raider King', minRating: 800 },
  { name: 'Sultan', minRating: 1000 },
  { name: 'Caesar', minRating: 1200 },
  { name: 'Khan', minRating: 1400 },
  { name: 'Emperor', minRating: 1600 },
  { name: 'The Great King', minRating: 1800 },
  { name: 'Overlord', minRating: 2000 },
  { name: 'Worldbreaker', minRating: 2200 },
]

export function getRankForRating(rating: number): RankDef {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (rating >= RANKS[i].minRating) return RANKS[i]
  }
  return RANKS[0]
}

