import { EloService, type PlayerRating } from './eloService.js'

// Mock the database query function
jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}))

describe('EloService', () => {
  let eloService: EloService

  beforeEach(() => {
    eloService = new EloService()
  })

  describe('calculateRatingChanges (Pairwise Elo)', () => {
    it('1v1 equal ratings: winner gains ~K/2 (12), loser -12', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1200, gamesPlayed: 20, position: 1 },
        { userId: 'p2', currentRating: 1200, gamesPlayed: 20, position: 2 },
      ]
      const changes = eloService.calculateRatingChanges(players)
      const a = changes.find((c) => c.userId === 'p1')!
      const b = changes.find((c) => c.userId === 'p2')!
      expect(a.change).toBe(12)
      expect(b.change).toBe(-12)
      expect(changes.reduce((s, c) => s + c.change, 0)).toBe(0)
    })

    it('3-player equal ratings: ranks 1/2/3 -> [+17, ~0, -17]', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1200, gamesPlayed: 20, position: 1 },
        { userId: 'p2', currentRating: 1200, gamesPlayed: 20, position: 2 },
        { userId: 'p3', currentRating: 1200, gamesPlayed: 20, position: 3 },
      ]
      const changes = eloService.calculateRatingChanges(players)
      const p1 = changes.find((c) => c.userId === 'p1')!
      const p2 = changes.find((c) => c.userId === 'p2')!
      const p3 = changes.find((c) => c.userId === 'p3')!
      expect(p1.change).toBe(17)
      expect(Math.abs(p2.change)).toBeLessThanOrEqual(1)
      expect(p3.change).toBe(-17)
      expect(changes.reduce((s, c) => s + c.change, 0)).toBe(0)
    })

    it('Upset: lower-rated winner vs higher-rated players gains > 17 in 3P', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 20, position: 1 },
        { userId: 'p2', currentRating: 1300, gamesPlayed: 20, position: 2 },
        { userId: 'p3', currentRating: 1300, gamesPlayed: 20, position: 3 },
      ]
      const changes = eloService.calculateRatingChanges(players)
      const p1 = changes.find((c) => c.userId === 'p1')!
      expect(p1.change).toBeGreaterThan(17)
      expect(changes.reduce((s, c) => s + c.change, 0)).toBe(0)
    })

    it('K scales with sqrt(n-1): 4p > 2p for winner', () => {
      const two: PlayerRating[] = [
        { userId: 'a', currentRating: 1200, gamesPlayed: 20, position: 1 },
        { userId: 'b', currentRating: 1200, gamesPlayed: 20, position: 2 },
      ]
      const four: PlayerRating[] = [
        { userId: 'a', currentRating: 1200, gamesPlayed: 20, position: 1 },
        { userId: 'b', currentRating: 1200, gamesPlayed: 20, position: 2 },
        { userId: 'c', currentRating: 1200, gamesPlayed: 20, position: 3 },
        { userId: 'd', currentRating: 1200, gamesPlayed: 20, position: 4 },
      ]
      const c2 = eloService.calculateRatingChanges(two)
      const c4 = eloService.calculateRatingChanges(four)
      expect(c4.find((c) => c.userId === 'a')!.change).toBeGreaterThan(
        c2.find((c) => c.userId === 'a')!.change,
      )
    })

    it('Clamp floor at 800', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 805, gamesPlayed: 100, position: 3 },
        { userId: 'p2', currentRating: 1500, gamesPlayed: 100, position: 1 },
        { userId: 'p3', currentRating: 1500, gamesPlayed: 100, position: 2 },
      ]
      const changes = eloService.calculateRatingChanges(players)
      const p1 = changes.find((c) => c.userId === 'p1')!
      expect(p1.newRating).toBeGreaterThanOrEqual(800)
    })
  })

  describe('getSkillTier', () => {
    it('should return correct tier for rating', () => {
      expect(eloService.getSkillTier(500).name).toBe('Chieftain')
      expect(eloService.getSkillTier(850).name).toBe('Raider King')
      expect(eloService.getSkillTier(1100).name).toBe('Sultan')
      expect(eloService.getSkillTier(1300).name).toBe('Caesar')
      expect(eloService.getSkillTier(1500).name).toBe('Khan')
      expect(eloService.getSkillTier(1700).name).toBe('Emperor')
      expect(eloService.getSkillTier(2000).name).toBe('Overlord')
    })
  })

  describe('canJoinRankedGame', () => {
    it('should allow players within skill gap', () => {
      expect(eloService.canJoinRankedGame(1200, 1100, 500)).toBe(true)
      expect(eloService.canJoinRankedGame(1000, 1400, 500)).toBe(true)
      expect(eloService.canJoinRankedGame(800, 1200, 500)).toBe(true)
    })

    it('should reject players outside skill gap', () => {
      expect(eloService.canJoinRankedGame(1000, 1600, 500)).toBe(false)
      expect(eloService.canJoinRankedGame(500, 1100, 500)).toBe(false)
      expect(eloService.canJoinRankedGame(2000, 1400, 500)).toBe(false)
    })
  })
})
