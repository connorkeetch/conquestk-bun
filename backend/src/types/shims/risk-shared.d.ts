declare module '@conquestk/shared/constants/ranks' {
  export interface RankDef {
    name: string
    minRating: number
  }
  export const RANKS: RankDef[]
  export function getRankForRating(rating: number): RankDef
}
