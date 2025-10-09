"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clampDiamondsPercent = exports.getDefaultTreasureConfig = void 0;
exports.normalizeTreasureConfig = normalizeTreasureConfig;
exports.drawTreasure = drawTreasure;
exports.getPayout = getPayout;
exports.findRedeemableSets = findRedeemableSets;
exports.redeemSet = redeemSet;
exports.ensureTreasureState = ensureTreasureState;
const CLASSIC_SEQUENCE = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35];
const DEFAULT_CONFIG = {
    enabled: true,
    diamondsPercent: 0.08,
    payoutMode: 'classic',
    fixedValue: 8,
    handCap: 5,
    diamondSetBonus: 3,
};
const getDefaultTreasureConfig = () => ({ ...DEFAULT_CONFIG });
exports.getDefaultTreasureConfig = getDefaultTreasureConfig;
const clampDiamondsPercent = (value) => {
    if (!Number.isFinite(value))
        return DEFAULT_CONFIG.diamondsPercent;
    if (value <= 0)
        return 0;
    if (value >= 1)
        return 1;
    return value;
};
exports.clampDiamondsPercent = clampDiamondsPercent;
function normalizeTreasureConfig(config) {
    const merged = {
        ...DEFAULT_CONFIG,
        ...(config ?? {}),
    };
    merged.diamondsPercent = (0, exports.clampDiamondsPercent)(typeof merged.diamondsPercent === 'number'
        ? merged.diamondsPercent
        : DEFAULT_CONFIG.diamondsPercent);
    if (merged.payoutMode === 'fixed') {
        if (typeof merged.fixedValue !== 'number' || Number.isNaN(merged.fixedValue)) {
            merged.fixedValue = DEFAULT_CONFIG.fixedValue;
        }
        else {
            merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)));
        }
    }
    else if (typeof merged.fixedValue === 'number') {
        merged.fixedValue = Math.max(1, Math.min(50, Math.trunc(merged.fixedValue)));
    }
    merged.handCap = Math.max(1, Math.trunc(merged.handCap));
    merged.diamondSetBonus = Math.max(0, Math.trunc(merged.diamondSetBonus));
    return merged;
}
function drawTreasure(config) {
    const roll = Math.random();
    if (roll < config.diamondsPercent) {
        return 'diamond';
    }
    const remaining = 1 - config.diamondsPercent;
    const slice = remaining / 3;
    const thresholds = [config.diamondsPercent + slice, config.diamondsPercent + slice * 2];
    if (roll < thresholds[0]) {
        return 'bronze';
    }
    if (roll < thresholds[1]) {
        return 'silver';
    }
    return 'gold';
}
function getPayout(state, config) {
    const nextIndex = state.nextPayoutIndex;
    let amount = 0;
    switch (config.payoutMode) {
        case 'classic': {
            if (nextIndex < CLASSIC_SEQUENCE.length) {
                amount = CLASSIC_SEQUENCE[nextIndex];
            }
            else {
                const overflowIndex = nextIndex - CLASSIC_SEQUENCE.length + 1;
                amount = CLASSIC_SEQUENCE[CLASSIC_SEQUENCE.length - 1] + overflowIndex * 5;
            }
            break;
        }
        case 'fixed': {
            amount = config.fixedValue ?? DEFAULT_CONFIG.fixedValue;
            break;
        }
        case 'none':
            amount = 0;
            break;
        default: {
            amount = computeTriangularPayout(nextIndex);
            break;
        }
    }
    const nextState = {
        totalSetsCashed: state.totalSetsCashed + 1,
        nextPayoutIndex: nextIndex + 1,
    };
    return { amount, state: nextState };
}
function computeTriangularPayout(index) {
    if (index <= 0) {
        return 4;
    }
    let payout = 4;
    let delta = 2;
    for (let i = 1; i <= index; i++) {
        payout += delta;
        delta += 1;
    }
    return payout;
}
function classifySet(metals) {
    const [a] = metals;
    const set = new Set(metals);
    const diamondCount = metals.filter((m) => m === 'diamond').length;
    if (diamondCount > 0) {
        return 'diamond_combo';
    }
    if (set.size === 1 && (a === 'bronze' || a === 'silver' || a === 'gold')) {
        return 'three_of_a_kind';
    }
    const metalsSorted = [...set].sort();
    if (metalsSorted.length === 3 &&
        metalsSorted[0] === 'bronze' &&
        metalsSorted[1] === 'gold' &&
        metalsSorted[2] === 'silver') {
        return 'one_of_each';
    }
    return null;
}
function findRedeemableSets(hand) {
    const matches = [];
    for (let i = 0; i < hand.length - 2; i++) {
        for (let j = i + 1; j < hand.length - 1; j++) {
            for (let k = j + 1; k < hand.length; k++) {
                const metals = [hand[i], hand[j], hand[k]];
                const pattern = classifySet(metals);
                if (!pattern)
                    continue;
                matches.push({
                    indices: [i, j, k],
                    metals,
                    pattern,
                    hasDiamond: metals.includes('diamond'),
                });
            }
        }
    }
    return matches;
}
function redeemSet(hand, indices, config, state) {
    const sorted = [...indices].sort((a, b) => a - b);
    if (new Set(sorted).size !== 3) {
        throw new Error('Treasure indices must be unique');
    }
    if (sorted.some((index) => index < 0 || index >= hand.length)) {
        throw new Error('Treasure index out of bounds');
    }
    const metals = [hand[sorted[0]], hand[sorted[1]], hand[sorted[2]]];
    const pattern = classifySet(metals);
    if (!pattern) {
        throw new Error('Invalid treasure set');
    }
    const { amount, state: updatedState } = getPayout(state, config);
    const hasDiamond = metals.includes('diamond');
    const bonus = hasDiamond ? config.diamondSetBonus : 0;
    const updatedHand = hand.filter((_, idx) => !sorted.includes(idx));
    return {
        troops: amount + bonus,
        updatedHand,
        updatedState,
        hasDiamond,
        pattern,
    };
}
function ensureTreasureState(state) {
    if (!state) {
        return {
            totalSetsCashed: 0,
            nextPayoutIndex: 0,
        };
    }
    return state;
}
//# sourceMappingURL=hiddenTreasures.js.map