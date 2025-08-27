import { EloService, PlayerRating, RatingChange } from './eloService'

// Mock the database query function
jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}))

describe('EloService', () => {
  let eloService: EloService

  beforeEach(() => {
    eloService = new EloService()
  })

  describe('calculateRatingChanges', () => {
    it('should handle a basic 3-player game', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 }, // Winner
        { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 }, // Second
        { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 }, // Third
      ]

      const changes = eloService.calculateRatingChanges(players)
      
      expect(changes).toHaveLength(3)
      
      // Winner should gain rating
      const winnerChange = changes.find(c => c.userId === 'p1')
      expect(winnerChange!.change).toBeGreaterThan(0)
      
      // Others should lose rating
      const secondChange = changes.find(c => c.userId === 'p2')
      expect(secondChange!.change).toBeLessThan(0)
      
      const thirdChange = changes.find(c => c.userId === 'p3')
      expect(thirdChange!.change).toBeLessThan(0)
      
      // Second place should lose less than third
      expect(Math.abs(secondChange!.change)).toBeLessThan(Math.abs(thirdChange!.change))
      
      // Sum of all changes should be close to zero (zero-sum game)
      const totalChange = changes.reduce((sum, c) => sum + c.change, 0)
      expect(Math.abs(totalChange)).toBeLessThan(3) // Allow small rounding differences
    })

    it('should apply higher K-factor for new players', () => {
      const newPlayers: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 5, position: 1 }, // New player wins
        { userId: 'p2', currentRating: 1000, gamesPlayed: 100, position: 2 }, // Experienced
        { userId: 'p3', currentRating: 1000, gamesPlayed: 100, position: 3 }, // Experienced
      ]

      const experiencedPlayers: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 100, position: 1 }, // Experienced wins
        { userId: 'p2', currentRating: 1000, gamesPlayed: 100, position: 2 },
        { userId: 'p3', currentRating: 1000, gamesPlayed: 100, position: 3 },
      ]

      const newPlayerChanges = eloService.calculateRatingChanges(newPlayers)
      const experiencedChanges = eloService.calculateRatingChanges(experiencedPlayers)
      
      const newWinnerChange = newPlayerChanges.find(c => c.userId === 'p1')!.change
      const expWinnerChange = experiencedChanges.find(c => c.userId === 'p1')!.change
      
      // New player should have larger rating change due to higher K-factor
      expect(Math.abs(newWinnerChange)).toBeGreaterThan(Math.abs(expWinnerChange))
    })

    it('should handle games with rating disparities correctly', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 800, gamesPlayed: 50, position: 1 }, // Underdog wins
        { userId: 'p2', currentRating: 1200, gamesPlayed: 50, position: 2 }, // Favorite loses
        { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
      ]

      const changes = eloService.calculateRatingChanges(players)
      
      const underdogChange = changes.find(c => c.userId === 'p1')!
      const favoriteChange = changes.find(c => c.userId === 'p2')!
      
      // Underdog should gain more for winning
      expect(underdogChange.change).toBeGreaterThan(20)
      
      // Favorite should lose more for not winning
      expect(favoriteChange.change).toBeLessThan(-10)
    })

    it('should scale K-factor with number of players', () => {
      const fourPlayers: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
        { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
        { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
        { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
      ]

      const eightPlayers: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
        { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
        { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
        { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
        { userId: 'p5', currentRating: 1000, gamesPlayed: 50, position: 5 },
        { userId: 'p6', currentRating: 1000, gamesPlayed: 50, position: 6 },
        { userId: 'p7', currentRating: 1000, gamesPlayed: 50, position: 7 },
        { userId: 'p8', currentRating: 1000, gamesPlayed: 50, position: 8 },
      ]

      const fourPlayerChanges = eloService.calculateRatingChanges(fourPlayers)
      const eightPlayerChanges = eloService.calculateRatingChanges(eightPlayers)
      
      const fourWinner = fourPlayerChanges.find(c => c.userId === 'p1')!
      const eightWinner = eightPlayerChanges.find(c => c.userId === 'p1')!
      
      // K-factor should be different based on player count
      expect(fourWinner.kFactor).toBe(24) // 24 * (4/4) = 24
      expect(eightWinner.kFactor).toBe(48) // 24 * (8/4) = 48
    })

    it('should apply position-based adjustments correctly', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
        { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
        { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
        { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
      ]

      const changes = eloService.calculateRatingChanges(players)
      
      const firstPlace = changes.find(c => c.userId === 'p1')!
      const secondPlace = changes.find(c => c.userId === 'p2')!
      const thirdPlace = changes.find(c => c.userId === 'p3')!
      const fourthPlace = changes.find(c => c.userId === 'p4')!
      
      // First place should have actual score of 1.0
      expect(firstPlace.actualScore).toBe(1.0)
      
      // Position-based adjustments should be applied
      // 2nd place gets 75% of base score
      expect(secondPlace.actualScore).toBeCloseTo(0.75 * (3/3), 2)
      
      // 3rd place gets 50% of base score  
      expect(thirdPlace.actualScore).toBeCloseTo(0.5 * (2/3), 2)
      
      // 4th place gets 25% of base score
      expect(fourthPlace.actualScore).toBeCloseTo(0.25 * (1/3), 2)
    })

    it('should never allow rating to go below 0', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1500, gamesPlayed: 50, position: 1 }, // High rated wins
        { userId: 'p2', currentRating: 100, gamesPlayed: 50, position: 2 }, // Very low rated
        { userId: 'p3', currentRating: 50, gamesPlayed: 50, position: 3 }, // Extremely low rated
      ]

      const changes = eloService.calculateRatingChanges(players)
      
      // Even with large losses, ratings should not go below 0
      changes.forEach(change => {
        expect(change.newRating).toBeGreaterThanOrEqual(0)
      })
    })

    it('should throw error for games with less than 3 players', () => {
      const players: PlayerRating[] = [
        { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
        { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
      ]

      expect(() => eloService.calculateRatingChanges(players)).toThrow(
        'Ranked games require at least 3 players'
      )
    })
  })

  describe('getSkillTier', () => {
    it('should return correct tier for rating', () => {
      expect(eloService.getSkillTier(500).name).toBe('Bronze')
      expect(eloService.getSkillTier(850).name).toBe('Silver')
      expect(eloService.getSkillTier(1100).name).toBe('Gold')
      expect(eloService.getSkillTier(1300).name).toBe('Platinum')
      expect(eloService.getSkillTier(1500).name).toBe('Master')
      expect(eloService.getSkillTier(1700).name).toBe('Grandmaster')
      expect(eloService.getSkillTier(2000).name).toBe('Grandmaster')
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