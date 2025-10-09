import type { AIDifficulty, GameAction, GameConfiguration, GamePhase, GamePlayer, GameState, SerializedGameState } from '../types/game.js';
import { type AIDecisionPlan, type DecisionBudget } from './aiDecisionService.js';
type BattleWorkerResult = {
    attackerLosses: number;
    defenderLosses: number;
    territoryConquered: boolean;
    attackingArmiesRemaining: number;
    defendingArmiesRemaining: number;
    dice: {
        attacker: number[];
        defender: number[];
    };
    jobId: string;
    attackingTerritoryId: string;
    defendingTerritoryId: string;
    attackingPlayerId: string;
    defendingPlayerId?: string | null;
    attackingArmiesCommitted: number;
    attackerArmiesBeforeRoll?: number;
    defenderArmiesBeforeRoll?: number;
};
type PlayerConfig = {
    userId: string;
    username?: string;
    teamId?: number | null;
    isAi?: boolean;
    aiDifficulty?: AIDifficulty | null;
    aiPersonalitySeed?: number | null;
    color?: string | null;
};
type BattleLogEntry = {
    type?: 'BATTLE';
    jobId: string;
    timestamp: string;
    engagementId?: string;
    attackingTerritoryId: string;
    defendingTerritoryId: string;
    attackerId: string;
    defenderId: string | null;
    losses: {
        attacker: number;
        defender: number;
    };
    conquered: boolean;
    movedArmies?: number;
    eliminatedPlayers: string[];
    initialFromArmies?: number;
    initialToArmies?: number;
};
type EngagementSummaryLogEntry = {
    type: 'ENGAGEMENT_SUMMARY';
    timestamp: string;
    engagementId: string;
    attackingTerritoryId: string;
    defendingTerritoryId: string;
    attackerId: string;
    defenderId: string | null;
    initialFromArmies: number;
    initialToArmies: number;
    totalLosses: {
        attacker: number;
        defender: number;
    };
    conquered: boolean;
};
type GameEndLogEntry = {
    type: 'GAME_END';
    timestamp: string;
    winner: string;
    eliminatedPlayers: string[];
};
type SectorBonusLogEntry = {
    type: 'SECTOR_BONUS';
    timestamp: string;
    playerId: string;
    sectorId: string;
    sectorName: string;
    bonus: number;
};
type FortifyLogEntry = {
    type: 'FORTIFY';
    timestamp: string;
    playerId: string;
    fromTerritoryId: string;
    toTerritoryId: string;
    movedArmies: number;
    fromArmies: number;
    toArmies: number;
};
type TurnLogEntry = {
    type: 'TURN';
    timestamp: string;
    playerId: string;
    event: 'START' | 'END' | 'MISSED';
    reinforcementArmies?: number;
    territoryCount?: number;
    turnNumber?: number;
    reason?: 'timeout';
};
type TreasureLogEntry = {
    type: 'TREASURE';
    timestamp: string;
    userId: string;
    metal: import('../types/game.js').Metal;
};
type LifecycleLogEntry = {
    type: 'LIFECYCLE';
    timestamp: string;
    event: 'CREATED' | 'STARTED';
};
type RngLogEntry = {
    type: 'RNG';
    timestamp: string;
    scope: 'combat';
    algorithm: 'sfc32';
    seed: string;
};
type ReinforceLogEntry = {
    type: 'REINFORCE';
    timestamp: string;
    playerId: string;
    territoryId: string;
    armies: number;
    remainingArmies: number;
};
type RatingLogEntry = {
    type: 'RATING';
    timestamp: string;
    userId: string;
    change: number;
    oldRating: number;
    newRating: number;
};
type TreasureCashLogEntry = {
    type: 'TREASURE_CASH';
    timestamp: string;
    playerId: string;
    troops: number;
    cardCount?: number;
    cards?: string[];
};
type GameLogEntry = BattleLogEntry | FortifyLogEntry | TurnLogEntry | TreasureLogEntry | ReinforceLogEntry | LifecycleLogEntry | ReinforceLogEntry | RatingLogEntry | TreasureCashLogEntry | EngagementSummaryLogEntry | RngLogEntry | GameEndLogEntry | SectorBonusLogEntry;
export declare class GameService {
    private gameEngine;
    private persistGameStateSnapshot;
    private persistTurnStateTransactional;
    saveSnapshot(roomId: string, state: SerializedGameState): Promise<void>;
    private serializeGameState;
    private cloneGameState;
    private normalizeAction;
    private applyActions;
    private limitFallbackActions;
    private recordAssassinationAssignments;
    private recordAssassinationElimination;
    private hydrateGameState;
    executeAiTurn(roomId: string, budgetOverrides?: Partial<DecisionBudget>): Promise<{
        plan: AIDecisionPlan;
        appliedActions: GameAction[];
        fallbackUsed: boolean;
        fallbackReason?: string;
        gameState: GameState;
    }>;
    isCapitalTerritory(roomId: string, territoryId: string | number): Promise<boolean>;
    processGameAction(action: GameAction, userId: string): Promise<GameState>;
    initializeGame(roomId: string, players: PlayerConfig[], gameConfig?: Partial<GameConfiguration>): Promise<GameState>;
    neutralizePlayerAndResolve(roomId: string, userId: string): Promise<{
        state: SerializedGameState;
        elimination: {
            gameEnded: boolean;
            winner: GamePlayer | null;
            eliminatedPlayers: string[];
        };
    } | null>;
    getGameState(roomId: string): Promise<GameState | null>;
    deployArmies(roomId: string, userId: string, territoryId: string, armies: number): Promise<{
        gameState: SerializedGameState;
        territoryId: string;
        armies: number;
    }>;
    attack(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string): Promise<{
        gameEnded: boolean;
        winner: GamePlayer | null;
        eliminatedPlayers: string[];
    }>;
    transferConquestArmies(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string, armies: number): Promise<{
        gameState: SerializedGameState;
        fromArmies: number;
        toArmies: number;
    }>;
    fortify(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string, armies: number): Promise<{
        gameState: SerializedGameState;
        fromTerritoryId: string;
        toTerritoryId: string;
        fromArmies: number;
        toArmies: number;
    }>;
    endTurn(roomId: string, userId: string, options?: {
        allowEarlyEnd?: boolean;
        endedByTimeout?: boolean;
    }): Promise<{
        gameState: SerializedGameState;
        reinforcementArmies: number;
        treasureAwarded: any;
        turnAdvanced: boolean;
    }>;
    private isValidAction;
    processPlaceArmies(gameId: string, data: {
        territoryId: string;
        armies: number;
        playerId: string;
    }): Promise<{
        armies: number;
        playerArmies?: number;
        phaseChanged?: {
            phase: GamePhase;
            currentPlayer: string;
            turn: number;
            reinforcementArmies?: number;
        };
    }>;
    processFortify(gameId: string, data: {
        fromTerritoryId: string;
        toTerritoryId: string;
        armies: number;
        playerId: string;
    }): Promise<{
        fromArmies: number;
        toArmies: number;
    }>;
    processEndTurn(gameId: string, playerId: string): Promise<{
        id: string;
    }>;
    acknowledgeTurnStart(roomId: string, userId: string): Promise<{
        logged: boolean;
        reinforcementArmies: number;
        turnNumber: number;
    }>;
    processGoBackToReinforcement(gameId: string, playerId: string): Promise<{
        phase: GamePhase;
        currentPlayer: string;
        turn: number;
        reinforcementArmies: number;
        version?: number;
    }>;
    processPhaseChange(gameId: string, playerId: string, phase: GamePhase): Promise<void>;
    applyBattleResult(gameId: string, payload: BattleWorkerResult): Promise<{
        applied: boolean;
    }>;
    private rebuildPlayersAfterBattle;
    private buildPlayerStats;
    private calculateTerritoryDivergence;
    private normalizeTerritoriesInput;
    appendTurnStats(roomId: string, snapshot: {
        turn: number;
        phase: string;
        currentPlayerId: string;
        timestamp: string;
        players: Array<{
            id: string;
            territories: number;
            armies: number;
            eliminated: boolean;
        }>;
    }): Promise<void>;
    buildTurnStatsSnapshot(state: GameState, at?: Date): {
        turn: number;
        phase: GamePhase;
        currentPlayerId: string;
        timestamp: string;
        players: {
            id: string;
            territories: number;
            armies: number;
            eliminated: boolean;
        }[];
    };
    private calculateRoundNumber;
    private buildEliminationOrder;
    private buildPlayerRanking;
    private calculateClanXp;
    private awardClanContributions;
    private emitClanProgressionUpdate;
    private finalizeCompletedGame;
    archiveGameResults(gameId: string, results: Record<string, unknown>): Promise<void>;
    archiveGameMoves(gameId: string): Promise<{
        archived: number;
    }>;
    updateEloRatings(gameId: string, _gameState: unknown): Promise<void>;
    recordGameHistory(gameId: string, _gameState: unknown): Promise<void>;
    removeFromActiveGames(gameId: string): Promise<void>;
    getIdleGames(_threshold: number): Promise<string[]>;
    markPlayerAsInactive(gameId: string, playerId: string): Promise<void>;
    pauseGame(gameId: string): Promise<void>;
    deleteGame(gameId: string): Promise<void>;
    cleanupTemporaryData(gameId: string): Promise<void>;
    cleanupAbandonedGame(gameId: string): Promise<void>;
    logCleanup(gameId: string, reason: string): Promise<void>;
    archiveGame(gameId: string): Promise<void>;
    findAbandonedGames(thresholdMs: number): Promise<string[]>;
    cleanupFinishedGames(roomIds: string[]): Promise<void>;
    removeGame(roomId: string): Promise<void>;
    getBattleLog(roomId: string): Promise<GameLogEntry[]>;
    appendLog(roomId: string, entries: GameLogEntry[]): Promise<void>;
}
export {};
//# sourceMappingURL=gameService.d.ts.map