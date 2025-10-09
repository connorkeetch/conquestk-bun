"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eloService_js_1 = require("./eloService.js");
jest.mock('../config/database', () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
}));
describe('EloService', () => {
    let eloService;
    beforeEach(() => {
        eloService = new eloService_js_1.EloService();
    });
    describe('calculateRatingChanges', () => {
        it('should handle a basic 3-player game', () => {
            const players = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
            ];
            const changes = eloService.calculateRatingChanges(players);
            expect(changes).toHaveLength(3);
            const winnerChange = changes.find((c) => c.userId === 'p1');
            expect(winnerChange.change).toBeGreaterThan(0);
            const secondChange = changes.find((c) => c.userId === 'p2');
            expect(secondChange.change).toBeLessThan(0);
            const thirdChange = changes.find((c) => c.userId === 'p3');
            expect(thirdChange.change).toBeLessThan(0);
            expect(Math.abs(secondChange.change)).toBeLessThan(Math.abs(thirdChange.change));
            const totalChange = changes.reduce((sum, c) => sum + c.change, 0);
            expect(Math.abs(totalChange)).toBeLessThan(3);
        });
        it('should apply higher K-factor for new players', () => {
            const newPlayers = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 5, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 100, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 100, position: 3 },
            ];
            const experiencedPlayers = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 100, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 100, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 100, position: 3 },
            ];
            const newPlayerChanges = eloService.calculateRatingChanges(newPlayers);
            const experiencedChanges = eloService.calculateRatingChanges(experiencedPlayers);
            const newWinnerChange = newPlayerChanges.find((c) => c.userId === 'p1').change;
            const expWinnerChange = experiencedChanges.find((c) => c.userId === 'p1').change;
            expect(Math.abs(newWinnerChange)).toBeGreaterThan(Math.abs(expWinnerChange));
        });
        it('should handle games with rating disparities correctly', () => {
            const players = [
                { userId: 'p1', currentRating: 800, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1200, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
            ];
            const changes = eloService.calculateRatingChanges(players);
            const underdogChange = changes.find((c) => c.userId === 'p1');
            const favoriteChange = changes.find((c) => c.userId === 'p2');
            expect(underdogChange.change).toBeGreaterThan(0);
            expect(favoriteChange.change).toBeLessThan(0);
            expect(Math.abs(underdogChange.change)).toBeGreaterThan(Math.abs(favoriteChange.change));
        });
        it('should scale K-factor with number of players', () => {
            const fourPlayers = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
                { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
            ];
            const eightPlayers = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
                { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
                { userId: 'p5', currentRating: 1000, gamesPlayed: 50, position: 5 },
                { userId: 'p6', currentRating: 1000, gamesPlayed: 50, position: 6 },
                { userId: 'p7', currentRating: 1000, gamesPlayed: 50, position: 7 },
                { userId: 'p8', currentRating: 1000, gamesPlayed: 50, position: 8 },
            ];
            const fourPlayerChanges = eloService.calculateRatingChanges(fourPlayers);
            const eightPlayerChanges = eloService.calculateRatingChanges(eightPlayers);
            const fourWinner = fourPlayerChanges.find((c) => c.userId === 'p1');
            const eightWinner = eightPlayerChanges.find((c) => c.userId === 'p1');
            expect(fourWinner.kFactor).toBe(24);
            expect(eightWinner.kFactor).toBe(48);
        });
        it('should apply position-based adjustments correctly', () => {
            const players = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 1000, gamesPlayed: 50, position: 3 },
                { userId: 'p4', currentRating: 1000, gamesPlayed: 50, position: 4 },
            ];
            const changes = eloService.calculateRatingChanges(players);
            const firstPlace = changes.find((c) => c.userId === 'p1');
            const secondPlace = changes.find((c) => c.userId === 'p2');
            const thirdPlace = changes.find((c) => c.userId === 'p3');
            const fourthPlace = changes.find((c) => c.userId === 'p4');
            expect(firstPlace.actualScore).toBe(1.0);
            expect(secondPlace.actualScore).toBeCloseTo(0.5, 2);
            expect(thirdPlace.actualScore).toBeCloseTo(1 / 6, 2);
            expect(fourthPlace.actualScore).toBeCloseTo(0, 2);
        });
        it('should never allow rating to go below 0', () => {
            const players = [
                { userId: 'p1', currentRating: 1500, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 100, gamesPlayed: 50, position: 2 },
                { userId: 'p3', currentRating: 50, gamesPlayed: 50, position: 3 },
            ];
            const changes = eloService.calculateRatingChanges(players);
            changes.forEach((change) => {
                expect(change.newRating).toBeGreaterThanOrEqual(0);
            });
        });
        it('should throw error for games with less than 3 players', () => {
            const players = [
                { userId: 'p1', currentRating: 1000, gamesPlayed: 50, position: 1 },
                { userId: 'p2', currentRating: 1000, gamesPlayed: 50, position: 2 },
            ];
            expect(() => eloService.calculateRatingChanges(players)).toThrow('Ranked games require at least 3 players');
        });
    });
    describe('getSkillTier', () => {
        it('should return correct tier for rating', () => {
            expect(eloService.getSkillTier(500).name).toBe('Chieftain');
            expect(eloService.getSkillTier(850).name).toBe('Raider King');
            expect(eloService.getSkillTier(1100).name).toBe('Sultan');
            expect(eloService.getSkillTier(1300).name).toBe('Caesar');
            expect(eloService.getSkillTier(1500).name).toBe('Khan');
            expect(eloService.getSkillTier(1700).name).toBe('Emperor');
            expect(eloService.getSkillTier(2000).name).toBe('Overlord');
        });
    });
    describe('canJoinRankedGame', () => {
        it('should allow players within skill gap', () => {
            expect(eloService.canJoinRankedGame(1200, 1100, 500)).toBe(true);
            expect(eloService.canJoinRankedGame(1000, 1400, 500)).toBe(true);
            expect(eloService.canJoinRankedGame(800, 1200, 500)).toBe(true);
        });
        it('should reject players outside skill gap', () => {
            expect(eloService.canJoinRankedGame(1000, 1600, 500)).toBe(false);
            expect(eloService.canJoinRankedGame(500, 1100, 500)).toBe(false);
            expect(eloService.canJoinRankedGame(2000, 1400, 500)).toBe(false);
        });
    });
});
//# sourceMappingURL=eloService.test.js.map