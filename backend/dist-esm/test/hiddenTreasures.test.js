"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const hiddenTreasures_1 = require("../game/hiddenTreasures");
describe('Hidden Treasures utilities', () => {
    afterEach(() => {
        globals_1.jest.restoreAllMocks();
    });
    it('normalizes configuration with defaults', () => {
        const config = (0, hiddenTreasures_1.normalizeTreasureConfig)({ enabled: false, fixedValue: 99, handCap: 12 });
        expect(config.enabled).toBe(false);
        expect(config.fixedValue).toBe(50);
        expect(config.handCap).toBe(12);
        expect(config.diamondSetBonus).toBe(3);
    });
    it('clamps diamond percent between 0 and 1', () => {
        expect((0, hiddenTreasures_1.clampDiamondsPercent)(-0.5)).toBe(0);
        expect((0, hiddenTreasures_1.clampDiamondsPercent)(2)).toBe(1);
        expect((0, hiddenTreasures_1.clampDiamondsPercent)(0.25)).toBe(0.25);
    });
    it('draws treasure based on configured probabilities', () => {
        const config = (0, hiddenTreasures_1.normalizeTreasureConfig)({ diamondsPercent: 0.1 });
        globals_1.jest.spyOn(Math, 'random').mockReturnValue(0.05);
        expect((0, hiddenTreasures_1.drawTreasure)(config)).toBe('diamond');
        globals_1.jest.spyOn(Math, 'random').mockReturnValue(0.2);
        expect((0, hiddenTreasures_1.drawTreasure)(config)).toBe('bronze');
        globals_1.jest.spyOn(Math, 'random').mockReturnValue(0.5);
        expect((0, hiddenTreasures_1.drawTreasure)(config)).toBe('silver');
        globals_1.jest.spyOn(Math, 'random').mockReturnValue(0.95);
        expect((0, hiddenTreasures_1.drawTreasure)(config)).toBe('gold');
    });
    it('finds redeemable sets by pattern', () => {
        const metals = ['bronze', 'bronze', 'bronze', 'diamond', 'gold', 'silver'];
        const matches = (0, hiddenTreasures_1.findRedeemableSets)(metals);
        const patterns = matches.map((match) => match.pattern);
        expect(patterns).toContain('three_of_a_kind');
        expect(patterns).toContain('diamond_combo');
        expect(patterns).toContain('one_of_each');
    });
    it('redeems a valid set and applies diamond bonus', () => {
        const config = (0, hiddenTreasures_1.normalizeTreasureConfig)({ payoutMode: 'classic', diamondSetBonus: 5 });
        const state = (0, hiddenTreasures_1.ensureTreasureState)(undefined);
        const hand = ['diamond', 'gold', 'silver', 'bronze'];
        const { troops, updatedHand, updatedState, hasDiamond } = (0, hiddenTreasures_1.redeemSet)(hand.slice(), [0, 1, 2], config, state);
        expect(troops).toBe(4 + 5);
        expect(updatedHand).toEqual(['bronze']);
        expect(updatedState.totalSetsCashed).toBe(1);
        expect(hasDiamond).toBe(true);
    });
    it('throws when attempting to redeem an invalid set', () => {
        const config = (0, hiddenTreasures_1.getDefaultTreasureConfig)();
        const state = (0, hiddenTreasures_1.ensureTreasureState)(undefined);
        expect(() => (0, hiddenTreasures_1.redeemSet)(['bronze', 'silver', 'silver'], [0, 1, 2], config, state)).toThrow('Invalid treasure set');
    });
    it('computes payout sequences correctly', () => {
        const config = (0, hiddenTreasures_1.normalizeTreasureConfig)({ payoutMode: 'triangular' });
        let state = (0, hiddenTreasures_1.ensureTreasureState)(undefined);
        const payouts = [];
        for (let i = 0; i < 5; i++) {
            const result = (0, hiddenTreasures_1.getPayout)(state, config);
            payouts.push(result.amount);
            state = result.state;
        }
        expect(payouts).toEqual([4, 6, 9, 13, 18]);
    });
    it('returns zero payout when mode is disabled', () => {
        const config = (0, hiddenTreasures_1.normalizeTreasureConfig)({ payoutMode: 'none' });
        const state = (0, hiddenTreasures_1.ensureTreasureState)(undefined);
        const result = (0, hiddenTreasures_1.getPayout)(state, config);
        expect(result.amount).toBe(0);
    });
});
//# sourceMappingURL=hiddenTreasures.test.js.map