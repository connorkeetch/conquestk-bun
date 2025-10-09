type MinimalRanking = {
    userId: string;
    isWinner: boolean;
    eliminated: boolean;
};
declare class AchievementService {
    private nameToId;
    private getAchievementIdByName;
    private unlockByName;
    handleGameCompleted(gameId: string, rankings: MinimalRanking[]): Promise<void>;
}
export declare const achievementService: AchievementService;
export default achievementService;
//# sourceMappingURL=achievementService.d.ts.map