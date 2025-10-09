export declare class MaintenanceWorker {
    private timer;
    private leaderboardTimer;
    private worker;
    initialize(): Promise<void>;
    runOnce(source: 'startup' | 'interval' | 'manual'): Promise<{
        notifications: import("../services/maintenanceService.js").PruneSummary;
        passwordResetTokens: import("../services/maintenanceService.js").PruneSummary;
        archivedMoves: {
            archivedMoves: number;
            archivedGames: number;
            ranAt: string;
        };
    }>;
    shutdown(): void;
}
export declare const createMaintenanceWorker: () => MaintenanceWorker;
//# sourceMappingURL=maintenanceWorker.d.ts.map