import type { Metal, TreasureConfig, TreasureState } from '../types/game.js';
export type TreasureSetPattern = 'three_of_a_kind' | 'one_of_each' | 'diamond_combo';
export interface TreasureSetMatch {
    indices: [number, number, number];
    metals: [Metal, Metal, Metal];
    pattern: TreasureSetPattern;
    hasDiamond: boolean;
}
export interface RedeemResult {
    troops: number;
    updatedHand: Metal[];
    updatedState: TreasureState;
    hasDiamond: boolean;
    pattern: TreasureSetPattern;
}
export declare const getDefaultTreasureConfig: () => TreasureConfig;
export declare const clampDiamondsPercent: (value: number) => number;
export declare function normalizeTreasureConfig(config?: Partial<TreasureConfig>): TreasureConfig;
export declare function drawTreasure(config: TreasureConfig): Metal;
export declare function getPayout(state: TreasureState, config: TreasureConfig): {
    amount: number;
    state: TreasureState;
};
export declare function findRedeemableSets(hand: Metal[]): TreasureSetMatch[];
export declare function redeemSet(hand: Metal[], indices: [number, number, number], config: TreasureConfig, state: TreasureState): RedeemResult;
export declare function ensureTreasureState(state?: TreasureState): TreasureState;
//# sourceMappingURL=hiddenTreasures.d.ts.map