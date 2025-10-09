import type { PoolClient, QueryResultRow } from 'pg';
export interface PlayerRating {
    userId: string;
    currentRating: number;
    gamesPlayed: number;
    position: number;
}
export interface RatingChange {
    userId: string;
    oldRating: number;
    newRating: number;
    change: number;
    expectedScore: number;
    actualScore: number;
    kFactor: number;
}
export interface SkillTier {
    name: string;
    minRating: number;
    maxRating: number;
    icon: string;
    color: string;
}
interface RatingHistoryEntryRow extends QueryResultRow {
    id: string;
    user_id: string;
    old_rating: number;
    new_rating: number;
    rating_change: number;
    game_room_id: string | null;
    reason: string;
    created_at: string;
}
interface LeaderboardRow extends QueryResultRow {
    user_id: string;
    username: string;
    skill_rating: number;
    rank_position: number;
    ranked_wins?: number | null;
    ranked_losses?: number | null;
}
export declare const SKILL_TIERS: SkillTier[];
export declare class EloService {
    private calculateKFactor;
    private calculateExpectedScore;
    private calculateActualScore;
    calculateRatingChanges(players: PlayerRating[]): RatingChange[];
    applyRatingChanges(gameId: string, changes: RatingChange[], client?: PoolClient): Promise<void>;
    private bulkInsertRatingHistory;
    private bulkUpdateUserRatings;
    getSkillTier(rating: number): SkillTier;
    canJoinRankedGame(playerRating: number, gameAvgRating: number, maxSkillGap?: number): boolean;
    getRatingHistory(userId: string, limit?: number): Promise<RatingHistoryEntryRow[]>;
    getLeaderboard(limit?: number, offset?: number): Promise<LeaderboardRow[]>;
    updateLeaderboardCache(client?: PoolClient): Promise<void>;
}
export declare const eloService: EloService;
export {};
//# sourceMappingURL=eloService.d.ts.map