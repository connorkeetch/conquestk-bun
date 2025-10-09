import type { AIDifficulty, GameAction, GamePlayer, GameState } from '../types/game.js';
type FallbackReason = 'stubbed' | 'timeout' | 'aborted';
export interface DecisionBudget {
    maxThinkTimeMs: number;
    maxPlannedActions?: number;
    readableDelayMs?: number;
    maxAttackChains?: number;
    minAttackOddsByTier?: {
        recruit?: number;
        commander?: number;
        grandmaster?: number;
    };
    allowOneSpiceAttack?: boolean;
    signal?: AbortSignal;
}
export interface DecisionRequest {
    gameState: GameState;
    player: GamePlayer;
    difficulty: AIDifficulty;
    budget: DecisionBudget;
}
export interface AIDecisionPlan {
    actions: GameAction[];
    usedFallback: boolean;
    reason?: FallbackReason;
    diagnostics: {
        generatedAt: string;
        durationMs: number;
        requestedDifficulty: AIDifficulty;
        plannedActionCount: number;
        budget: {
            maxThinkTimeMs: number;
            maxPlannedActions?: number;
            readableDelayMs?: number;
            maxAttackChains?: number;
            minAttackOddsByTier?: {
                recruit?: number;
                commander?: number;
                grandmaster?: number;
            };
            allowOneSpiceAttack?: boolean;
        };
    };
}
declare class AIDecisionService {
    chooseAction(request: DecisionRequest): Promise<AIDecisionPlan>;
    private generatePlan;
    private generateCommanderPlan;
    private chooseCommanderReinforcement;
    private findCommanderAttack;
    private generateGrandmasterPlan;
    private findGrandmasterAttack;
    private estimateAttackEV;
    private findGrandmasterFortify;
    private sectorCaptureValue;
    private simulateBattle;
    private rollDice;
    private generateRecruitPlan;
    private buildReinforcementAction;
    private findRecruitAttack;
    private findRecruitFortify;
    private enforceBudget;
    private hasEnemyNeighbor;
    private isHostileTerritory;
    private arePlayersTeammates;
    private getTerritory;
    buildFallbackPlan(gameState: GameState, playerId: string): GameAction[];
    private createFallbackPlan;
}
export declare const aiDecisionService: AIDecisionService;
export {};
//# sourceMappingURL=aiDecisionService.d.ts.map