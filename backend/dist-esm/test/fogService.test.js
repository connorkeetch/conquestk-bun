"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const fogService_js_1 = require("../services/fogService.js");
(0, globals_1.describe)('emitFogFilteredDelta', () => {
    const baseState = {
        roomId: 'room-1',
        players: [
            {
                id: 'player-1',
                username: 'Player One',
                color: '#ff0000',
                armies: 5,
                territories: ['territory-1'],
                cards: [],
                isEliminated: false,
            },
            {
                id: 'player-2',
                username: 'Player Two',
                color: '#0000ff',
                armies: 5,
                territories: ['territory-2'],
                cards: [],
                isEliminated: false,
            },
        ],
        currentPlayer: 'player-1',
        phase: 'reinforcement',
        turn: 1,
        board: [
            {
                id: 'territory-1',
                name: 'Alpha',
                sector: 'north',
                ownerId: 'player-1',
                armies: 3,
                adjacentTerritories: ['territory-2'],
            },
            {
                id: 'territory-2',
                name: 'Beta',
                sector: 'north',
                ownerId: 'player-2',
                armies: 2,
                adjacentTerritories: ['territory-1'],
            },
        ],
        cards: [],
        gameConfig: {
            movementType: 'classic_adjacent',
            maxPlayers: 6,
            fogOfWar: 'off',
        },
    };
    (0, globals_1.it)('broadcasts unfiltered delta when fog of war is disabled', async () => {
        const emitMock = globals_1.jest.fn();
        const fetchSockets = globals_1.jest.fn().mockResolvedValue([
            { id: 'socket-1', data: { userId: 'player-1' } },
            { id: 'socket-2', data: { userId: 'player-2' } },
        ]);
        const io = {
            to: globals_1.jest.fn(() => ({ emit: emitMock })),
            in: globals_1.jest.fn(() => ({ fetchSockets })),
        };
        const delta = {
            type: 'TERRITORY_UPDATE',
            roomId: 'room-1',
            timestamp: Date.now(),
            territoryId: 'territory-1',
            changes: { armies: 4 },
        };
        await (0, fogService_js_1.emitFogFilteredDelta)(io, 'room-1', delta, baseState);
        (0, globals_1.expect)(io.to).toHaveBeenCalledWith('game:room-1');
        (0, globals_1.expect)(emitMock).toHaveBeenCalledWith('game-delta', delta);
        (0, globals_1.expect)(fetchSockets).toHaveBeenCalled();
    });
});
//# sourceMappingURL=fogService.test.js.map