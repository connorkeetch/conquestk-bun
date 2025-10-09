export interface CapitalGameState {
    gameId: string;
    capitalsEnabled: boolean;
    capitals: Map<string, string>;
    eliminatedPlayers: Set<string>;
}
export interface CapitalAttackResult {
    territoryId: string;
    attackerId: string;
    defenderId: string;
    isCapital: boolean;
    capitalElimination?: {
        eliminatedPlayer: string;
        territoriesGained: string[];
        troopsGained: number;
    };
}
export declare class CapitalGameService {
    private gameStates;
    private normalizeTerritoryId;
    private getOrCreateState;
    private getCachedGameState;
    private persistCapitalState;
    initializeCapitals(gameId: string, playerCount: number, mapId: string): Promise<void>;
    checkCapitalElimination(gameId: string, territoryId: string | number, attackerId: string, defenderId: string): Promise<CapitalAttackResult>;
    private emitCapitalElimination;
    emitCapitalUnderAttack(gameId: string, defenderId: string, territoryId: string | number): void;
    getCapitalDefenseBonus(gameId: string, territoryId: string | number, defenderId: string): number;
    canMoveFromCapital(gameId: string, playerId: string, territoryId: string | number, troopsToMove: number): boolean;
    getGameCapitals(gameId: string): Map<string, string> | null;
    isPlayerEliminated(gameId: string, playerId: string): boolean;
    cleanupGameState(gameId: string): void;
}
declare const _default: CapitalGameService;
export default _default;
//# sourceMappingURL=capitalGameService.d.ts.map