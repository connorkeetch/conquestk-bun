export type PruneNotificationsOptions = {
    retentionDays: number;
    includeUnread?: boolean;
};
export type PruneSummary = {
    deleted: number;
    ranAt: string;
};
export declare class MaintenanceService {
    pruneNotifications(options: PruneNotificationsOptions): Promise<PruneSummary>;
    prunePasswordResetTokens(): Promise<PruneSummary>;
    archiveCompletedGameMoves(options?: {
        gameLimit?: number;
    }): Promise<{
        archivedMoves: number;
        archivedGames: number;
        ranAt: string;
    }>;
    refreshSkillLeaderboardCache(): Promise<{
        refreshed: boolean;
        ranAt: string;
    }>;
}
export declare const maintenanceService: MaintenanceService;
//# sourceMappingURL=maintenanceService.d.ts.map