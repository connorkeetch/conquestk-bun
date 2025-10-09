import type { ClanContributionResult, ClanObjective, ClanProgressionSummary } from '../types/clans.js';
interface AwardContributionOptions {
    clanId: string;
    userId: string;
    xp: number;
    matchesPlayed?: number;
    matchesWon?: number;
    actorUserId?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
    now?: Date;
}
export declare class ClanProgressionServiceError extends Error {
    code: string;
    constructor(code: string, message: string);
}
declare class ClanProgressionService {
    private getLevelIncrement;
    private calculateLevelInternal;
    private mapProgression;
    private mapObjective;
    private getProgressionRow;
    private pickObjectiveTemplates;
    private getActiveObjectivesInternal;
    private getObjectiveWindow;
    getProgressionSummary(clanId: string): Promise<ClanProgressionSummary>;
    ensureWeeklyObjectives(clanId: string, now?: Date): Promise<ClanObjective[]>;
    private applyObjectiveProgress;
    awardContribution(options: AwardContributionOptions): Promise<ClanContributionResult>;
}
export declare const clanProgressionService: ClanProgressionService;
export {};
//# sourceMappingURL=clanProgressionService.d.ts.map