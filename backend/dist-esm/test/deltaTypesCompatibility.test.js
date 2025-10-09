"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const deltaUpdates_js_1 = require("../types/deltaUpdates.js");
(0, globals_1.describe)('DeltaBuilder compatibility with shared GameDelta', () => {
    (0, globals_1.it)('territory update satisfies shared GameDelta', () => {
        const delta = deltaUpdates_js_1.DeltaBuilder.territoryUpdate('room-1', 't1', { armies: 5 });
        const typedDelta = delta;
        (0, globals_1.expect)(typedDelta.type).toBe('TERRITORY_UPDATE');
    });
    (0, globals_1.it)('phase change satisfies shared GameDelta', () => {
        const delta = deltaUpdates_js_1.DeltaBuilder.phaseChange('room-1', 'reinforcement', 'user-1', 3, 5);
        const typedDelta = delta;
        (0, globals_1.expect)(typedDelta.type).toBe('PHASE_CHANGE');
    });
    (0, globals_1.it)('battle result shape is compatible with shared GameDelta', () => {
        const delta = deltaUpdates_js_1.DeltaBuilder.battleResult('room-1', {
            fromTerritory: { id: 'a', armies: 3 },
            toTerritory: { id: 'b', armies: 2, ownerId: 'def' },
            conquered: false,
            attackerDice: [6, 5, 4],
            defenderDice: [6, 1],
            attackerLosses: 1,
            defenderLosses: 2,
        });
        const typedDelta = delta;
        (0, globals_1.expect)(typedDelta.type).toBe('BATTLE_RESULT');
    });
    (0, globals_1.it)('game end satisfies shared GameDelta', () => {
        const delta = deltaUpdates_js_1.DeltaBuilder.gameEnd('room-1', 'user-1', ['user-2']);
        const typedDelta = delta;
        (0, globals_1.expect)(typedDelta.type).toBe('GAME_END');
    });
});
//# sourceMappingURL=deltaTypesCompatibility.test.js.map