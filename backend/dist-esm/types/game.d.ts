import type { AIDifficulty, KingOfTheHillConfig, KingOfTheHillState, Metal, SectorBonus, TreasureConfig, TreasureState } from '../shared/types';
export type { AIDifficulty, KingOfTheHillConfig, KingOfTheHillState, Metal, TreasureConfig, TreasureState, } from '../shared/types';
export type GamePhase = 'reinforcement' | 'attack' | 'fortify' | 'finished';
export interface GameTerritoryModifier {
    territory_id: string;
    defense_bonus: number;
    attack_bonus: number;
    troop_generation_bonus: number;
    movement_restriction: boolean;
    supply_line_bonus: boolean;
    icon: string;
    color: string;
    name: string;
}
export interface GameState {
    roomId: string;
    players: GamePlayer[];
    currentPlayer: string;
    phase: GamePhase;
    turn: number;
    version?: number;
    board: Territory[];
    cards: Card[];
    hasAttackedThisTurn?: boolean;
    lastBattleResult?: BattleResult;
    gameConfig: GameConfiguration;
    movementTracking?: Record<string, boolean>;
    territoryModifiers?: Map<string, GameTerritoryModifier>;
    capitalAssignments?: Record<string, string>;
    treasureState?: TreasureState;
    mustCashInTreasures?: boolean;
    conqueredDuringTurn?: boolean;
    assassinationTargets?: Record<string, string>;
    kingOfTheHillState?: KingOfTheHillState;
    reinforcementBaseline?: Record<string, number>;
    reinforcementHistory?: Array<{
        playerId: string;
        territoryId: string;
        armies: number;
        ts: number;
    }>;
    resumePhaseAfterReinforcement?: GamePhase | null;
    resumeHasAttackedAfterReinforcement?: boolean;
    fortifyHistory?: Array<{
        playerId: string;
        fromTerritoryId: string;
        toTerritoryId: string;
        armies: number;
        ts: number;
    }>;
    combatRngSeed?: string;
    combatRngState?: {
        a: number;
        b: number;
        c: number;
        d: number;
    };
}
export interface GamePlayer {
    id: string;
    username: string;
    color: string;
    armies: number;
    territories: string[];
    cards: Card[];
    isEliminated: boolean;
    skillRating?: number;
    capitalTerritory?: string;
    teamId?: number | null;
    isAi?: boolean;
    aiDifficulty?: AIDifficulty | null;
    aiPersonalitySeed?: number | null;
    treasures?: Metal[];
    mustCashInTreasures?: boolean;
}
export interface Territory {
    id: string;
    name: string;
    sector: string;
    continent?: string;
    ownerId: string | null;
    armies: number;
    adjacentTerritories: string[];
    isCapital?: boolean;
    capitalOwnerId?: string | null;
    coordinates?: {
        x: number;
        y: number;
    };
}
export interface Card {
    id: string;
    type: 'infantry' | 'cavalry' | 'artillery' | 'wild';
    territory?: string;
}
export type GameAction = DeployAction | AttackAction | FortifyAction | UndoFortifyAction | EndTurnAction | TradeCardsAction | GoBackToReinforcementAction;
type GameActionType = 'deploy' | 'attack' | 'fortify' | 'undo_fortify' | 'end_turn' | 'trade_cards' | 'go_back_to_reinforcement';
type ActionBase<T extends GameActionType> = {
    type: T;
    roomId: string;
    playerId: string;
};
export type DeployAction = ActionBase<'deploy'> & {
    payload: {
        territoryId: string;
        armies: number;
    };
};
export type AttackAction = ActionBase<'attack'> & {
    payload: {
        fromTerritoryId: string;
        toTerritoryId: string;
        armies?: number;
    };
};
export type FortifyAction = ActionBase<'fortify'> & {
    payload: {
        fromTerritoryId: string;
        toTerritoryId: string;
        armies: number;
    };
};
export type UndoFortifyAction = ActionBase<'undo_fortify'> & {
    payload?: undefined;
};
export type EndTurnAction = ActionBase<'end_turn'> & {
    payload?: undefined;
};
export type TradeCardsAction = ActionBase<'trade_cards'> & {
    payload?: {
        cards?: string[];
        treasureSet?: [number, number, number] | number[];
    };
};
export type GoBackToReinforcementAction = ActionBase<'go_back_to_reinforcement'> & {
    payload?: undefined;
};
export interface BattleResult {
    attackerDice: number[];
    defenderDice: number[];
    attackerLosses: number;
    defenderLosses: number;
    conquered: boolean;
    fromTerritory: {
        id: string;
        name: string;
        armies: number;
    };
    toTerritory: {
        id: string;
        name: string;
        armies: number;
        ownerId: string;
    };
    pendingConquestFor?: string | null;
    gameEnded?: boolean;
    winner?: GamePlayer | null;
    eliminatedPlayers?: string[];
}
export interface GameConfiguration {
    movementType: MovementType;
    allowTeamPlay?: boolean;
    teamMode?: 'none' | 'teams' | 'auto_balance';
    numberOfTeams?: number | null;
    teamAssignments?: Record<number, string[]>;
    maxPlayers: number;
    mapId?: string;
    gameMode?: string;
    sectorBonuses?: SectorBonus[];
    continentBonuses?: SectorBonus[];
    useTerritoryModifiers?: boolean;
    modifierDistribution?: ModifierDistribution;
    fogOfWar?: 'off' | 'adjacent' | 'persistent';
    treasureConfig?: TreasureConfig;
    kingOfTheHill?: KingOfTheHillConfig;
}
export type ContinentBonus = SectorBonus;
export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi';
export type ModifierDistribution = 'none' | 'sparse' | 'balanced' | 'abundant' | 'custom';
export type SerializedGameState = Omit<GameState, 'territoryModifiers'> & {
    territoryModifiers?: Record<string, GameTerritoryModifier>;
};
export type ProcessActionResult = {
    gameState: GameState;
    battleResult?: BattleResult;
};
//# sourceMappingURL=game.d.ts.map