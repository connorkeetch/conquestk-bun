"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gameEngine_js_1 = require("../game/gameEngine.js");
function createConquestState() {
    return {
        roomId: 'room-1',
        players: [
            {
                id: 'attacker',
                username: 'Attacker',
                color: '#DC2626',
                armies: 0,
                territories: ['alpha'],
                cards: [],
                isEliminated: false,
            },
            {
                id: 'defender',
                username: 'Defender',
                color: '#2563EB',
                armies: 0,
                territories: ['beta'],
                cards: [],
                isEliminated: false,
            },
        ],
        currentPlayer: 'attacker',
        phase: 'attack',
        turn: 1,
        board: [
            {
                id: 'alpha',
                name: 'Alpha',
                sector: 'test',
                ownerId: 'attacker',
                armies: 5,
                adjacentTerritories: ['beta'],
            },
            {
                id: 'beta',
                name: 'Beta',
                sector: 'test',
                ownerId: 'defender',
                armies: 1,
                adjacentTerritories: ['alpha'],
            },
        ],
        cards: [],
        gameConfig: {
            movementType: 'classic_adjacent',
            maxPlayers: 2,
        },
        movementTracking: {},
        treasureState: undefined,
        mustCashInTreasures: false,
    };
}
(0, globals_1.describe)('GameEngine conquest transfers', () => {
    let engine;
    (0, globals_1.beforeEach)(() => {
        engine = new gameEngine_js_1.GameEngine();
    });
    function mockVictory() {
        const spy = globals_1.jest
            .spyOn(engine, 'simulateBattle')
            .mockReturnValue({
            attackerDice: [6],
            defenderDice: [1],
            attackerLosses: 0,
            defenderLosses: 1,
        });
        return spy;
    }
    async function executeConquest() {
        const state = createConquestState();
        const spy = mockVictory();
        const action = {
            type: 'attack',
            roomId: state.roomId,
            playerId: 'attacker',
            payload: { fromTerritoryId: 'alpha', toTerritoryId: 'beta' },
        };
        const { gameState, battleResult } = await engine.processAction(state, action);
        spy.mockRestore();
        return { state: gameState, battleResult };
    }
    (0, globals_1.it)('marks the conquering player as pending transfer', async () => {
        const { state, battleResult } = await executeConquest();
        (0, globals_1.expect)(battleResult?.conquered).toBe(true);
        (0, globals_1.expect)(battleResult?.pendingConquestFor).toBe('attacker');
        (0, globals_1.expect)(state.lastBattleResult?.pendingConquestFor).toBe('attacker');
    });
    (0, globals_1.it)('allows the conquering player to transfer armies and stay in attack phase', async () => {
        const { state } = await executeConquest();
        state.phase = 'attack';
        const updated = engine.transferConquestArmies(state, 'attacker', 'alpha', 'beta', 2);
        const from = updated.board.find((territory) => territory.id === 'alpha');
        const to = updated.board.find((territory) => territory.id === 'beta');
        (0, globals_1.expect)(from?.armies).toBe(2);
        (0, globals_1.expect)(to?.armies).toBe(3);
        (0, globals_1.expect)(updated.phase).toBe('attack');
        (0, globals_1.expect)(updated.lastBattleResult?.pendingConquestFor).toBeNull();
    });
    (0, globals_1.it)('rejects transfer attempts from non-conquering players', async () => {
        const { state } = await executeConquest();
        state.phase = 'attack';
        (0, globals_1.expect)(() => engine.transferConquestArmies(state, 'defender', 'alpha', 'beta', 1)).toThrow('Only the conquering player can transfer armies');
    });
});
//# sourceMappingURL=conquestTransfer.test.js.map