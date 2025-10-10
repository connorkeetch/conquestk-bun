import type { BattleResultDelta, GameEndDelta, PhaseChangeDelta, PlayerDelta as PlayerUpdateDelta, TerritoryDelta as TerritoryUpdateDelta } from '../../../shared/types';
type BattleResultPayload = BattleResultDelta['battleResult'];
export declare const DeltaBuilder: {
    readonly territoryUpdate: (roomId: string, territoryId: string, changes: {
        armies?: number;
        ownerId?: string;
    }, version?: number) => TerritoryUpdateDelta;
    readonly playerUpdate: (roomId: string, playerId: string, changes: {
        armies?: number;
        territories?: string[];
        isEliminated?: boolean;
        mustCashInTreasures?: boolean;
    }, version?: number) => PlayerUpdateDelta;
    readonly phaseChange: (roomId: string, phase: PhaseChangeDelta["phase"], currentPlayer: string, turn?: number, reinforcementArmies?: number, version?: number) => PhaseChangeDelta;
    readonly battleResult: (roomId: string, battleResult: BattleResultPayload, version?: number) => BattleResultDelta;
    readonly gameEnd: (roomId: string, winner: string, eliminatedPlayers: string[], version?: number) => GameEndDelta;
};
export {};
//# sourceMappingURL=deltaUpdates.d.ts.map