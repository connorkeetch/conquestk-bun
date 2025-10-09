import { CacheService } from '../services/cacheService.js';
import { GameService } from '../services/gameService.js';
import type { JobIdempotencyService } from '../services/jobIdempotencyService.js';
type CleanupWorkerDependencies = {
    gameService?: GameService;
    cacheService?: CacheService;
    idempotencyService?: JobIdempotencyService;
};
export declare class CleanupWorker {
    private worker;
    private queueName;
    private gameService;
    private cacheService;
    private idempotencyService;
    private gameRoomService;
    constructor(dependencies?: CleanupWorkerDependencies);
    initialize(): Promise<void>;
    private pruneStaleLobbies;
    private cleanupGame;
    private cleanupFinishedGame;
    private cleanupTimedOutGame;
    private cleanupAbandonedGame;
    private performCommonCleanup;
    private cleanupTempResources;
    private calculatePlayerStats;
    private countTerritoriesByPlayer;
    private getTerritoryOwnerId;
    private getGameDuration;
    private scheduleAbandonedGameCleanup;
}
export declare const createCleanupWorker: () => CleanupWorker;
export {};
//# sourceMappingURL=cleanupWorker.d.ts.map